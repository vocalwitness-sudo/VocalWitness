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

    // 1. Expired pending media records (already partially handled, reinforce)
    {
      const cutoff = admin.firestore.Timestamp.fromMillis(now - 3 * 60 * 60 * 1000); // 3h
      const snap = await db
        .collection("pendingMedia")
        .where("status", "==", "pending")
        .where("expiresAt", "<", cutoff)
        .limit(200)
        .get();

      if (!snap.empty) {
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
