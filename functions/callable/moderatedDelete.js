/**
 * functions/callable/moderatedDelete.js
 *
 * VocalWitness policy:
 * - soft_hide = hidden from Square, can restore
 * - permanent_hide = never return to public Square, record kept
 * - no physical delete for Square / sealed content
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

const SQUARE_COLLECTIONS = new Set([
  "testimonies",
  "posts",
  "feeds",
  "witnessCycles",
  "witness_voice",
  "citizen_talk",
]);

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
      mode = "soft_hide", // soft_hide | permanent_hide
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
      const isSquareContent = SQUARE_COLLECTIONS.has(collection);
      const isSealed = Boolean(
        originalData.packCoreHash ||
          originalData.forensicHash ||
          originalData.evidencePack?.packCoreHash ||
          originalData.bodyHash
      );

      const permanent = mode === "permanent_hide";

      // Always soft state — never erase Square/sealed content
      if (isSquareContent || isSealed || true) {
        await docRef.set(
          {
            visibility: "moderator_hidden",
            isDeleted: true, // means hidden from Square, not erased
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
            originalAuthor:
              originalData.authorId ||
              originalData.ownerId ||
              originalData.witnessId ||
              null,
            sealed: isSealed,
            physicalDelete: false,
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
      }
    } catch (error) {
      console.error("Moderated hide error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to moderate document.");
    }
  });
}
