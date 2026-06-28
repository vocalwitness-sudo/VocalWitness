// js/verification.js  (Recommended new name)
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { upgradeToTrustCircle } from './tier.js';   // from earlier

/**
 * Start Phone Verification → Trust Circle
 */
export async function startPhoneVerification() {
    try {
        if (!auth.currentUser) {
            showToast("Please log in first", "error");
            return;
        }

        showToast("📱 Sending verification code to your phone...", "info");

        // TODO: Replace with real SMS service later
        setTimeout(async () => {
            // Auto-verify for demo (replace with real OTP flow)
            await upgradeToTrustCircle(auth.currentUser.uid);
            showToast("✅ Phone Verified! You are now in Trust Circle", "success");
        }, 1500);

    } catch (error) {
        console.error(error);
        showToast("❌ Phone verification failed", "error");
    }
}

/**
 * Start ZK Verification → True Witness
 */
export async function startZKVerification() {
    try {
        if (!auth.currentUser) {
            showToast("Please log in first", "error");
            return;
        }

        showToast("🔐 Starting Zero-Knowledge Verification...", "info");

        // TODO: Real ZK logic later
        setTimeout(async () => {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, {
                zkVerified: true,
                tier: "true_witness",
                lastUpdated: serverTimestamp()
            });

            showToast("🛡️ ZK Verification Complete! You are now a True Witness", "success");
        }, 2000);

    } catch (error) {
        console.error(error);
        showToast("❌ ZK Verification failed", "error");
    }
}
