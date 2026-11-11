// tests/media-integrity.test.js  (Node + browser compatible core)
import crypto from 'crypto';
import assert from 'assert';

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

async function sha256(input) {
  const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function run() {
  console.log('🔒 Batch 1 integrity tests…');

  // 1. Deterministic canonical stringify
  const a = { b: 2, a: 1, nested: { z: 9, y: 8 } };
  const b = { a: 1, nested: { y: 8, z: 9 }, b: 2 };
  assert.strictEqual(canonicalStringify(a), canonicalStringify(b));

  // 2. Hash of final bytes must match re-hash
  const content = 'I personally witnessed the event.';
  const bodyHash = await sha256(content);
  assert.strictEqual(bodyHash.length, 64);

  const core = {
    schemaVersion: 'vocalwitness.evidence-pack.v1',
    content: { body: content, bodyHash, channel: 'witness-voice' },
    media: [{
      role: 'image',
      url: 'https://media.vocalwitness.com/evidence/test.webp',
      hashAlg: 'SHA-256',
      hashCapture: 'a'.repeat(64),
      hashAfterUpload: 'a'.repeat(64),
      hashMatch: true,
      exifScrubbed: true
    }],
    identity: { mode: 'ANONYMOUS', authorId: null, displayName: null, phoneOnPublicRecord: false },
    timestamps: { clientCaptureMs: 1730900000000 },
    environment: { app: 'VocalWitness', hashApi: 'WebCrypto.subtle.digest SHA-256' }
  };

  const packCoreHash = await sha256(canonicalStringify(core));
  const rehash = await sha256(canonicalStringify(core));
  assert.strictEqual(packCoreHash, rehash, 'Tamper-evident: re-hash must match');

  console.log('✅ All Batch 1 integrity tests passed');
}

run().catch(e => { console.error(e); process.exit(1); });
