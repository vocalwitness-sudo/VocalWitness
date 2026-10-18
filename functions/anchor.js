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

// Secrets
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();   // ← only one declaration

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
