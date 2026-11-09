/**
 * functions/callable/unbanUser.js
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createUnbanUser({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth?.token?.admin) {
      throw new HttpsError("permission-denied", "Only admins can unban users.");
    }

    await enforceRateLimit(request.auth.uid, "unbanUser", {
      windowMs: 60_000,
      max: 30,
    });

    const { uid } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }

    try {
      await admin.auth().updateUser(uid, { disabled: false });
      const userRecord = await admin.auth().getUser(uid);
      const existingClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(uid, {
        ...existingClaims,
        banned: false,
      });

      await db.collection("users").doc(uid).set(
        {
          isBanned: false,
          banReason: admin.firestore.FieldValue.delete(),
          bannedAt: admin.firestore.FieldValue.delete(),
          bannedBy: admin.firestore.FieldValue.delete(),
          unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
          unbannedBy: request.auth.uid,
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "unban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        severity: "medium",
      });

      return { success: true, message: `User ${uid} has been unbanned.` };
    } catch (error) {
      console.error("Unban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to unban user.");
    }
  });
}
