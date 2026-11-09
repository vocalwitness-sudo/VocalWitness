/**
 * functions/callable/setUserClaims.js
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createSetUserClaims({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    if (!request.auth.token.admin) {
      throw new HttpsError("permission-denied", "Only admins can set custom claims.");
    }

    await enforceRateLimit(request.auth.uid, "setUserClaims", {
      windowMs: 60_000,
      max: 20,
    });

    const { uid, claims } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      throw new HttpsError("invalid-argument", "A valid claims object is required.");
    }

    const allowed = ["admin", "moderator", "banned", "supporter", "steward"];
    const newClaims = {};
    for (const key of allowed) {
      if (key in claims) newClaims[key] = Boolean(claims[key]);
    }

    if (uid === request.auth.uid && newClaims.admin === false) {
      throw new HttpsError(
        "failed-precondition",
        "Admins cannot remove their own admin claim via this endpoint."
      );
    }

    try {
      const userRecord = await admin.auth().getUser(uid);
      const existingClaims = userRecord.customClaims || {};
      const finalClaims = { ...existingClaims, ...newClaims };

      await admin.auth().setCustomUserClaims(uid, finalClaims);

      await db.collection("users").doc(uid).set(
        {
          isAdmin: finalClaims.admin === true,
          isModerator: finalClaims.moderator === true,
          isBanned: finalClaims.banned === true,
          isSupporter: finalClaims.supporter === true,
          isSteward: finalClaims.steward === true,
          claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "set_custom_claims",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { claimsSet: newClaims, finalClaims },
        severity: "high",
      });

      return { success: true, claims: finalClaims };
    } catch (error) {
      console.error("Error setting custom claims:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to set user claims.");
    }
  });
}
