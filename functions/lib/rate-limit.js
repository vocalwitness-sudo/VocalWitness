/**
 * functions/lib/rate-limit.js
 * Per-uid action throttle using rateLimits/{uid}_{action}
 */
import admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

const db = () => admin.firestore();

/**
 * Enforce a simple sliding-window rate limit.
 * @param {string} uid
 * @param {string} action
 * @param {{ windowMs?: number, max?: number }} options
 * @throws {HttpsError} resource-exhausted
 */
export async function enforceRateLimit(
  uid,
  action,
  { windowMs = 60_000, max = 5 } = {}
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

    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }

    if (count >= max) {
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
      },
      { merge: true }
    );
  });
}
