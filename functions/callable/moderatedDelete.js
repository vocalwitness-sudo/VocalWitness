/**
 * functions/callable/moderatedDelete.js
 *
 * VocalWitness policy:
 * - Default action is SOFT HIDE (revocable).
 * - Optional permanent hide still keeps the document (integrity).
 * - Physical hard-delete is disabled for sealed/public-square content.
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
          dev_cipher ||
          originalData.evidencePack?.packCoreHash ||
          originalData.bodyHash
      );

      // Square / sealed content: NEVER physical delete
      if (isSquareContent || isSealed) {
        const permanent = mode === "permanent_hide";

        await docRef.set(
          {
            visibility: "moderator_hidden",
            isDeleted: true, // means "hidden from Square", not erased
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
            ? "Content permanently hidden from the Square. Sealed record preserved."
            : "Content hidden from the Square. Can be restored by moderators/admins.",
          physicalDelete: false,
        };
      }

      // Non-square operational docs only (e.g. some reports): still prefer soft state
      await docRef.set(
        {
          visibility: "moderator_hidden",
          isDeleted: true,
          isPermanentlyHidden: mode === "permanent_hide",
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
          mode,
          physicalDelete: false,
        },
        severity: "high",
      });

      return {
        success: true,
        mode: "soft_hide",
        message: "Document hidden (not physically deleted).",
        physicalDelete: false,
      };
    } catch (error) {
      console.error("Moderated hide error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to moderate document.");
    }
  });
}
