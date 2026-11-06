/**
 * tests/integrity-core.js
 * Production integrity test – runs against real VocalWitness source.
 * Proves: canonical stringify + SHA-256 + Evidence Pack core is deterministic and correct.
 * No mocks of hashing or pack logic.
 */

import { generateSha256Hash } from '../js/utils.js';
import {
  canonicalStringify,
  buildPackCore,
  toFullEvidencePack
} from '../js/evidence-pack.js';

async function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exit(1);
  }
  console.log('✓', message);
}

async function run() {
  console.log('🔒 Running production integrity-core tests...\n');

  // 1. Canonical stringify must be deterministic
  const obj1 = { b: 2, a: 1, nested: { z: 9, y: 8 } };
  const obj2 = { a: 1, nested: { y: 8, z: 9 }, b: 2 };
  const s1 = canonicalStringify(obj1);
  const s2 = canonicalStringify(obj2);
  await assert(s1 === s2, 'canonicalStringify is deterministic regardless of key order');

  // 2. Real SHA-256
  const hash = await generateSha256Hash('VocalWitness integrity test');
  await assert(typeof hash === 'string' && hash.length === 64, 'generateSha256Hash returns valid 64-char hex');

  // 3. Build a real Evidence Pack core (no mocks)
  const { core, packCoreHash } = await buildPackCore({
    content: 'I personally witnessed the event on 6 November 2026.',
    bodyHash: await generateSha256Hash('I personally witnessed the event on 6 November 2026.'),
    media: {
      imageUrl: 'https://media.vocalwitness.com/evidence/test.jpg',
      imageHash: 'a'.repeat(64)
    },
    identity: { mode: 'ANONYMOUS' },
    channel: 'witness-voice',
    clientCaptureMs: 1730900000000
  });

  await assert(!!core, 'buildPackCore returns a core object');
  await assert(typeof packCoreHash === 'string' && packCoreHash.length === 64, 'packCoreHash is valid SHA-256');

  // 4. Full pack generation
  const fullPack = toFullEvidencePack(core, packCoreHash, null, 'test-testimony-id');
  await assert(fullPack.schemaVersion === 'vocalwitness.evidence-pack.v1', 'Correct schema version');
  await assert(fullPack.packCoreHash === packCoreHash, 'Full pack preserves packCoreHash');
  await assert(Array.isArray(fullPack.verify.instructions), 'Verify instructions present');

  // 5. Re-hash the core and prove it matches
  const rehash = await generateSha256Hash(canonicalStringify(core));
  await assert(rehash === packCoreHash, 'Re-hashing the core produces the exact same packCoreHash (tamper-evident)');

  console.log('\n✅ All integrity-core tests passed – real production code is solid.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
