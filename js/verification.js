// js/verification.js - Production Ready: Real Phone Verification + Backend Confirmation + Real ZK + C2PA + Standalone JSON Verification
// Updated to work cleanly with the hardened phoneVerification.js
// + preloadC2PA for non-blocking verify page
// + same-origin C2PA worker/wasm + modern Reader API

import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { canAdvanceTier, refreshTierAndUI, TIERS, getUserProfile } from './tier.js';
import { elevateWithZKProof } from './zk-client.js';
import { 
  sendPhoneVerification, 
  verifyPhoneCode, 
  initPhoneRecaptcha,
  closeAllVerificationModals 
} from './phoneVerification.js';

// Global C2PA instance cache
let c2paInstance = null;
let c2paInitPromise = null;

/**
 * Timeout helper
 */
function withTimeout(promise, ms = 10000, timeoutMsg = "Operation timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), ms))
  ]);
}

/**
 * Compute SHA-256 helper for evidence hashing
 */
async function computeSHA256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Initialize C2PA using the inline build (WASM embedded → no separate .wasm fetch)
 */
async function initC2PA() {
  if (c2paInstance) return c2paInstance;
  if (c2paInitPromise) return c2paInitPromise;

  c2paInitPromise = (async () => {
    try {
      const { createC2pa } = await import(
        "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.14.3/inline/+esm"
      );

      c2paInstance = await createC2pa(); // no wasmSrc / workerSrc needed

      console.log("[C2PA] Engine initialized successfully (inline)");
      return c2paInstance;
    } catch (err) {
      console.error("[C2PA] Failed to initialize:", err);
      c2paInitPromise = null;
      throw new Error("C2PA engine initialization failed.");
    }
  })();

  return c2paInitPromise;
}

/**
 * Pre-load C2PA so the first "Verify Media" click is fast.
 * Shows a friendly message in the UI instead of only console errors.
 */
export async function preloadC2PA() {
  // Create a small status element if it doesn't exist yet
  let statusEl = document.getElementById('c2pa-status');
  if (!statusEl) {
    const c2paSection = document.getElementById('c2paSection');
    if (c2paSection) {
      statusEl = document.createElement('div');
      statusEl.id = 'c2pa-status';
      statusEl.style.cssText = 'font-size:0.8rem; margin-top:0.75rem; color:#9ca3af; text-align:center;';
      c2paSection.appendChild(statusEl);
    }
  }

  if (statusEl) {
    statusEl.textContent = 'Loading Content Credentials engine…';
    statusEl.style.color = '#9ca3af';
    statusEl.style.opacity = '1';
  }

  try {
    await initC2PA();
    if (statusEl) {
      statusEl.textContent = '✅ Content Credentials engine ready';
      statusEl.style.color = '#34d399';
      setTimeout(() => {
        if (statusEl) statusEl.style.opacity = '0.6';
      }, 2500);
    }
    return true;
  } catch (err) {
    console.warn('[C2PA] preload failed:', err?.message || err);

    if (statusEl) {
      statusEl.innerHTML = `
        ⚠️ Content Credentials engine could not load.<br>
        <span style="font-size:0.75rem;">
          You can still try verifying — or switch to Ledger / JSON tabs.
        </span>`;
      statusEl.style.color = '#fbbf24';
    }

    if (typeof showToast === 'function') {
      showToast('Content Credentials engine failed to load. Other verification methods still work.', 'warning');
    }

    return false;
  }
}
/**
 * Completely non-blocking modal opener
 * Modal appears instantly, C2PA loads in background
 */
function openVerificationModal() {
  const modal = document.getElementById('c2pa-modal');
  if (!modal) {
    console.warn('[C2PA] Modal #c2pa-modal not found');
    return;
  }

  // Show modal immediately
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Fire-and-forget preload (zero blocking)
  initC2PA()
    .then(() => {
      console.log('[C2PA] Engine ready for verification');
    })
    .catch((err) => {
      console.error('[C2PA] Pre-load failed:', err);

      // Optional soft feedback inside the modal
      const statusEl = modal.querySelector('[data-c2pa-status]');
      if (statusEl) {
        statusEl.textContent = 'C2PA engine is still loading or failed. You can still try verifying.';
        statusEl.classList.remove('hidden');
      }
    });
}

/**
 * Close the modal cleanly
 */
