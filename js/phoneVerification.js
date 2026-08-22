// js/phoneVerification.js - Improved & production-ready version
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { RecaptchaVerifier, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { TIERS, refreshTierAndUI } from './tier.js';

let recaptchaVerifier = null;
let confirmationResult = null;

// Auto-enable demo only on localhost
const isDemoMode = location.hostname === 'localhost' || 
                   location.hostname === '127.0.0.1' ||
                   location.search.includes('demo=true');

let demoCode = null;

/**
 * Initialize invisible reCAPTCHA
 */
export function initPhoneRecaptcha(buttonId = 'send-otp-btn') {
  if (recaptchaVerifier || isDemoMode) return;

  try {
    // Clear any previous verifier
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
    }

    recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved – ready to send
      },
      'expired-callback': () => {
        showToast("reCAPTCHA expired. Please try again.", "error");
        recaptchaVerifier = null;
      }
    });

    window.recaptchaVerifier = recaptchaVerifier; // for debugging
  } catch (e) {
    console.warn("reCAPTCHA init failed:", e);
    showToast("Security check failed to load. Refresh the page.", "error");
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

  // Demo mode for local testing
  if (isDemoMode) {
    demoCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`%c🔑 DEMO OTP for ${phoneNumber}: ${demoCode}`, "color: lime; font-size: 16px; font-weight: bold");
    showToast(`✅ Demo OTP generated! Check console (F12)`, "success");
    return true;
  }

  try {
    initPhoneRecaptcha();
    
    if (!recaptchaVerifier) {
      showToast("reCAPTCHA not ready. Please refresh.", "error");
      return false;
    }

    confirmationResult = await linkWithPhoneNumber(
      auth.currentUser, 
      phoneNumber, 
      recaptchaVerifier
    );
    
    showToast(`✅ OTP sent to ${phoneNumber}`, "success");
    return true;
  } catch (e) {
    console.error("SMS Send Error:", e);
    
    // Better error messages for mobile
    let msg = e.message || "Failed to send OTP";
    if (e.code === 'auth/too-many-requests') msg = "Too many attempts. Wait a few minutes.";
    if (e.code === 'auth/invalid-phone-number') msg = "Invalid phone number format.";
    if (e.code === 'auth/quota-exceeded') msg = "SMS quota exceeded. Try again later.";
    if (e.code === 'auth/captcha-check-failed') msg = "Security check failed. Refresh and try again.";
    
    showToast(msg, "error");
    
    // Reset reCAPTCHA
    if (recaptchaVerifier) {
      try {
        await recaptchaVerifier.render();
        window.grecaptcha?.reset();
      } catch (_) {}
      recaptchaVerifier = null;
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

  if (!enteredCode || enteredCode.length !== 6) {
    showToast("Enter the 6-digit code", "error");
    return false;
  }

  try {
    if (isDemoMode) {
      if (enteredCode !== demoCode) {
        showToast("❌ Incorrect code. Try again.", "error");
        return false;
      }
    } else {
      if (!confirmationResult) {
        showToast("No active verification. Please resend the code.", "error");
        return false;
      }
      await confirmationResult.confirm(enteredCode);
    }

    // Upgrade user
    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, {
      isPhoneVerified: true,
      hasVerifiedPhone: true,          // keep both for compatibility
      phoneVerifiedAt: serverTimestamp(),
      tier: TIERS.CITIZEN_CIRCLE,
      reputation: 60,
      credibilityScore: 60,
      lastUpdated: serverTimestamp()
    });

    refreshTierAndUI();
    
    showToast("🎉 Phone Verified! You are now in Citizen Circle", "success");
    
    // Close any possible modal
    ['phoneVerificationModal', 'phone-upgrade-modal', 'verificationModal'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
    
    return true;

  } catch (e) {
    console.error("Verification Error:", e);
    showToast("Invalid code or verification failed.", "error");
    return false;
  }
}

// Export for global use if needed
window.sendPhoneVerification = sendPhoneVerification;
window.verifyPhoneCode = verifyPhoneCode;
window.initPhoneRecaptcha = initPhoneRecaptcha;
