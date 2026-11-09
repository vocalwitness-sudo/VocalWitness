/**
 * functions/callable/banUser.js
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createBanUser({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const isAllowed =
      request.auth.token.admin === true || request.auth.token.moderator === true;
    if (!isAllowed) {
      throw new HttpsError("permission-denied", "Only admins or moderators can ban users.");
    }

    await enforceRateLimit(request.auth.uid, "banUser", { windowMs: 60_000, max: 30 });

    const { uid, reason = "No reason provided" } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }
    if (uid === request.auth.uid) {
      throw new HttpsError("failed-precondition", "You cannot ban yourself.");
    }

    try {
      const targetRecord = await admin.auth().getUser(uid);
      const targetClaims = targetRecord.customClaims || {};
      if (targetClaims.admin === true && request.auth.token.admin !== true) {
        throw new HttpsError("permission-denied", "Only admins can ban other admins.");
      }

      await admin.auth().updateUser(uid, { disabled: true });
      await admin.auth().setCustomUserClaims(uid, {
        ...targetClaims,
        banned: true,
      });

      await db.collection("users").doc(uid).set(
        {
          isBanned: true,
          banReason: String(reason).slice(0, 500),
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedBy: request.auth.uid,
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "ban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { reason: String(reason).slice(0, 500) },
        severity: "high",
      });

      return { success: true, message: `User ${uid} has been banned.` };
    } catch (error) {
      console.error("Ban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to ban user.");
    }
  });
}
