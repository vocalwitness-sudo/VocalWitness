/**
 * functions/lib/pending-media.js
 * Lightweight pending → sealed tracking to reduce orphaned media
 */
import admin from "firebase-admin";

const db = () => admin.firestore();

/**
 * Record a pending upload (call from getUploadUrl / getPresignedUrl)
 */
export async function recordPendingMedia({ uid, key, publicUrl, contentType }) {
  const id = key.replace(/[\/\\]/g, "_").slice(0, 200);
  await db().collection("pendingMedia").doc(id).set(
    {
      uid,
      key,
      publicUrl,
      contentType: contentType || null,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000), // 2h
    },
    { merge: true }
  );
  return id;
}

/**
 * Mark as sealed when testimony is successfully created
 */
export async function markMediaSealed(keys = []) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  const batch = db().batch();
  for (const key of keys) {
    if (!key) continue;
    const id = String(key).replace(/[\/\\]/g, "_").slice(0, 200);
    const ref = db().collection("pendingMedia").doc(id);
    batch.set(ref, { status: "sealed", sealedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}
