/**
 * functions/callable/confirmPhoneVerification.js
 * Batch 1 – Integrity / Trust Foundation
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createConfirmPhoneVerification({ allowedOrigins, db }) {
  return onCall(
    {
      cors: allowedOrigins,
      // Enforce App Check in production (recommended)
      // Uncomment the line below once App Check is fully rolled out:
      // enforceAppCheck: true,
    },
    async (request) => {
      // 1. Authentication required
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
      }

      // 2. Optional strong App Check guard (enable when ready)
      // if (!request.app) {
      //   throw new HttpsError(
      //     "failed-precondition",
      //     "App Check token required."
      //   );
      // }

      const uid = request.auth.uid;

      // 3. Rate limit
      await enforceRateLimit(uid, "confirmPhoneVerification", {
        windowMs: 60_000,
        max: 5,
      });

      try {
        const userRecord = await admin.auth().getUser(uid);

        // 4. Must have a real phone number on the Auth record
        if (!userRecord.phoneNumber) {
          throw new HttpsError(
            "failed-precondition",
            "No verified phone number linked to Auth user record."
          );
        }

        const existingClaims = userRecord.customClaims || {};

        // 5. Never allow the client to force a higher tier than this function decides
        const nextTier =
          existingClaims.tier === "witness_circle"
            ? "witness_circle"
            : "citizen_circle";

        const alreadyCircle =
          existingClaims.phone_verified === true ||
          existingClaims.tier === "citizen_circle" ||
          existingClaims.tier === "witness_circle";

        // 6. Set custom claims (server-only)
        await admin.auth().setCustomUserClaims(uid, {
          ...existingClaims,
          phone_verified: true,
          tier: nextTier,
        });

        // 7. Update users collection
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

        // 8. Update public profile (safe fields only)
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

        // 9. Audit log
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
            nextTier,
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
        throw new HttpsError(
          "internal",
          "Failed to confirm phone verification."
        );
      }
    }
  );
}
