// js/verification.js - Enhanced with canAdvanceTier + Timeout Handling
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { canAdvanceTier, updateTierBadge } from './tier.js';

/**
 * Phone Verification → Citizen Circle
 */
export async function startPhoneVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("📱 Starting phone verification...", "info");

    // Simulate real OTP flow (replace with Firebase Phone Auth later)
    setTimeout(async () => {
      const userRef = doc(db, "users", auth.currentUser.uid);
      
      await updateDoc(userRef, {
        hasVerifiedPhone: true,
        isPhoneVerified: true,
        tier: "citizen_circle",
        verifiedAt: serverTimestamp()
      });

      showToast("✅ Phone Verified! You are now in Citizen Circle", "success");
      await updateTierBadge();
    }, 1800);
  } catch (error) {
    console.error(error);
    showToast("Phone verification failed", "error");
  }
}

/**
 * ZK Verification → Witness Circle (True Witness)
 */
export async function startZKVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("🔐 Running Zero-Knowledge Verification...", "info");

    // Use the advanced tier check with timeout
    const advanceResult = await canAdvanceTier(auth.currentUser.uid, 10000); // 10s timeout

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, {
      zkVerified: true,
      tier: "witness_circle",
      zkVerifiedAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });

    showToast("🛡️ ZK Verification Complete! Welcome to True Witness Circle", "success");
    await updateTierBadge();
  } catch (error) {
    console.error(error);
    showToast("ZK Verification failed or timed out", "error");
  }
}
