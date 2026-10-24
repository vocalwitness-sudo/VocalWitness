// js/mfa.js
import {
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

/**
 * Ensure the user has a recent login before sensitive MFA operations.
 * Fixes: auth/requires-recent-login
 */
async function ensureRecentLogin() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const providerId = user.providerData?.[0]?.providerId;

  if (providerId === "google.com") {
    const provider = new GoogleAuthProvider();
    await reauthenticateWithPopup(user, provider);
    return;
  }

  if (providerId === "password") {
    const password = window.prompt(
      "For security, re-enter your password to manage 2FA:"
    );
    if (!password) {
      const err = new Error("Re-authentication cancelled");
      err.code = "auth/cancelled";
      throw err;
    }
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return;
  }

  // Fallback: try Google if available, otherwise ask for full re-login
  try {
    const provider = new GoogleAuthProvider();
    await reauthenticateWithPopup(user, provider);
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user") {
      const e = new Error("Re-authentication cancelled");
      e.code = "auth/cancelled";
      throw e;
    }
    throw new Error(
      "Please sign out and sign back in, then try managing 2FA again."
    );
  }
}

/**
 * Enroll TOTP as second factor.
 * Re-authenticates first so Firebase does not return auth/requires-recent-login.
 */
export async function enrollTotpMfa(displayName = "VocalWitness Authenticator") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!user.emailVerified) {
    throw new Error("Verify your email first before enabling 2FA");
  }

  try {
    await ensureRecentLogin();
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled") {
      throw new Error("Re-authentication cancelled");
    }
    throw err;
  }

  // 1. Get MFA session
  const multiFactorSession = await multiFactor(user).getSession();

  // 2. Generate TOTP secret
  const totpSecret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession);

  // 3. Show QR + secret to user (return these to the UI)
  const qrCodeUrl = totpSecret.generateQrCodeUrl(
    user.email || user.uid,
    "VocalWitness"
  );
  const secretKey = totpSecret.secretKey; // for manual entry

  return { totpSecret, qrCodeUrl, secretKey, displayName };
}

/**
 * Finalize enrollment after user enters the 6-digit code from their app
 */
export async function finalizeTotpEnrollment(
  totpSecret,
  otpFromApp,
  displayName = "VocalWitness Authenticator"
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const multiFactorAssertion = TotpMultiFactorGenerator.assertionForEnrollment(
    totpSecret,
    otpFromApp
  );

  await multiFactor(user).enroll(multiFactorAssertion, displayName);

  // Optional: mirror status in Firestore (for UI only — source of truth is Auth)
  await updateDoc(doc(db, "users", user.uid), {
    twoFactorEnabled: true,
    mfaEnrolledAt: serverTimestamp(),
    mfaFactor: "totp",
    updatedAt: serverTimestamp()
  });

  showToast("🛡️ 2FA (Authenticator) enabled", "success");
  return true;
}

/**
 * Unenroll a factor (requires recent login)
 */
export async function unenrollMfa(factorUid) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  try {
    await ensureRecentLogin();
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled") {
      throw new Error("Re-authentication cancelled");
    }
    throw err;
  }

  await multiFactor(user).unenroll(factorUid);

  await updateDoc(doc(db, "users", user.uid), {
    twoFactorEnabled: false,
    updatedAt: serverTimestamp()
  });
  showToast("2FA disabled", "success");
}

/**
 * Check current enrollment status
 */
export function getEnrolledFactors() {
  const user = auth.currentUser;
  if (!user) return [];
  return multiFactor(user).enrolledFactors || [];
}

// ====================== MFA CHALLENGE (sign-in) ======================

/**
 * Submit the 6-digit code and complete the multi-factor sign-in.
 * Relies on window.__pendingMfaResolver set by openMfaChallengeModal() in auth.js
 */
export async function submitMfaChallenge() {
  const resolver = window.__pendingMfaResolver;
  const otpInput = document.getElementById("mfa-otp-input");
  const errorEl = document.getElementById("mfa-error");
  const verifyBtn = document.getElementById("mfa-verify-btn");

  if (!resolver) {
    showToast("MFA session expired. Please sign in again.", "error");
    if (typeof window.closeMfaChallengeModal === "function") {
      window.closeMfaChallengeModal();
    }
    return;
  }

  const otp = (otpInput?.value || "").trim().replace(/\s/g, "");
  if (!/^\d{6}$/.test(otp)) {
    if (errorEl) {
      errorEl.textContent = "Please enter a valid 6-digit code.";
      errorEl.classList.remove("hidden");
    }
    otpInput?.focus();
    return;
  }

  // Prefer TOTP factor
  const totpHint =
    resolver.hints?.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ||
    resolver.hints?.[0];

  if (!totpHint) {
    showToast("No authenticator factor found on this account.", "error");
    return;
  }

  try {
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = "Verifying…";
    }
    if (errorEl) errorEl.classList.add("hidden");

    const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, otp);
    await resolver.resolveSignIn(assertion);

    // Success – onAuthStateChanged will fire
    if (typeof window.closeMfaChallengeModal === "function") {
      window.closeMfaChallengeModal();
    }
    showToast("✅ Signed in successfully!", "success");

    if (typeof window.restorePendingDraft === "function") {
      window.restorePendingDraft();
    }
  } catch (err) {
    console.error("[mfa] Challenge verification failed:", err);

    let msg = "Verification failed. Please try again.";
    if (
      err?.code === "auth/invalid-verification-code" ||
      err?.code === "auth/invalid-verification-id"
    ) {
      msg = "Invalid or expired code. Try again.";
    } else if (err?.message) {
      msg = err.message;
    }

    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove("hidden");
    }
    if (otpInput) {
      otpInput.value = "";
      otpInput.focus();
    }
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify & Sign In";
    }
  }
}

/**
 * Bind click / keyboard handlers for the MFA challenge modal.
 * Safe to call multiple times.
 */
export function bindMfaChallengeEvents() {
  if (window.__mfaChallengeBound) return;
  window.__mfaChallengeBound = true;

  document.getElementById("mfa-verify-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    submitMfaChallenge();
  });

  document.getElementById("mfa-cancel-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof window.closeMfaChallengeModal === "function") {
      window.closeMfaChallengeModal();
    }
  });

  document.getElementById("closeMfaChallengeBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof window.closeMfaChallengeModal === "function") {
      window.closeMfaChallengeModal();
    }
  });

  // Enter key submits
  document.getElementById("mfa-otp-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitMfaChallenge();
    }
  });
}

// Global exports (optional but convenient)
window.submitMfaChallenge = submitMfaChallenge;
window.bindMfaChallengeEvents = bindMfaChallengeEvents;
window.enrollTotpMfa = enrollTotpMfa;
window.finalizeTotpEnrollment = finalizeTotpEnrollment;
window.unenrollMfa = unenrollMfa;
window.getEnrolledFactors = getEnrolledFactors;
