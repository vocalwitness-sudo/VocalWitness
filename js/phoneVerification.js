// js/phoneVerification.js - Connected to Tiers & Firebase
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { RecaptchaVerifier, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { TIERS, refreshTierAndUI } from './tier.js';

let recaptchaVerifier = null;
let confirmationResult = null;
let isDemoMode = false; // Toggle true for local dev, false for production Firebase SMS
let demoCode = null;

/**
 * Initialize invisible reCAPTCHA for phone authentication
 */
export function initPhoneRecaptcha(buttonId = 'send-otp-btn') {
    if (!recaptchaVerifier && !isDemoMode) {
        try {
            recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
                'size': 'invisible',
                'callback': () => {},
                'expired-callback': () => {
                    showToast("reCAPTCHA expired. Please try again.", "error");
                }
            });
        } catch (e) {
            console.warn("reCAPTCHA initialization skipped or failed:", e);
        }
    }
}

/**
 * Send OTP via Firebase Auth or Demo Mode
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

    if (isDemoMode) {
        demoCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`%c🔑 DEMO OTP for ${phoneNumber}: ${demoCode}`, "color: lime; font-size: 15px; font-weight: bold");
        showToast(`✅ Demo OTP generated! Check browser console.`, "success");
        return true;
    }

    try {
        initPhoneRecaptcha();
        confirmationResult = await linkWithPhoneNumber(auth.currentUser, phoneNumber, recaptchaVerifier);
        showToast(`✅ OTP sent to ${phoneNumber}`, "success");
        return true;
    } catch (e) {
        console.error("SMS Send Error:", e);
        showToast(e.message || "Failed to send OTP", "error");
        if (recaptchaVerifier && recaptchaVerifier.render) {
            recaptchaVerifier.render().then(id => window.grecaptcha?.reset(id));
        }
        return false;
    }
}

/**
 * Confirm 6-Digit Code and upgrade user tier
 */
export async function verifyPhoneCode(enteredCode) {
    if (!auth.currentUser) {
        showToast("Please log in first", "error");
        return false;
    }

    if (!enteredCode || enteredCode.length !== 6) {
        showToast("Enter 6-digit code", "error");
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
                showToast("No active SMS verification session. Resend code.", "error");
                return false;
            }
            await confirmationResult.confirm(enteredCode);
        }

        // Standardize Firestore updates across modules
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            isPhoneVerified: true,
            phoneVerifiedAt: serverTimestamp(),
            tier: TIERS.CITIZEN_CIRCLE,
            reputation: 60, // Standardized field matching tier.js
            credibilityScore: 60
        });

        refreshTierAndUI();
        
        showToast("🎉 Phone Verified! You are now in Citizen Circle", "success");
        
        // Hide modal on success
        const modal = document.getElementById('phoneVerificationModal') || document.getElementById('phone-upgrade-modal');
        if (modal) modal.classList.add('hidden');
        
        return true;

    } catch (e) {
        console.error("Verification Error:", e);
        showToast("Invalid code or verification failed.", "error");
        return false;
    }
}
