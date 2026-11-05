/**
 * Client-side write rate limiter (UX + first line of defense).
 * Server rules / Functions remain the real enforcement.
 */

const buckets = new Map(); // key -> { timestamps: number[] }

/**
 * @param {string} action  e.g. 'group_evidence', 'group_create', 'live_join'
 * @param {{ max?: number, windowMs?: number }} opts
 * @returns {{ ok: boolean, retryAfterMs?: number }}
 */
export function checkRateLimit(action, opts = {}) {
  const max = opts.max ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  let bucket = buckets.get(action);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(action, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }

  bucket.timestamps.push(now);
  return { ok: true };
}

/** Convenience: throw-friendly for async handlers */
export function assertRateLimit(action, opts = {}) {
  const result = checkRateLimit(action, opts);
  if (!result.ok) {
    const secs = Math.ceil((result.retryAfterMs || 0) / 1000);
    const err = new Error(`Please wait ${secs}s before trying again.`);
    err.code = 'rate-limited';
    err.retryAfterMs = result.retryAfterMs;
    throw err;
  }
  return result;
}

/** Defaults tuned for VocalWitness write surfaces */
export const RL = {
  testimony: { max: 2, windowMs: 60_000 },       // aligns with ~30s server gap
  group_create: { max: 3, windowMs: 10 * 60_000 },
  group_evidence: { max: 8, windowMs: 10 * 60_000 },
  group_attestation: { max: 10, windowMs: 10 * 60_000 },
  group_timeline: { max: 15, windowMs: 10 * 60_000 },
  live_join: { max: 20, windowMs: 5 * 60_000 },
  live_reaction: { max: 30, windowMs: 60_000 },
  upload: { max: 12, windowMs: 10 * 60_000 },
};
