// js/mfa.js
import {
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  reauthenticateWithPopup,          // or credential for email/password
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

/**
 * Enroll TOTP as second factor.
 * Must be called while user is signed in and (usually) recently re-authenticated.
 */
export async function enrollTotpMfa(displayName = "VocalWitness Authenticator") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!user.emailVerified) {
    throw new Error("Verify your email first before enabling 2FA");
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
  const secretKey = totpSecret.secretKey;   // for manual entry

  return { totpSecret, qrCodeUrl, secretKey, displayName };
}

/**
 * Finalize enrollment after user enters the 6-digit code from their app
 */
export async function finalizeTotpEnrollment(totpSecret, otpFromApp, displayName = "VocalWitness Authenticator") {
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
