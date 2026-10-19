import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MerkleTree } from 'merkletreejs';
import OpenTimestamps from 'opentimestamps';
import admin from 'firebase-admin';

// Initialize Firebase Admin using secret from GitHub Actions env
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest();
}

async function generateDailyLedgerRoot() {
  console.log('Fetching unanchored forensic evidence logs...');

  // 1. Fetch testimonies/evidence logged within the last 24 hours or unanchored
  const snapshot = await db.collection('testimonies')
    .where('anchored', '==', false)
    .limit(500)
    .get();

  const leafHashes = [];
  const testimonyIds = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Hash key metadata fields to form Merkle leaf
    const contentPayload = `${doc.id}:${data.hash || data.contentHash}:${data.createdAt}`;
    leafHashes.push(sha256(contentPayload));
    testimonyIds.push(doc.id);
  });

  if (leafHashes.length === 0) {
    console.log('No unanchored records found. Generating heartbeat root.');
    leafHashes.push(sha256(`HEARTBEAT:${new Date().toISOString()}`));
  }

  // 2. Construct Merkle Tree
  const tree = new MerkleTree(leafHashes, sha256, { sortPairs: true });
  const merkleRoot = tree.getRoot().toString('hex');

  console.log(`Merkle Root generated: 0x${merkleRoot}`);

  // 3. Anchor Merkle Root using OpenTimestamps
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    Buffer.from(merkleRoot, 'hex')
  );

  await OpenTimestamps.stamp(detached);
  const otsProofBytes = detached.serializeToBytes();

  // 4. Output Transparency Proof JSON
  const dateStr = new Date().toISOString().split('T')[0];
  const outputDir = path.join(process.cwd(), 'transparency-roots');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const proofFilePath = path.join(outputDir, `anchor-${dateStr}.json`);
  const proofPayload = {
    date: dateStr,
    timestamp: new Date().toISOString(),
    merkleRoot: merkleRoot,
    leafCount: leafHashes.length,
    testimonyIds: testimonyIds,
    otsProof: Buffer.from(otsProofBytes).toString('base64')
  };

  fs.writeFileSync(proofFilePath, JSON.stringify(proofPayload, null, 2));
  console.log(`Transparency proof written to: ${proofFilePath}`);

  // 5. Update Firestore documents as anchored
  const batch = db.batch();
  snapshot.forEach((doc) => {
    batch.update(doc.ref, {
      anchored: true,
      merkleRoot: merkleRoot,
      anchoredAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();

  console.log('Firestore documents marked as anchored.');
}

generateDailyLedgerRoot().catch((err) => {
  console.error('Failed to generate daily ledger root:', err);
  process.exit(1);
});
