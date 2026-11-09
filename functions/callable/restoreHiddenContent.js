/**
 * functions/callable/restoreHiddenContent.js
 *
 * Restores soft-hidden content to the Square.
 * Permanent hides: admin only (optional override).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createRestoreHiddenContent({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const isMod =
      request.auth.token.moderator === true || request.auth.token.admin === true;
    if (!isMod) {
      throw new HttpsError(
        "permission-denied",
        "Only moderators or admins can restore hidden content."
      );
    }

    await enforceRateLimit(request.auth.uid, "restoreHiddenContent", {
      windowMs: 60_000,
      max: 40,
    });

    const {
      collection,
      docId,
      reason = "Restored by moderator",
      allowPermanentRestore = false,
    } = request.data || {};

    if (!collection || typeof collection !== "string" || !docId || typeof docId !== "string") {
      throw new HttpsError("invalid-argument", "collection and docId must be valid strings.");
    }

    const allowedCollections = [
      "testimonies",
      "posts",
      "feeds",
      "groups",
      "witnessCycles",
      "dao_proposals",
      "reports",
      "witness_voice",
      "citizen_talk",
    ];
    if (!allowedCollections.includes(collection)) {
      throw new HttpsError("invalid-argument", "Collection not allowed for restore.");
    }

    try {
      const docRef = db.collection(collection).doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Document does not exist.");
      }

      const data = docSnap.data() || {};
      const isPermanent = data.isPermanentlyHidden === true;

      if (isPermanent) {
        // Only admins may restore permanent hides, and only if explicitly requested
        if (request.auth.token.admin !== true || allowPermanentRestore !== true) {
          throw new HttpsError(
            "failed-precondition",
            "This content is permanently hidden. Only an admin can restore it with allowPermanentRestore=true."
          );
        }
      }

      await docRef.set(
        {
          visibility: "public",
          isDeleted: false,
          isPermanentlyHidden: false,
          moderationStatus: "visible",
          restoredAt: admin.firestore.FieldValue.serverTimestamp(),
          restoredBy: request.auth.uid,
          restoreReason: String(reason).slice(0, 500),
          // keep history fields; do not erase hiddenAt/hiddenBy/hiddenReason
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: isPermanent ? "admin_restore_permanent_hide" : "moderator_restore",
        performedBy: request.auth.uid,
        targetId: docId,
        targetType: collection,
        details: {
          reason: String(reason).slice(0, 500),
          wasPermanent: isPermanent,
          originalAuthor: data.authorId || data.ownerId || data.witnessId || null,
        },
        severity: isPermanent ? "high" : "medium",
      });

      return {
        success: true,
        message: "Content restored to the Square.",
        wasPermanent: isPermanent,
      };
    } catch (error) {
      console.error("Restore hidden content error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to restore content.");
    }
  });
}
