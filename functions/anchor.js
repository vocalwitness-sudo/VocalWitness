/**
 * VocalWitness External Ledger Anchor
 * Daily Merkle root of sealed reports → OpenTimestamps
 *
 * functions/anchor.js
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
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

function buildMerkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return null;
  const tree = new MerkleTree(leaves, sha256, { sortPairs: true });
  return tree.getRoot().toString("hex");
}

// --------------------------------------------------
// Scheduled daily anchor (stub for now)
// --------------------------------------------------
export const dailyAnchor = onSchedule(
  {
    schedule: "0 0 * * *",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120
  },
  async (event) => {
    logger.info("Running daily anchor...", { structuredData: true });
    // TODO: Real Merkle tree + OpenTimestamps logic will be added later
  }
);

// --------------------------------------------------
// Manual trigger (deployable version – no secrets for now)
// --------------------------------------------------
export const triggerAnchorNow = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60
  },
  async (request) => {
    logger.info("Triggering manual anchor...", { structuredData: true });
    // TODO: Real Merkle + OpenTimestamps logic will be added later
    return { 
      success: true, 
      message: "Anchor triggered successfully (stub)." 
    };
  }
);
