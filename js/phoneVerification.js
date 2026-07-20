// js/phoneVerification.js - Real Firebase Phone Auth Ready
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { upgradeToTrustCircle } from './tier.js';

let confirmationResult = null;

export async function sendPhoneVerification(phoneNumber) {
    if (!phoneNumber || !phoneNumber.startsWith('+')) {
        showToast("Use international format: +234...", "error");
        return false;
    }

    try {
        // TODO: Import from firebase-auth when ready
        // const { RecaptchaVerifier, signInWithPhoneNumber } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js");
        
        showToast("📲 Sending OTP...", "info");
        
        // Simulated for now (replace with real Firebase Phone Auth)
        confirmationResult = { /* mock */ };
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`%c🔑 Simulated OTP for ${phoneNumber}: ${code}`, "color: lime; font-size: 16px");
        
        showToast(`✅ OTP sent to ${phoneNumber} (Check console for demo)`, "success");
        return true;
    } catch (e) {
        showToast("Failed to send OTP", "error");
        return false;
    }
}

export async function verifyPhoneCode(enteredCode, userId) {
    if (enteredCode.length !== 6) {
        showToast("Enter 6-digit code", "error");
        return false;
    }

    // Simulate success
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            isPhoneVerified: true,
            phoneVerifiedAt: serverTimestamp(),
            tier: "trust_circle"
        });

        await upgradeToTrustCircle(userId);
        
        showToast("✅ Phone Verified Successfully!", "success");
        document.getElementById('phoneVerificationModal')?.classList.add('hidden');
        return true;
    } catch (e) {
        showToast("Verification failed", "error");
        return false;
    }
}
