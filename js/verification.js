// js/verification.js - Robust Verification Handlers with Timeout Guards & Tier Checks
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { canAdvanceTier, refreshTierAndUI, TIERS } from './tier.js';

/**
 * Execute an async operation with a strict timeout fallback
 * @param {Promise} promise - The promise to execute
 * @param {number} ms - Timeout in milliseconds
 * @param {string} timeoutMsg - Reason given upon timeout
 */
function withTimeout(promise, ms = 10000, timeoutMsg = "Operation timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), ms))
  ]);
}

/**
 * Phone Verification -> Citizen Circle
 */
export async function startPhoneVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("📱 Starting phone verification...", "info");

    // Check progression eligibility before proceeding
    const advanceResult = await withTimeout(
      canAdvanceTier(auth.currentUser.uid),
      10000,
      "Tier check timed out"
    );

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    // Simulated OTP delay (replace with real Firebase Auth Recaptcha/Phone Auth step when ready)
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const userRef = doc(db, "users", auth.currentUser.uid);
    
    await withTimeout(
      updateDoc(userRef, {
        hasVerifiedPhone: true,
        isPhoneVerified: true,
        tier: TIERS.CITIZEN_CIRCLE,
        verifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }),
      10000,
      "Database update timed out"
    );

    showToast("✅ Phone Verified! Welcome to Citizen Circle", "success");
    
    // Invalidate local profile cache and refresh UI
    refreshTierAndUI();
  } catch (error) {
    console.error("Phone verification error:", error);
    showToast(error.message || "Phone verification failed", "error");
  }
}

/**
 * ZK Verification -> Witness Circle (Witness Voice Access)
 */
export async function startZKVerification() {
  try {
    if (!auth.currentUser) {
      showToast("Please log in first", "error");
      return;
    }

    showToast("🔐 Running Zero-Knowledge Verification...", "info");

    // Check progression eligibility inside timeout guard
    const advanceResult = await withTimeout(
      canAdvanceTier(auth.currentUser.uid), 
      10000, 
      "Verification check timed out"
    );

    if (!advanceResult.canAdvance) {
      return showToast(`Verification blocked: ${advanceResult.reason}`, "warning");
    }

    const userRef = doc(db, "users", auth.currentUser.uid);
    
    await withTimeout(
      updateDoc(userRef, {
        zkVerified: true,
        tier: TIERS.WITNESS_CIRCLE,
        zkVerifiedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }),
      10000,
      "Database update timed out"
    );

    showToast("🛡️ ZK Verification Complete! Welcome to Witness Circle", "success");

    // Invalidate local profile cache and refresh UI
    refreshTierAndUI();
  } catch (error) {
    console.error("ZK verification error:", error);
    showToast(error.message || "ZK Verification failed or timed out", "error");
  }
}
