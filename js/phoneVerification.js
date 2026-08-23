// js/phoneVerification.js - Hardened Production Version (Fixed for Citizen Circle unlock)
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { RecaptchaVerifier, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { TIERS, refreshTierAndUI } from './tier.js';

let recaptchaVerifier = null;
let confirmationResult = null;

// Auto-enable demo only on localhost or query param
const isDemoMode = location.hostname === 'localhost' ||
                   location.hostname === '127.0.0.1' ||
                   location.search.includes('demo=true');

let demoCode = null;

/**
 * Shared helper – marks user as phone verified + unlocks Citizen Circle
 */
async function forceMarkPhoneVerified() {
  const userRef = doc(db, "users", auth.currentUser.uid);
  await updateDoc(userRef, {
    isPhoneVerified: true,
    hasVerifiedPhone: true,
    phoneVerifiedAt: serverTimestamp(),
    tier: TIERS?.CITIZEN_CIRCLE || "citizen_circle",
    reputation: 60,
    credibilityScore: 60,
    updatedAt: serverTimestamp()
  });

  if (typeof refreshTierAndUI === 'function') {
    refreshTierAndUI();
  }
}

/**
 * Initialize invisible reCAPTCHA safely
 */
export function initPhoneRecaptcha(buttonId = 'send-otp-btn') {
  if (recaptchaVerifier || isDemoMode) return;

  try {
    let btnContainer = document.getElementById(buttonId);
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.id = buttonId;
      btnContainer.style.display = 'none';
      document.body.appendChild(btnContainer);
    }

    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (_) {}
    }

    recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        showToast("reCAPTCHA expired. Please try again.", "error");
        recaptchaVerifier = null;
        window.recaptchaVerifier = null;
      }
    });

    window.recaptchaVerifier = recaptchaVerifier;
  } catch (e) {
    console.warn("reCAPTCHA init failed:", e);
    showToast("Security check failed to load. Refresh the page.", "error");
  }
}

/**
 * Setup event listeners for closing modal windows
 */
export function setupModalDismissListeners() {
  document.addEventListener('click', (e) => {
    const target = e.target;

    // Broad matching so the × button always works
    if (
      target.closest('.close-modal-btn') ||
      target.closest('.modal-close') ||
      target.closest('#closePhoneAuth') ||
      target.closest('[data-dismiss="modal"]') ||
      target.classList.contains('modal-backdrop') ||
      target.classList.contains('modal-overlay') ||
      target.textContent?.trim() === '×' ||
      target.textContent?.trim() === '✕' ||
      target.getAttribute('aria-label')?.toLowerCase().includes('close')
    ) {
      e.preventDefault();
      closeAllVerificationModals();
    }
  });
}

/**
 * Helper to dismiss all verification-related modals and reset reCAPTCHA
 */
export function closeAllVerificationModals() {
  const modalIds = [
    'phoneVerificationModal',
    'phone-upgrade-modal',
    'verificationModal',
    'phoneAuthModal'
  ];

  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  });

  // Also hide any generic modal that might be open
  document.querySelectorAll('.modal, [role="dialog"]').forEach(m => {
    if (m.id && modalIds.includes(m.id)) return;
    // only force-close if it looks like a phone modal
    if (m.textContent?.includes('Verify Phone') || m.textContent?.includes('Phone Number')) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
  });

  // Reset reCAPTCHA
  if (window.recaptchaVerifier || recaptchaVerifier) {
    try {
      if (recaptchaVerifier) recaptchaVerifier.clear();
      if (window.recaptchaVerifier) window.recaptchaVerifier.clear();
    } catch (_) {}
    recaptchaVerifier = null;
    window.recaptchaVerifier = null;
  }

  confirmationResult = null;
  window.confirmationResult = null;
}

// Auto-bind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupModalDismissListeners);
} else {
  setupModalDismissListeners();
}

/**
 * Main Entry Point
 */
export function startPhoneVerification() {
  if (!auth.currentUser) {
    showToast("Please log in to verify your phone number", "error");
    return;
  }

  const modal = document.getElementById('phoneVerificationModal') ||
                document.getElementById('phone-upgrade-modal') ||
                document.getElementById('verificationModal');

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  } else {
    const phone = prompt("Enter your phone number in international format (e.g., +2348012345678):");
    if (phone) {
      sendPhoneVerification(phone).then(success => {
        if (success) {
          const code = prompt("Enter the 6-digit verification code sent to your phone:");
          if (code) verifyPhoneCode(code);
        }
      });
    }
  }
}

