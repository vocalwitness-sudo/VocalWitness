/**
 * VocalWitness External Ledger Anchor
 * Daily Merkle root → OpenTimestamps
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";
import admin from "firebase-admin";
import OpenTimestamps from "opentimestamps";
import { MerkleTree } from "merkletreejs";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { defineSecret } from "firebase-functions/params";

const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");

const db = admin.firestore();

// ---------- Helpers ----------
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function buildMerkleRoot(leaves) {
  if (leaves.length === 0) return null;
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  return tree.getRoot().toString("hex");
}

async function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: r2AccessKeyId.value(),
      secretAccessKey: r2SecretAccessKey.value(),
    },
  });
}

// ---------- Core anchoring logic ----------
async function createDailyAnchor() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const anchorRef = db.collection("ledger_anchors").doc(today);

  // Idempotency check
  const existing = await anchorRef.get();
  if (existing.exists) {
    logger.info(`Anchor for ${today} already exists`);
    return existing.data();
  }

  // 1. Collect sealed testimony hashes since last anchor (or all recent ones)
  //    Prefer using the already-computed client-side SHA-256 hash stored on each doc
  const lastAnchorSnap = await db.collection("ledger_anchors")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  let since = new Date(0);
  if (!lastAnchorSnap.empty) {
    since = lastAnchorSnap.docs[0].data().createdAt.toDate();
  }

  const snap = await db.collection("testimonies")
    .where("createdAt", ">", since)
    .where("sealed", "==", true)          // or whatever field marks sealed reports
    .orderBy("createdAt", "asc")
    .get();

  const leaves = [];
  const includedIds = [];

  snap.forEach(doc => {
    const d = doc.data();
    // Prefer the client-side media/content hash you already store
    const hashHex = d.contentHash || d.mediaHash || d.sha256 || doc.id;
    if (hashHex && typeof hashHex === "string") {
      leaves.push(Buffer.from(hashHex.replace(/^0x/, ""), "hex"));
      includedIds.push(doc.id);
    }
  });

  if (leaves.length === 0) {
    logger.info("No new sealed reports to anchor");
    return null;
  }

  // 2. Build Merkle root
  const rootHex = buildMerkleRoot(leaves);
  logger.info(`Merkle root for ${today}: ${rootHex} (${leaves.length} leaves)`);

  // 3. Create OpenTimestamps stamp
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    Buffer.from(rootHex, "hex")
  );

  await OpenTimestamps.stamp(detached);          // submits to public calendars

  // Serialize the .ots receipt
  const otsBuffer = detached.serializeToBytes();

  // 4. Upload .ots to R2 (public)
  const r2 = await getR2Client();
  const otsKey = `anchors/${today}.ots`;
  await r2.send(new PutObjectCommand({
    Bucket: "vocalwitness-media",
    Key: otsKey,
    Body: otsBuffer,
    ContentType: "application/octet-stream",
    ACL: "public-read",          // or use public bucket policy
  }));

  const otsPublicUrl = `https://media.vocalwitness.com/${otsKey}`;

  // 5. Store anchor record
  const previousRoot = lastAnchorSnap.empty ? null : lastAnchorSnap.docs[0].data().root;

  const anchorData = {
    date: today,
    root: rootHex,
    previousRoot,
    leafCount: leaves.length,
    includedTestimonyIds: includedIds.slice(0, 500), // keep reasonable size
    otsUrl: otsPublicUrl,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    calendarServers: ["https://alice.btc.calendar.opentimestamps.org", "https://bob.btc.calendar.opentimestamps.org"],
  };

  await anchorRef.set(anchorData);

  // Optional: also write a short public notice
  await db.collection("audit_logs").add({
    action: "daily_merkle_anchor",
    root: rootHex,
    leafCount: leaves.length,
    otsUrl: otsPublicUrl,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`✅ Anchored ${today} → ${rootHex}`);
  return anchorData;
}

// ---------- Scheduled function (daily 00:05 UTC) ----------
export const dailyAnchor = onSchedule(
  {
    schedule: "5 0 * * *",          // 00:05 UTC every day
    timeZone: "UTC",
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    timeoutSeconds: 540,
    memory: "1GiB",
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

// ---------- Manual trigger (admin only) ----------
export const triggerAnchorNow = onCall(
  { secrets: [r2AccessKeyId, r2SecretAccessKey] },
  async (request) => {
    if (!request.auth?.token?.admin) {
      throw new HttpsError("permission-denied", "Admin only");
    }
    return await createDailyAnchor();
  }
);
