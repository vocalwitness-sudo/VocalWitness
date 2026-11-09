/**
 * functions/callable/evaluateTrustTier.js
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";

export function createEvaluateTrustTier({ allowedOrigins, db }) {
  return onCall({ cors: allowedOrigins }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    await enforceRateLimit(uid, "evaluateTrustTier", { windowMs: 60_000, max: 10 });

    const userRef = db.collection("users").doc(uid);

    try {
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User record not found.");
      }

      const u = userSnap.data() || {};
      let newTier = "citizen";

      const isVerified = Boolean(u.isVerified || u.isPhoneVerified || u.zkVerified);
      const testimonies = Number(u.testimoniesCount || 0);
      const verifications = Number(u.verificationsMade || 0);
      const score = Number(u.reputationScore || 0);

      if (score >= 1000 && testimonies >= 20 && isVerified) {
        newTier = "steward";
      } else if (score >= 500 && testimonies >= 10 && verifications >= 15) {
        newTier = "elite_witness";
      } else if (isVerified || (score >= 150 && verifications >= 5)) {
        newTier = "verified_citizen";
      } else if (u.tier === "citizen_circle" || u.isPhoneVerified) {
        newTier = "citizen_circle";
      }

      const rank = {
        citizen: 0,
        citizen_circle: 1,
        verified_citizen: 2,
        elite_witness: 3,
        witness_circle: 3,
        steward: 4,
      };
      const currentRank = rank[u.tier] ?? 0;
      const nextRank = rank[newTier] ?? 0;
      if (nextRank < currentRank) {
        newTier = u.tier;
      }

      if (newTier !== u.tier) {
        await userRef.update({
          tier: newTier,
          tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (newTier === "steward") {
          const userRecord = await admin.auth().getUser(uid);
          const claims = userRecord.customClaims || {};
          await admin.auth().setCustomUserClaims(uid, { ...claims, steward: true });
        }

        await writeAuditLog({
          action: "tier_upgraded",
          performedBy: "system",
          targetId: uid,
          targetType: "user",
          details: { oldTier: u.tier || null, newTier },
          severity: "info",
        });
      }

      return { success: true, tier: newTier };
    } catch (error) {
      console.error("Evaluate tier error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to evaluate trust tier.");
    }
  });
}