/**
 * Send OTP
 */
export async function sendPhoneVerification(phoneNumber) {
  if (!phoneNumber || !phoneNumber.startsWith('+')) {
    showToast("Use international format, e.g. +2348012345678", "error");
    return false;
  }

  if (!auth.currentUser) {
    showToast("Please log in first", "error");
    return false;
  }

  // Demo mode
  if (isDemoMode) {
    demoCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`%c🔑 DEMO OTP for ${phoneNumber}: ${demoCode}`, "color: lime; font-size: 16px; font-weight: bold");
    showToast(`✅ Demo OTP generated! Check browser console (F12)`, "success");
    return true;
  }

  try {
    // Clean previous reCAPTCHA
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
      window.recaptchaVerifier = null;
    }

    initPhoneRecaptcha('send-otp-btn');

    if (!recaptchaVerifier) {
      showToast("reCAPTCHA not ready. Please refresh the page.", "error");
      return false;
    }

    confirmationResult = null;
    window.confirmationResult = null;

    confirmationResult = await linkWithPhoneNumber(
      auth.currentUser,
      phoneNumber,
      recaptchaVerifier
    );

    window.confirmationResult = confirmationResult;

    showToast(`✅ OTP sent to ${phoneNumber}`, "success");
    return true;

  } catch (e) {
    console.error("SMS Send Error:", e);

    // ========== KEY FIX: already-linked handling ==========
    if (e.code === 'auth/provider-already-linked') {
      const hasPhone = auth.currentUser.providerData.some(p => p.providerId === 'phone');

      if (hasPhone) {
        // Already verified on this account → just make sure Firestore is correct
        try {
          await forceMarkPhoneVerified();
        } catch (_) {}
        
        // Softer message (no more scary red error for already-verified users)
        showToast("You are already phone verified (Citizen Circle).", "success");
        closeAllVerificationModals();
        return true;
      }

      showToast("This phone number is already linked to another account.", "error");
      return false;
    }

    // Other errors
    let msg = e.message || "Failed to send OTP";
    if (e.code === 'auth/too-many-requests') msg = "Too many attempts. Wait a few minutes.";
    if (e.code === 'auth/invalid-phone-number') msg = "Invalid phone number format.";
    if (e.code === 'auth/quota-exceeded') msg = "SMS quota exceeded. Try again later.";
    if (e.code === 'auth/captcha-check-failed') msg = "Security check failed. Refresh and try again.";
    if (e.code === 'auth/credential-already-in-use') msg = "This phone number is already linked to another account.";

    showToast(msg, "error");

    // Clean reCAPTCHA so user can retry
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
      window.recaptchaVerifier = null;
    }

    return false;
  }
}

/**
 * Confirm code + upgrade tier
 */
export async function verifyPhoneCode(enteredCode) {
  if (!auth.currentUser) {
    showToast("Please log in first", "error");
    return false;
  }

  const code = String(enteredCode || "").replace(/\D/g, "").trim();

  if (code.length !== 6) {
    showToast("Enter the 6-digit code", "error");
    return false;
  }

  try {
    if (isDemoMode) {
      if (code !== demoCode) {
        showToast("❌ Incorrect code. Try again.", "error");
        return false;
      }
    } else {
      const result = confirmationResult || window.confirmationResult;

      if (!result) {
        showToast("No active verification. Please resend the code.", "error");
        return false;
      }

      await result.confirm(code);
    }

    // Success → unlock Citizen Circle
    await forceMarkPhoneVerified();

    showToast("🎉 Phone Verified! You are now in Citizen Circle", "success");
    closeAllVerificationModals();
    return true;

  } catch (e) {
    console.error("Verification Error:", e);

    let msg = "Invalid code or verification failed.";
    if (e.code === "auth/invalid-verification-code") {
      msg = "Incorrect code. Please check and try again.";
    } else if (e.code === "auth/code-expired") {
      msg = "Code has expired. Please request a new one.";
    } else if (e.code === "auth/credential-already-in-use") {
      msg = "This phone number is already linked to another account.";
    }

    showToast(msg, "error");
    return false;
  }
}

// Global Exports
window.startPhoneVerification = startPhoneVerification;
window.sendPhoneVerification = sendPhoneVerification;
window.verifyPhoneCode = verifyPhoneCode;
window.initPhoneRecaptcha = initPhoneRecaptcha;
window.closeAllVerificationModals = closeAllVerificationModals;
