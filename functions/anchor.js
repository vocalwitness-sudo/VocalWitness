/**
 * VocalWitness External Ledger Anchor
 * Daily Merkle root of sealed reports → OpenTimestamps
 *
 * functions/anchor.js
 * Batch 5 – first real implementation
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import { MerkleTree } from "merkletreejs";
import crypto from "crypto";

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
  return tree.getRoot().toString("hex");
}

/**
 * Collect recent sealed testimony hashes (last 24–48 hours)
 * We prefer packCoreHash / forensicHash / bodyHash
 */
async function collectSealedHashes(hoursBack = 36) {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const snap = await db
    .collection("testimonies")
    .where("createdAt", ">=", cutoff)
    .orderBy("createdAt", "desc")
    .limit(2000)
    .get();

  const hashes = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const h =
      d.packCoreHash ||
      d.forensicHash ||
      d.evidencePack?.packCoreHash ||
      d.bodyHash ||
      null;

    if (h && typeof h === "string" && h.length === 64) {
      hashes.push(h);
    }
  });

  // Also check witness_voice channel if it exists as separate collection
  try {
    const wvSnap = await db
      .collection("witness_voice")
      .where("createdAt", ">=", cutoff)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    wvSnap.forEach((doc) => {
      const d = doc.data();
      const h =
        d.packCoreHash ||
        d.forensicHash ||
        d.evidencePack?.packCoreHash ||
        d.bodyHash ||
        null;

      if (h && typeof h === "string" && h.length === 64) {
        hashes.push(h);
      }
    });
  } catch (err) {
    logger.warn("witness_voice collection not available or missing index", {
      message: err.message,
    });
  }

  // Deduplicate
  return [...new Set(hashes)];
}

/**
 * Write the daily anchor record
 */
async function writeAnchorRecord({ root, leafCount, hashesSample }) {
  const now = admin.firestore.Timestamp.now();
  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const anchorRef = db.collection("ledger_anchors").doc(dateKey);

  await anchorRef.set(
    {
      date: dateKey,
      merkleRoot: root,
      leafCount,
      sampleHashes: hashesSample.slice(0, 10), // keep document small
      createdAt: now,
      updatedAt: now,
      status: "anchored_local", // will become "timestamped" when OpenTimestamps is added
      note: "Application-level Merkle root of sealed reports",
    },
    { merge: true }
  );

  return anchorRef.id;
}

// --------------------------------------------------
// Scheduled daily anchor
// --------------------------------------------------
export const dailyAnchor = onSchedule(
  {
    schedule: "0 0 * * *", // every day at 00:00 UTC
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 180,
  },
  async () => {
    logger.info("Starting daily VocalWitness anchor...");

    try {
      const hashes = await collectSealedHashes(36);

      if (hashes.length === 0) {
        logger.info("No sealed hashes found in the look-back window. Skipping.");
        return;
      }

      const leaves = hashes.map((h) => Buffer.from(h, "hex"));
      const root = buildMerkleRoot(leaves);

      if (!root) {
        logger.error("Failed to build Merkle root");
        return;
      }

      const anchorId = await writeAnchorRecord({
        root,
        leafCount: hashes.length,
        hashesSample: hashes,
      });

      logger.info("Daily anchor completed", {
        anchorId,
        leafCount: hashes.length,
        merkleRoot: root,
      });

      // Future: send root to OpenTimestamps here
      // and update the document with the .ots proof
    } catch (err) {
      logger.error("dailyAnchor failed", {
        message: err.message,
        stack: err.stack,
      });
      throw err;
    }
  }
);

// --------------------------------------------------
// Manual trigger (callable)
// --------------------------------------------------
export const triggerAnchorNow = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    // Optional: restrict to admins later
    // if (!request.auth?.token?.admin) {
    //   throw new HttpsError("permission-denied", "Admin only");
    // }

    logger.info("Manual anchor triggered", {
      uid: request.auth?.uid || "unauthenticated",
    });

    try {
      const hashes = await collectSealedHashes(48);

      if (hashes.length === 0) {
        return {
          success: true,
          message: "No sealed hashes found in the last 48 hours.",
          leafCount: 0,
        };
      }

      const leaves = hashes.map((h) => Buffer.from(h, "hex"));
      const root = buildMerkleRoot(leaves);

      const anchorId = await writeAnchorRecord({
        root,
        leafCount: hashes.length,
        hashesSample: hashes,
      });

      return {
        success: true,
        message: "Manual anchor completed",
        anchorId,
        leafCount: hashes.length,
        merkleRoot: root,
      };
    } catch (err) {
      logger.error("triggerAnchorNow failed", { message: err.message });
      throw new HttpsError("internal", "Anchor failed: " + err.message);
    }
  }
);
