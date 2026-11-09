/**
 * functions/callable/moderatedDelete.js
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
        "Only moderators or admins can perform moderated deletes."
      );
    }

    await enforceRateLimit(request.auth.uid, "moderatedDelete", {
      windowMs: 60_000,
      max: 40,
    });

    const { collection, docId, reason = "No reason provided" } = request.data || {};
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
    ];
    if (!allowedCollections.includes(collection)) {
      throw new HttpsError("invalid-argument", "Collection not allowed for moderated deletion.");
    }

    try {
      const docRef = db.collection(collection).doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Document does not exist.");
      }

      const originalData = docSnap.data() || {};

      // Soft-hide sealed testimonies
      if (collection === "testimonies" && originalData.packCoreHash) {
        await docRef.set(
          {
            visibility: "moderator_hidden",
            isDeleted: true,
            hiddenAt: admin.firestore.FieldValue.serverTimestamp(),
            hiddenBy: request.auth.uid,
            hiddenReason: String(reason).slice(0, 500),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await writeAuditLog({
          action: "moderator_soft_hide",
          performedBy: request.auth.uid,
          targetId: docId,
          targetType: collection,
          details: {
            reason: String(reason).slice(0, 500),
            originalAuthor:
              originalData.authorId ||
              originalData.ownerId ||
              originalData.witnessId ||
              null,
            hadPackCoreHash: true,
          },
          severity: "high",
        });

        return {
          success: true,
          message: "Sealed testimony soft-hidden (core preserved).",
          mode: "soft_hide",
        };
      }

      await docRef.delete();

      await writeAuditLog({
        action: "moderator_delete",
        performedBy: request.auth.uid,
        targetId: docId,
        targetType: collection,
        details: {
          reason: String(reason).slice(0, 500),
          originalAuthor:
            originalData.authorId ||
            originalData.ownerId ||
            originalData.witnessId ||
            null,
          contentPreview: originalData.content
            ? String(originalData.content).substring(0, 200)
            : null,
        },
        severity: "high",
      });

      return {
        success: true,
        message: "Document deleted and audited.",
        mode: "hard_delete",
      };
    } catch (error) {
      console.error("Moderated delete error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to delete document.");
    }
  });
}
