// js/verification.js - Clean Verification Flows
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { canAdvanceTier, updateTierBadge, getCurrentUserTier } from './tier.js';

/**
 * Start Phone Verification → Citizen Circle (Trust Circle)
 */
export async function startPhoneVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("📱 Initiating phone verification...", "info");

    // TODO: Integrate real OTP service (Twilio, Firebase Phone Auth, etc.)
    // For now, simulate
    setTimeout(async () => {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, {
        hasVerifiedPhone: true,
        isPhoneVerified: true,
        tier: "citizen_circle",
        verifiedAt: serverTimestamp()
      });

      showToast("✅ Phone Verified! Welcome to Citizen Circle", "success");
      if (typeof updateTierBadge === 'function') updateTierBadge();
    }, 1600);
  } catch (error) {
    console.error(error);
    showToast("Phone verification failed", "error");
  }
}

/**
 * Start ZK Verification → Witness Circle (True Witness)
 */
export async function startZKVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("🔐 Running Zero-Knowledge Proof verification...", "info");

    // TODO: Call real circom / zk-SNARK prover here
    setTimeout(async () => {
      const canAdvance = await canAdvanceTier(auth.currentUser.uid);
      
      if (!canAdvance.canAdvance) {
        return showToast(`Cannot advance: ${canAdvance.reason}`, "warning");
      }

      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, {
        zkVerified: true,
        tier: "witness_circle",
        zkVerifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });

      showToast("🛡️ ZK Verification Complete! You are now a True Witness", "success");
      if (typeof updateTierBadge === 'function') updateTierBadge();
    }, 2200);
  } catch (error) {
    console.error(error);
    showToast("ZK Verification failed", "error");
  }
}
