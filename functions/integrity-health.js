/**
 * functions/integrity-health.js
 * Daily / periodic integrity sampling of sealed reports
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import crypto from "crypto";
import { writeAuditLog } from "./lib/audit.js";

const db = admin.firestore();

async function sha256FromUrl(url) {
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const hash = crypto.createHash("sha256");
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

async function sampleAndVerify(limit = 8) {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection("testimonies")
    .where("createdAt", ">=", cutoff)
    .orderBy("createdAt", "desc")
    .limit(40)
    .get();

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.imageHash || t.videoHash || t.audioHash || t.packCoreHash);

  // Random sample
  const sample = candidates.sort(() => Math.random() - 0.5).slice(0, limit);

  const results = [];
  let failures = 0;

  for (const t of sample) {
    const checks = [];
    try {
      if (t.imageUrl && t.imageHash) {
        const got = await sha256FromUrl(t.imageUrl);
        const ok = got === t.imageHash.toLowerCase();
        checks.push({ type: "image", ok, expected: t.imageHash, got });
        if (!ok) failures++;
      }
      if (t.videoUrl && t.videoHash) {
        const got = await sha256FromUrl(t.videoUrl);
        const ok = got === t.videoHash.toLowerCase();
        checks.push({ type: "video", ok, expected: t.videoHash, got });
        if (!ok) failures++;
      }
      if (t.audioUrl && t.audioHash) {
        const got = await sha256FromUrl(t.audioUrl);
        const ok = got === t.audioHash.toLowerCase();
        checks.push({ type: "audio", ok, expected: t.audioHash, got });
        if (!ok) failures++;
      }
      results.push({ id: t.id, ok: checks.every((c) => c.ok), checks });
    } catch (err) {
      failures++;
      results.push({ id: t.id, ok: false, error: err.message });
    }
  }

  // Check latest ledger root exists
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const rootSnap = await db.collection("ledger_roots").doc(today).get()
    || await db.collection("ledger_roots").doc(yesterday).get();

  const rootOk = rootSnap.exists;

  const summary = {
    sampled: sample.length,
    failures,
    rootPresent: rootOk,
    ok: failures === 0 && rootOk,
    checkedAt: new Date().toISOString(),
    results: results.slice(0, 20),
  };

  await db.collection("health").doc("integrity").set(summary, { merge: true });

  await writeAuditLog({
    action: "integrity_health_check",
    performedBy: "system",
    targetId: "integrity",
    targetType: "health",
    details: { sampled: sample.length, failures, rootPresent: rootOk },
    severity: summary.ok ? "info" : "warning",
  });

  return summary;
}

export const dailyIntegrityHealth = onSchedule(
  {
    schedule: "0 3 * * *",          // 03:00 UTC daily
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const summary = await sampleAndVerify(8);
    if (!summary.ok) {
      logger.error("Integrity health check FAILED", summary);
      // Optional: throw to surface in Cloud Monitoring
    } else {
      logger.info("Integrity health check passed", summary);
    }
  }
);

// Manual trigger for admins
export const runIntegrityHealthNow = onCall(
  { memory: "512MiB", timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");
    const token = request.auth.token || {};
    if (!token.admin && !token.steward && !token.moderator) {
      throw new HttpsError("permission-denied", "Admin/Steward only");
    }
    return sampleAndVerify(12);
  }
);