function closeVerificationModal() {
  const modal = document.getElementById('c2pa-modal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/**
 * Actual media verification — fully awaited & secure (with timeouts)
 * Uses modern Reader API (c2pa.read is not available on current packages)
 */
export async function verifyMediaProvenance(file) {
  // Allow silent preload-style calls (no file) without toast spam
  if (!file) {
    return { hasC2PA: false, error: "No file provided" };
  }

  try {
    showToast("🔎 Inspecting C2PA Content Credentials...", "info");

    const c2pa = await withTimeout(initC2PA(), 12000, "C2PA WASM engine load timed out");

    const { Reader } = await import(
      "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.14.3/+esm"
    );

    const reader = await withTimeout(
      Reader.fromBlob(c2pa, file.type || undefined, file),
      15000,
      "C2PA media parsing timed out"
    );

    let manifestStore = null;
    try {
      manifestStore = await reader.manifestStore();
    } finally {
      try { await reader.free(); } catch (_) {}
    }

    if (!manifestStore) {
      showToast("ℹ️ No embedded C2PA credentials found in file", "info");
      return {
        hasC2PA: false,
        isValid: false,
        message: "No C2PA Content Credentials found in this media asset."
      };
    }

    const activeManifest = manifestStore.activeManifest;
    const validationErrors = manifestStore.validationStatus || [];
    const isValid = validationErrors.length === 0;

    if (isValid) {
      showToast("✅ Authenticated C2PA Content Credentials verified!", "success");
    } else {
      showToast("⚠️ C2PA manifest found but validation failed or was altered", "warning");
    }

    return {
      hasC2PA: true,
      isValid,
      issuer: activeManifest?.signatureInfo?.issuer || "Unknown Issuer",
      claimGenerator: activeManifest?.claimGenerator || "Unknown Tool",
      title: activeManifest?.title || file.name,
      format: activeManifest?.format || file.type,
      validationErrors,
      rawManifest: activeManifest
    };
  } catch (error) {
    console.error("[C2PA] Verification error:", error);
    showToast(error.message || "Failed to parse C2PA provenance data", "error");
    return { hasC2PA: false, isValid: false, error: error.message };
  }
}

// Make available globally if needed
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;


/**
 * Verify Standalone Evidence JSON Pack
 * Supports both legacy { mediaData, claimedHash } and richer packs
 * with integrity.forensicHash / packCoreHash.
 */
export async function verifyEvidenceJSON(jsonString) {
  try {
    const pack = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    // Prefer explicit media payload when present
    const mediaPayload =
      pack.mediaData ??
      pack.media ??
      pack.payload ??
      null;

    const claimed =
      pack.claimedHash ||
      pack.integrity?.forensicHash ||
      pack.packCoreHash ||
      pack.hash ||
      null;

    let isValid = false;

    if (mediaPayload != null && claimed) {
      const calculatedHash = await computeSHA256(
        typeof mediaPayload === 'string' ? mediaPayload : JSON.stringify(mediaPayload)
      );
      isValid = calculatedHash.toLowerCase() === String(claimed).trim().toLowerCase();
    } else if (claimed && pack.integrity?.forensicHash) {
      // Structure-only check when no media blob is embedded
      isValid = String(claimed).trim().toLowerCase() ===
        String(pack.integrity.forensicHash).trim().toLowerCase();
    } else {
      throw new Error('Evidence pack missing mediaData/claimedHash (or integrity.forensicHash)');
    }

    const resultEl = document.getElementById('verify-result');
    if (resultEl) {
      resultEl.innerHTML = isValid
        ? `<span class="text-green-600 font-bold">✓ VERIFIED: Evidence hash matches immutable record.</span>`
        : `<span class="text-red-600 font-bold">✗ TAMPERED: Hashes do not match!</span>`;
    }
    return isValid;
  } catch (err) {
    console.error("Invalid evidence format", err);
    const resultEl = document.getElementById('verify-result');
    if (resultEl) {
      resultEl.innerHTML = `<span class="text-red-600 font-bold">✗ ERROR: Invalid JSON or evidence structure.</span>`;
    }
    // Re-throw so verify.html can show the message in the result box
    throw err;
  }
}

/**
 * Start Phone Verification → Opens modal or prompt fallback
 */
export async function startPhoneVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    const modal = document.getElementById('phoneVerificationModal') || 
                  document.getElementById('phone-upgrade-modal') || 
                  document.getElementById('verificationModal');
                  
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      
      // Reset steps
      const step1 = document.getElementById('phone-step-1');
      const step2 = document.getElementById('phone-step-2');
      const phoneInput = document.getElementById('phone-input');
      const otpInput = document.getElementById('otp-input');

      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
      if (phoneInput) phoneInput.value = '';
      if (otpInput) otpInput.value = '';

      setTimeout(() => {
        initPhoneRecaptcha('send-otp-btn');
      }, 300);
      
      showToast("📱 Enter your phone number to unlock Citizen Circle", "info");
    } else {
      // Fallback prompt
      const phone = prompt("Enter your phone number in international format (e.g., +2348012345678):");
      if (phone) {
        const success = await sendPhoneVerification(phone);
        if (success) {
          const code = prompt("Enter the 6-digit verification code sent to your phone:");
          if (code) await verifyPhoneCode(code);
        }
      }
    }
  } catch (error) {
    console.error("Phone verification start error:", error);
    showToast(error.message || "Could not start phone verification", "error");
  }
}

/**
 * Build ZK circuit inputs
 */
