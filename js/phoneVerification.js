// js/phoneVerification.js - Hardened Production Version

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
 * Initialize invisible reCAPTCHA safely
 */
export function initPhoneRecaptcha(buttonId = 'send-otp-btn') {
  if (recaptchaVerifier || isDemoMode) return;

  try {
    // Check if target container exists, create fallback if not
    let btnContainer = document.getElementById(buttonId);
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.id = buttonId;
      btnContainer.style.display = 'none';
      document.body.appendChild(btnContainer);
    }

    // Clear any previous verifier
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (_) {}
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

    window.recaptchaVerifier = recaptchaVerifier;
  } catch (e) {
    console.warn("reCAPTCHA init failed:", e);
    showToast("Security check failed to load. Refresh the page.", "error");
  }
}

/**
 * Main Entry Point: Triggered by Profile / UI Buttons
 */
export function startPhoneVerification() {
  if (!auth.currentUser) {
    showToast("Please log in to verify your phone number", "error");
    return;
  }

  // Look for any existing verification modal in DOM
  const modal = document.getElementById('phoneVerificationModal') || 
                document.getElementById('phone-upgrade-modal') || 
                document.getElementById('verificationModal');

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  } else {
    // If no modal exists in HTML, prompt for phone number via input dialog
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

  // Demo mode for local testing
  if (isDemoMode) {
    demoCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`%c🔑 DEMO OTP for ${phoneNumber}: ${demoCode}`, "color: lime; font-size: 16px; font-weight: bold");
    showToast(`✅ Demo OTP generated! Check browser console (F12)`, "success");
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
    
    let msg = e.message || "Failed to send OTP";
    if (e.code === 'auth/too-many-requests') msg = "Too many attempts. Wait a few minutes.";
    if (e.code === 'auth/invalid-phone-number') msg = "Invalid phone number format.";
    if (e.code === 'auth/quota-exceeded') msg = "SMS quota exceeded. Try again later.";
    if (e.code === 'auth/captcha-check-failed') msg = "Security check failed. Refresh and try again.";
    if (e.code === 'auth/credential-already-in-use') msg = "This phone number is already linked to another account.";
    
    showToast(msg, "error");
    
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

    // Upgrade user in Firestore
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
    
    showToast("🎉 Phone Verified! You are now in Citizen Circle", "success");
    
    // Close modals
    ['phoneVerificationModal', 'phone-upgrade-modal', 'verificationModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
    });
    
    return true;

  } catch (e) {
    console.error("Verification Error:", e);
    showToast("Invalid code or verification failed.", "error");
    return false;
  }
}

// Global Exports
window.startPhoneVerification = startPhoneVerification;
window.sendPhoneVerification = sendPhoneVerification;
window.verifyPhoneCode = verifyPhoneCode;
window.initPhoneRecaptcha = initPhoneRecaptcha;
