/**
 * VocalWitness External Ledger Anchor
 * Daily Merkle root of sealed reports → OpenTimestamps
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

// Re-use the same secrets already defined in the project
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");

const db = admin.firestore();

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function buildMerkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return null;
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  return tree.getRoot().toString("hex");
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

// --------------------------------------------------
// Core anchoring logic
// --------------------------------------------------
async function createDailyAnchor() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const anchorRef = db.collection("ledger_anchors").doc(today);

  // Idempotency – do not overwrite an existing anchor for today
  const existing = await anchorRef.get();
  if (existing.exists) {
    logger.info(`Anchor for ${today} already exists – skipping`);
    return existing.data();
  }

  // Find the previous anchor so we only take new reports
  const lastSnap = await db
    .collection("ledger_anchors")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  let since = new Date(0);
  if (!lastSnap.empty) {
    const prev = lastSnap.docs[0].data();
    if (prev.createdAt?.toDate) {
      since = prev.createdAt.toDate();
    }
  }

  // Collect sealed testimonies created after the last anchor
  // Adjust field names if your schema uses different ones
  const snap = await db
    .collection("testimonies")
    .where("createdAt", ">", since)
    .orderBy("createdAt", "asc")
    .get();

  const leaves = [];
  const includedIds = [];

  snap.forEach((doc) => {
    const d = doc.data();

    // Prefer the client-side hash you already store
    let hashHex =
      d.contentHash ||
      d.mediaHash ||
      d.sha256 ||
      d.forensicHash ||
      null;

    // Fallback: hash the document ID itself (still deterministic)
    if (!hashHex) {
      hashHex = crypto.createHash("sha256").update(doc.id).digest("hex");
    }

    // Clean 0x prefix if present
    hashHex = String(hashHex).replace(/^0x/i, "").toLowerCase();

    if (/^[0-9a-f]{64}$/.test(hashHex)) {
      leaves.push(Buffer.from(hashHex, "hex"));
      includedIds.push(doc.id);
    }
  });

  if (leaves.length === 0) {
    logger.info(`No new sealed reports to anchor for ${today}`);
    // Optionally still write an empty anchor so the chain stays continuous
    return null;
  }

  // 1. Build Merkle root
  const rootHex = buildMerkleRoot(leaves);
  logger.info(`Merkle root ${today}: ${rootHex} (${leaves.length} leaves)`);

  // 2. Create OpenTimestamps detached file from the root hash
  const hashBuf = Buffer.from(rootHex, "hex");
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    hashBuf
  );

  // Submit to public calendars
  await OpenTimestamps.stamp(detached);

  // Serialize the .ots receipt
  const otsBuffer = Buffer.from(detached.serializeToBytes());

  // 3. Upload .ots file to R2 (public)
  const r2 = getR2Client();
  const otsKey = `anchors/${today}.ots`;

  await r2.send(
    new PutObjectCommand({
      Bucket: "vocalwitness-media",
      Key: otsKey,
      Body: otsBuffer,
      ContentType: "application/octet-stream",
      // Make sure your bucket policy allows public read on anchors/*
    })
  );

  const otsPublicUrl = `https://media.vocalwitness.com/${otsKey}`;

  // 4. Persist the anchor record
  const previousRoot = lastSnap.empty ? null : lastSnap.docs[0].data().root;

  const anchorData = {
    date: today,
    root: rootHex,
    previousRoot,
    leafCount: leaves.length,
    includedTestimonyIds: includedIds.slice(0, 1000), // keep document size reasonable
    otsUrl: otsPublicUrl,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    calendars: [
      "https://alice.btc.calendar.opentimestamps.org",
      "https://bob.btc.calendar.opentimestamps.org",
    ],
  };

  await anchorRef.set(anchorData);

  // Audit log
  await db.collection("audit_logs").add({
    action: "daily_merkle_anchor",
    performedBy: "system",
    targetId: today,
    targetType: "ledger_anchor",
    details: {
      root: rootHex,
      leafCount: leaves.length,
      otsUrl: otsPublicUrl,
    },
    severity: "info",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`✅ Anchored ${today} → ${rootHex}`);
  return anchorData;
}

// --------------------------------------------------
// Scheduled function – runs every day at 00:05 UTC
// --------------------------------------------------
export const dailyAnchor = onSchedule(
  {
    schedule: "5 0 * * *", // 00:05 UTC
    timeZone: "UTC",
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1",
  },
  async () => {
    try {
      await createDailyAnchor();
    } catch (err) {
      logger.error("dailyAnchor failed", err);
      throw err;
    }
  }
);

// --------------------------------------------------
// Manual admin trigger (for testing)
// --------------------------------------------------
export const triggerAnchorNow = onCall(
  {
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    region: "us-central1",
  },
  async (request) => {
    // Only allow admins
    if (!request.auth?.token?.admin) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const result = await createDailyAnchor();
    return result || { message: "No new reports to anchor" };
  }
);
