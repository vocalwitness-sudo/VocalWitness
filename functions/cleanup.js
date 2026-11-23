/**
 * functions/cleanup.js
 * Periodic garbage collection for operational hygiene
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";

const db = admin.firestore();

export const operationalCleanup = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Africa/Lagos",
    memory: "256MiB",
    timeoutSeconds: 240,
  },
  async () => {
    const now = Date.now();
    let deleted = 0;
// 1. Expired pending media (Firestore + R2)
{
  const cutoff = admin.firestore.Timestamp.fromMillis(now - 3 * 60 * 60 * 1000);
  const snap = await db
    .collection("pendingMedia")
    .where("status", "==", "pending")
    .where("expiresAt", "<", cutoff)
    .limit(200)
    .get();

  if (!snap.empty) {
    // If this function has no secrets, skip R2 delete here and rely on cleanupExpiredPendingMedia.
    // Prefer giving operationalCleanup the same secrets and deleting R2:
    try {
      const { deleteR2Object } = await import("./lib/r2.js");
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      // Only if secrets are available in this function's env; otherwise leave R2 to cleanupExpiredPendingMedia.
      if (accessKeyId && secretAccessKey) {
        for (const d of snap.docs) {
          const key = d.data()?.key;
          if (key && d.data()?.status === "pending") {
            try {
              await deleteR2Object({ accessKeyId, secretAccessKey, key });
            } catch (e) {
              logger.warn(`R2 delete failed key=${key}`, e?.message);
            }
          }
        }
      }
    } catch (e) {
      logger.warn("R2 delete path skipped in operationalCleanup", e?.message);
    }

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    logger.info(`Cleaned ${snap.size} expired pendingMedia`);
  }
}
    // 2. Old rate-limit documents (keep last 7 days)
    {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      const snap = await db
        .collection("rateLimits")
        .where("lastRequest", "<", cutoff)
        .limit(300)
        .get();

      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
        logger.info(`Cleaned ${snap.size} old rateLimits`);
      }
    }

    // 3. Very old soft-hidden content (policy: 2 years) – only mark, do not hard-delete sealed evidence
    // Skipped for now to stay conservative. Can be enabled later with explicit policy.

    logger.info(`operationalCleanup finished. Total docs cleaned: ${deleted}`);
  }
);
