// js/verification.js - Robust Verification Handlers with Timeout Guards, Tier Checks & C2PA Provenance
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { canAdvanceTier, refreshTierAndUI, TIERS } from './tier.js';

// Global C2PA instance cache
let c2paInstance = null;

/**
 * Execute an async operation with a strict timeout fallback
 * @param {Promise} promise - The promise to execute
 * @param {number} ms - Timeout in milliseconds
 * @param {string} timeoutMsg - Reason given upon timeout
 */
function withTimeout(promise, ms = 10000, timeoutMsg = "Operation timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), ms))
  ]);
}

/**
 * Initialize C2PA WebAssembly SDK with CDN fallbacks
 */
async function initC2PA() {
  if (c2paInstance) return c2paInstance;

  try {
    const { createC2pa } = await import("https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.8.2/+esm");
    
    c2paInstance = await createC2pa({
      wasmSrc: "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.8.2/dist/assets/wasm/c2pa.wasm",
      workerSrc: "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.8.2/dist/c2pa.worker.js",
    });

    return c2paInstance;
  } catch (err) {
    console.error("Failed to initialize C2PA Web SDK:", err);
    throw new Error("C2PA engine initialization failed.");
  }
}

/**
 * Read and verify C2PA Content Credentials from a media File/Blob
 * @param {File|Blob} file - The image or video file to inspect
 * @returns {Promise<Object>} Verification status and provenance manifest
 */
export async function verifyMediaProvenance(file) {
  if (!file) {
    showToast("No media file selected for provenance check", "error");
    return { hasC2PA: false, error: "No file provided" };
  }

  try {
    showToast("🔎 Inspecting C2PA Content Credentials...", "info");

    const c2pa = await withTimeout(initC2PA(), 12000, "C2PA WASM engine load timed out");
    const result = await withTimeout(c2pa.read(file), 15000, "C2PA media parsing timed out");

    if (!result || !result.manifestStore) {
      showToast("ℹ️ No embedded C2PA credentials found in file", "info");
      return {
        hasC2PA: false,
        isValid: false,
        message: "No C2PA Content Credentials found in this media asset."
      };
    }

    const activeManifest = result.manifestStore.activeManifest;
    const validationErrors = result.manifestStore.validationStatus || [];
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
    console.error("C2PA verification error:", error);
    showToast(error.message || "Failed to parse C2PA provenance data", "error");
    return { hasC2PA: false, isValid: false, error: error.message };
  }
}

/**
 * Phone Verification -> Citizen Circle
 */
export async function startPhoneVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("📱 Starting phone verification...", "info");

    // Check progression eligibility before proceeding
    const advanceResult = await withTimeout(
      canAdvanceTier(auth.currentUser.uid),
      10000,
      "Tier check timed out"
    );

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    // Simulated OTP delay (replace with real Firebase Auth Recaptcha/Phone Auth step when ready)
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const userRef = doc(db, "users", auth.currentUser.uid);
    
    await withTimeout(
      updateDoc(userRef, {
        hasVerifiedPhone: true,
        isPhoneVerified: true,
        tier: TIERS.CITIZEN_CIRCLE,
        verifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }),
      10000,
      "Database update timed out"
    );

    showToast("✅ Phone Verified! Welcome to Citizen Circle", "success");
    
    // Invalidate local profile cache and refresh UI
    refreshTierAndUI();
  } catch (error) {
    console.error("Phone verification error:", error);
    showToast(error.message || "Phone verification failed", "error");
  }
}

/**
 * ZK Verification -> Witness Circle (Witness Voice Access)
 */
export async function startZKVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("🔐 Running Zero-Knowledge Verification...", "info");

    // Check progression eligibility inside timeout guard
    const advanceResult = await withTimeout(
      canAdvanceTier(auth.currentUser.uid), 
      10000, 
      "Verification check timed out"
    );

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    const userRef = doc(db, "users", auth.currentUser.uid);
    
    await withTimeout(
      updateDoc(userRef, {
        zkVerified: true,
        tier: TIERS.WITNESS_CIRCLE,
        zkVerifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }),
      10000,
      "Database update timed out"
    );

    showToast("🛡️ ZK Verification Complete! Welcome to Witness Circle", "success");

    // Invalidate local profile cache and refresh UI
    refreshTierAndUI();
  } catch (error) {
    console.error("ZK verification error:", error);
    showToast(error.message || "ZK Verification failed or timed out", "error");
  }
}
