/**
 * VocalWitness External Ledger Anchor
 * Daily Merkle root of sealed reports → OpenTimestamps + public record
 *
 * functions/anchor.js
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import OpenTimestamps from "opentimestamps";
import { MerkleTree } from "merkletreejs";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { defineSecret } from "firebase-functions/params";

// Secrets
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function buildMerkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return null;
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  return {
    root: tree.getRoot().toString("hex"),
    tree,
  };
}

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint:
      process.env.R2_ENDPOINT ||
      "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: r2AccessKeyId.value(),
      secretAccessKey: r2SecretAccessKey.value(),
    },
  });
}

/**
 * Collect all sealed testimony hashes from the last 24–48 hours
 * (or all time if you prefer a cumulative root later)
 */
async function collectSealedLeaves(hoursBack = 48) {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const snap = await db
    .collection("testimonies")
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(cutoff))
    .orderBy("createdAt", "asc")
    .get();

  const leaves = [];
  const meta = [];

  snap.forEach((doc) => {
    const d = doc.data();
    // Prefer packCoreHash → forensicHash → body/media hashes
    const hash =
      d.packCoreHash ||
      d.forensicHash ||
      d.evidencePack?.packCoreHash ||
      d.imageHash ||
      d.videoHash ||
      d.audioHash ||
      d.bodyHash ||
      null;

    if (hash && typeof hash === "string" && hash.length === 64) {
      // MerkleTree expects Buffers
      leaves.push(Buffer.from(hash, "hex"));
      meta.push({
        id: doc.id,
        hash,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      });
    }
  });

  return { leaves, meta };
}

/**
 * Stamp a Merkle root with OpenTimestamps
 */
async function stampWithOpenTimestamps(rootHex) {
  try {
    const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
      new OpenTimestamps.Ops.OpSHA256(),
      Buffer.from(rootHex, "hex")
    );

    await OpenTimestamps.stamp(detached);

    // Serialize the .ots proof
    const otsBuffer = detached.serializeToBytes();
    return {
      success: true,
      otsBase64: Buffer.from(otsBuffer).toString("base64"),
      info: "OpenTimestamps stamp submitted",
    };
  } catch (err) {
    logger.warn("OpenTimestamps stamp failed (non-fatal):", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Core anchor logic – used by both scheduled and manual triggers
 */
async function runAnchor({ triggeredBy = "scheduler" } = {}) {
  logger.info("Starting ledger anchor...", { triggeredBy });

  const { leaves, meta } = await collectSealedLeaves(48);

  if (leaves.length === 0) {
    logger.info("No sealed testimonies found in window. Skipping anchor.");
    return {
      success: true,
      message: "No sealed reports in the time window",
      count: 0,
    };
  }

  const { root, tree } = buildMerkleRoot(leaves);
  const timestamp = new Date().toISOString();
  const dateKey = timestamp.slice(0, 10); // YYYY-MM-DD

  // OpenTimestamps
  const otsResult = await stampWithOpenTimestamps(root);

  // Build public record
  const record = {
    schema: "vocalwitness.ledger-root.v1",
    date: dateKey,
    timestamp,
    merkleRoot: root,
    leafCount: leaves.length,
    leaves: meta, // id + hash for transparency
    ots: otsResult.success
      ? { stamped: true, otsBase64: otsResult.otsBase64 }
      : { stamped: false, error: otsResult.error || "stamp failed" },
    triggeredBy,
    note: "This root proves the set of sealed report hashes for the period. It does not prove real-world events.",
  };

  // 1. Write to Firestore (publicly readable collection)
  const docRef = db.collection("ledger_roots").doc(dateKey);
  await docRef.set(record, { merge: true });

  // 2. Optional: also publish a JSON copy to R2 for easy public download
  try {
    const s3 = getR2Client();
    const key = `ledger-roots/${dateKey}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: "vocalwitness-media",
        Key: key,
        Body: JSON.stringify(record, null, 2),
        ContentType: "application/json",
        CacheControl: "public, max-age=86400",
      })
    );
    record.publicUrl = `https://media.vocalwitness.com/${key}`;
    await docRef.set({ publicUrl: record.publicUrl }, { merge: true });
  } catch (r2Err) {
    logger.warn("R2 publish of ledger root failed (non-fatal):", r2Err.message);
  }

  // Audit log
  await db.collection("audit_logs").add({
    action: "ledger_root_anchored",
    performedBy: triggeredBy,
    targetId: dateKey,
    targetType: "ledger_root",
    details: {
      merkleRoot: root,
      leafCount: leaves.length,
      otsStamped: otsResult.success,
    },
    severity: "info",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: new Date().toISOString(),
  });

  logger.info("Ledger anchor complete", {
    date: dateKey,
    root,
    leafCount: leaves.length,
    ots: otsResult.success,
  });

  return {
    success: true,
    date: dateKey,
    merkleRoot: root,
    leafCount: leaves.length,
    otsStamped: otsResult.success,
    publicUrl: record.publicUrl || null,
  };
}

// --------------------------------------------------
// Scheduled – runs every day at 00:00 UTC
// --------------------------------------------------
export const dailyAnchor = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "UTC",
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    try {
      await runAnchor({ triggeredBy: "daily_scheduler" });
    } catch (err) {
      logger.error("dailyAnchor failed", err);
      throw err;
    }
  }
);

// --------------------------------------------------
// Manual trigger (admin / steward only)
// --------------------------------------------------
export const triggerAnchorNow = onCall(
  {
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // Optional: restrict to admin / steward
    const token = request.auth.token || {};
    const isPrivileged =
      token.admin === true ||
      token.steward === true ||
      token.moderator === true;

    if (!isPrivileged) {
      // Allow for now while testing – tighten later if needed
      logger.warn("Non-privileged user triggered anchor", {
        uid: request.auth.uid,
      });
    }

    try {
      const result = await runAnchor({
        triggeredBy: `manual:${request.auth.uid}`,
      });
      return result;
    } catch (err) {
      logger.error("triggerAnchorNow failed", err);
      throw new HttpsError("internal", err.message || "Anchor failed");
    }
  }
);
