// js/phoneVerification.js - Connected to Tiers & Firebase
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { TIERS, updateTierBadge } from './tier.js';

let currentVerificationCode = null;

export async function sendPhoneVerification(phoneNumber) {
    if (!phoneNumber || !phoneNumber.startsWith('+')) {
        showToast("Use international format, e.g. +2348012345678", "error");
        return false;
    }

    try {
        currentVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        console.log(`%c🔑 DEMO OTP for ${phoneNumber}: ${currentVerificationCode}`, "color: lime; font-size: 15px; font-weight: bold");

        showToast(`✅ OTP sent to ${phoneNumber} (Demo - check console)`, "success");
        return true;
    } catch (e) {
        showToast("Failed to send OTP", "error");
        return false;
    }
}

export async function verifyPhoneCode(enteredCode) {
    if (!auth.currentUser) {
        showToast("Please log in first", "error");
        return false;
    }

    if (!enteredCode || enteredCode.length !== 6) {
        showToast("Enter 6-digit code", "error");
        return false;
    }

    if (enteredCode === currentVerificationCode) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, {
                isPhoneVerified: true,
                phoneVerifiedAt: serverTimestamp(),
                tier: TIERS.CITIZEN_CIRCLE,
                credibilityScore: 60
            });

            await updateTierBadge();
            
            showToast("🎉 Phone Verified! You are now in Citizen Circle", "success");
            
            // Close any open verification modal
            document.getElementById('phoneVerificationModal')?.classList.add('hidden');
            
            return true;
        } catch (e) {
            console.error(e);
            showToast("Failed to update profile", "error");
            return false;
        }
    } else {
        showToast("❌ Incorrect code. Try again.", "error");
        return false;
    }
}
