/**
 * functions/callable/confirmPhoneVerification.js
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createConfirmPhoneVerification({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    await enforceRateLimit(uid, "confirmPhoneVerification", {
      windowMs: 60_000,
      max: 5,
    });

    try {
      const userRecord = await admin.auth().getUser(uid);

      if (!userRecord.phoneNumber) {
        throw new HttpsError(
          "failed-precondition",
          "No verified phone number linked to Auth user record."
        );
      }

      const existingClaims = userRecord.customClaims || {};
      const alreadyCircle =
        existingClaims.phone_verified === true ||
        existingClaims.tier === "citizen_circle" ||
        existingClaims.tier === "witness_circle";

      const nextTier =
        existingClaims.tier === "witness_circle"
          ? "witness_circle"
          : "citizen_circle";

      await admin.auth().setCustomUserClaims(uid, {
        ...existingClaims,
        phone_verified: true,
        tier: nextTier,
      });

      await db.collection("users").doc(uid).set(
        {
          isPhoneVerified: true,
          hasVerifiedPhone: true,
          isVerified: true,
          phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          tier: nextTier,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("publicProfiles").doc(uid).set(
        {
          uid,
          isPhoneVerified: true,
          displayName: userRecord.displayName || "Citizen",
          photoURL: userRecord.photoURL || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: alreadyCircle
          ? "phone_verification_reconfirmed"
          : "phone_verification_confirmed",
        performedBy: uid,
        targetId: uid,
        targetType: "user",
        details: {
          phoneVerified: true,
          alreadyCircle: Boolean(alreadyCircle),
        },
        severity: "info",
      });

      return {
        success: true,
        tier: nextTier,
        alreadyVerified: Boolean(alreadyCircle),
      };
    } catch (error) {
      console.error("Phone verification confirmation error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to confirm phone verification.");
    }
  });
}
