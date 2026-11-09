/**
 * functions/callable/moderatedDelete.js
 * Soft-hide / permanent-hide only. No physical delete for Square content.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createModeratedDelete({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const isMod =
      request.auth.token.moderator === true || request.auth.token.admin === true;
    if (!isMod) {
      throw new HttpsError(
        "permission-denied",
        "Only moderators or admins can moderate content visibility."
      );
    }

    await enforceRateLimit(request.auth.uid, "moderatedDelete", {
      windowMs: 60_000,
      max: 40,
    });

    const {
      collection,
      docId,
      reason = "No reason provided",
      mode = "soft_hide",
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
      throw new HttpsError("invalid-argument", "Collection not allowed for moderation.");
    }

    if (!["soft_hide", "permanent_hide"].includes(mode)) {
      throw new HttpsError(
        "invalid-argument",
        'mode must be "soft_hide" or "permanent_hide".'
      );
    }

    try {
      const docRef = db.collection(collection).doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Document does not exist.");
      }

      const originalData = docSnap.data() || {};
      const permanent = mode === "permanent_hide";

      await docRef.set(
        {
          visibility: "moderator_hidden",
          isDeleted: true,
          isPermanentlyHidden: permanent,
          hiddenAt: admin.firestore.FieldValue.serverTimestamp(),
          hiddenBy: request.auth.uid,
          hiddenReason: String(reason).slice(0, 500),
          moderationStatus: permanent ? "permanently_hidden" : "hidden",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: permanent ? "moderator_permanent_hide" : "moderator_soft_hide",
        performedBy: request.auth.uid,
        targetId: docId,
        targetType: collection,
        details: {
          reason: String(reason).slice(0, 500),
          mode: permanent ? "permanent_hide" : "soft_hide",
          physicalDelete: false,
          originalAuthor:
            originalData.authorId ||
            originalData.ownerId ||
            originalData.witnessId ||
            null,
        },
        severity: "high",
      });

      return {
        success: true,
        mode: permanent ? "permanent_hide" : "soft_hide",
        message: permanent
          ? "Content permanently hidden from the Square. Record preserved."
          : "Content hidden from the Square. Can be restored.",
        physicalDelete: false,
      };
    } catch (error) {
      console.error("Moderated hide error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to moderate document.");
    }
  });
}