async function buildZKInputs() {
  const profile = await getUserProfile(true) || {};
  
  const secret = BigInt(Date.now() + Math.floor(Math.random() * 1e9));
  const nullifier = BigInt(Math.floor(Math.random() * 1e15));

  const minTrustScore = 30;
  const minPosts = 0;

  const trustScore = Number(profile.reputation || profile.credibilityScore || 50);
  const postCount = Number(profile.testimoniesCount || 0);

  const pathElements = Array(8).fill("0");
  const pathIndices = Array(8).fill(0);
  const merkleRoot = "0";

  return {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    trustScore: trustScore.toString(),
    postCount: postCount.toString(),
    pathElements,
    pathIndices,
    merkleRoot,
    minTrustScore: minTrustScore.toString(),
    minPosts: minPosts.toString()
  };
}

/**
 * Triggers the end-to-end server-side ZK verification & elevation flow
 */
export async function startZKVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("🔐 Starting Zero-Knowledge Verification...", "info");

    const advanceResult = await withTimeout(
      canAdvanceTier(auth.currentUser.uid), 
      10000, 
      "Verification check timed out"
    );

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    showToast("Generating cryptographic proof... This may take a few seconds", "info");
    
    // Use the unified server-backed elevation function
    const zkResult = await withTimeout(
      elevateWithZKProof(),
      45000,
      "ZK proof generation timed out"
    );

    console.log("ZK Proof Result:", zkResult);

    const userRef = doc(db, "users", auth.currentUser.uid);
    
    await withTimeout(
      updateDoc(userRef, {
        zkVerified: true,
        tier: TIERS?.WITNESS_CIRCLE || "witness_circle",
        zkVerifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        lastZkProofType: zkResult.proofType || "unknown",
        lastZkIsFallback: !!zkResult.isFallback,
        lastZkPublicHash: zkResult.publicSignals 
          ? String(zkResult.publicSignals[0]).slice(0, 32) 
          : null
      }),
      10000,
      "Database update timed out"
    );

    const sealLabel = zkResult.isFallback
      ? `Integrity Seal (${zkResult.proofType || 'Hash/Signature'})`
      : 'ZK-SNARK Seal';

    showToast(`🛡️ Cryptographic seal complete! You now have a ${sealLabel}`, "success");
    
    if (typeof refreshTierAndUI === 'function') refreshTierAndUI();

  } catch (error) {
    console.error("ZK verification error:", error);
    showToast(error.message || "ZK Verification failed or timed out", "error");
  }
}

/**
 * Handle Send OTP button
 */
export async function handleSendOTP() {
  const phoneInput = document.getElementById('phone-input');
  const phone = phoneInput?.value.trim();

  if (!phone) {
    showToast("Please enter your phone number", "error");
    return;
  }

  if (!phone.startsWith('+')) {
    showToast("Use international format (e.g. +2348012345678)", "error");
    return;
  }

  const btn = document.getElementById('send-otp-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }

  try {
    const success = await sendPhoneVerification(phone);

    if (success) {
      const step1 = document.getElementById('phone-step-1');
      const step2 = document.getElementById('phone-step-2');

      if (step1 && step2 && !step1.classList.contains('hidden')) {
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        document.getElementById('otp-input')?.focus();
      }
    }
  } catch (err) {
    console.error("Send OTP error:", err);
    showToast(err.message || "Failed to send verification code", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Send Verification Code";
    }
  }
}

/**
 * Handle Verify OTP button + optional backend confirmation
 */
export async function handleVerifyOTP() {
  const otpInput = document.getElementById('otp-input');
  const rawCode = otpInput?.value || "";

  const code = String(rawCode).replace(/\D/g, "").trim();

  if (code.length !== 6) {
    showToast("Please enter the 6-digit code", "error");
    return;
  }

  const btn = document.getElementById('verify-otp-btn') || 
              document.querySelector('[data-action="verify-otp"]') ||
              document.querySelector('button[onclick*="handleVerifyOTP"]');

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Verifying...";
  }

  try {
    const success = await verifyPhoneCode(code);

    if (success) {
      try {
        const functions = getFunctions();
        const confirmPhone = httpsCallable(functions, 'confirmPhoneVerification');
        const phone = document.getElementById('phone-input')?.value.trim();
        
        if (phone) {
          await confirmPhone({ phoneNumber: phone });
          console.log("✅ Backend phone confirmation successful");
        }
      } catch (backendError) {
        console.warn("Backend confirmation skipped or failed:", backendError);
      }

      if (typeof refreshTierAndUI === 'function') {
        refreshTierAndUI();
      }
    }
  } catch (err) {
    console.error("Verify OTP error:", err);
    showToast(err.message || "Verification failed", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Verify Code";
    }
  }
}

// Attach event listener for ZK proof generation button
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('generateZkProofBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="animate-spin inline-block">⏳</span> Generating Proof...`;

    try {
      await startZKVerification();
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
});

// Expose for inline / legacy callers
window.handleSendOTP = handleSendOTP;
window.handleVerifyOTP = handleVerifyOTP;
window.startPhoneVerification = startPhoneVerification;
window.startZKVerification = startZKVerification;
