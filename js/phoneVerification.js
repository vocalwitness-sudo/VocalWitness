// js/phoneVerification.js
import { db } from './firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { upgradeToTrustCircle } from './tier.js';

let verificationCode = null;
let currentUserId = null;

// Send OTP
export async function sendPhoneVerification(phoneNumber, userId) {
    currentUserId = userId;
    
    if (!phoneNumber || phoneNumber.length < 10) {
        showToast("Please enter a valid phone number", "error");
        return false;
    }

    // TODO: Connect real SMS service (Twilio, Termii, Africa’s Talking, etc.)
    // For now, we'll simulate
    verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`📲 Simulated OTP for ${phoneNumber}: ${verificationCode}`);
    showToast(`OTP sent to ${phoneNumber} (Check console for demo)`, "success");
    
    return true;
}

// Verify OTP
export async function verifyPhoneCode(enteredCode) {
    if (enteredCode === verificationCode) {
        await upgradeToTrustCircle(currentUserId);
        showToast("✅ Phone verified! You are now in Trust Circle", "success");
        return true;
    } else {
        showToast("❌ Wrong code. Try again.", "error");
        return false;
    }
}
