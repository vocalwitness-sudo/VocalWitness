/**
 * functions/lib/rate-limit.js
 * Progressive rate limiting + audit logging
 */
import admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { writeAuditLog } from "./audit.js";

const db = () => admin.firestore();

/**
 * @param {string} uid
 * @param {string} action
 * @param {{ windowMs?: number, max?: number, progressive?: boolean }} options
 */
export async function enforceRateLimit(
  uid,
  action,
  { windowMs = 60_000, max = 5, progressive = true } = {}
) {
  if (!uid || !action) {
    throw new HttpsError("invalid-argument", "uid and action are required for rate limiting.");
  }

  const ref = db().collection("rateLimits").doc(`${uid}_${action}`);
  const now = Date.now();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let windowStart = data.windowStart || 0;
    let count = data.count || 0;
    let violations = data.violations || 0;

    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }

    if (count >= max) {
      // Progressive: increase violations and optionally lengthen next window
      const nextViolations = violations + 1;
      tx.set(
        ref,
        {
          windowStart,
          count,
          lastRequest: now,
          action,
          violations: nextViolations,
          lastViolationAt: now,
        },
        { merge: true }
      );

      // Fire-and-forget audit (outside transaction is fine)
      writeAuditLog({
        action: "rate_limit_hit",
        performedBy: uid,
        targetId: action,
        targetType: "rate_limit",
        details: { max, windowMs, count, violations: nextViolations },
        severity: nextViolations >= 3 ? "warning" : "info",
      }).catch(() => {});

      throw new HttpsError(
        "resource-exhausted",
        `Rate limit: max ${max} ${action} per ${Math.round(windowMs / 1000)}s.`
      );
    }

    tx.set(
      ref,
      {
        windowStart,
        count: count + 1,
        lastRequest: now,
        action,
        violations: data.violations || 0,
      },
      { merge: true }
    );
  });
}
