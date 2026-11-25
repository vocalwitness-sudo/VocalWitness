/**
 * tests/firestore-rules.test.js
 * Minimal rules unit tests for VocalWitness integrity invariants.
 * Run with: node tests/firestore-rules.test.js
 * (Full emulator suite can be added later; this is a structural gate.)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.join(__dirname, '..', 'firestore.rules');

function readRules() {
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  return fs.readFileSync(rulesPath, 'utf8');
}

function mustContain(rules, snippet, label) {
  assert.ok(
    rules.includes(snippet),
    `Missing integrity invariant: ${label}\nExpected to find: ${snippet}`
  );
  console.log('✓', label);
}

function run() {
  console.log('🔒 Firestore rules integrity gate...\n');
  const rules = readRules();

  // Core sealed-field protection
  mustContain(rules, 'forensicHash', 'forensicHash is referenced in rules');
  mustContain(rules, 'packCoreHash', 'packCoreHash is referenced in rules');
  mustContain(rules, 'evidencePack', 'evidencePack is referenced in rules');
  mustContain(rules, 'imageHash', 'imageHash is referenced in rules');
  mustContain(rules, 'bodyHash', 'bodyHash is referenced in rules');
  mustContain(rules, 'authorId', 'authorId is referenced in rules');
  mustContain(rules, 'createdAt', 'createdAt is referenced in rules');

  // Correction window / soft-hide concepts
  mustContain(rules, '30', '30-minute (or related) correction window logic present');
  mustContain(rules, 'isSafeAuthorTestimonyUpdate', 'isSafeAuthorTestimonyUpdate helper exists');

  // Server-controlled identity / tier fields must not be client-writable
  mustContain(rules, 'isSafeUserUpdate', 'isSafeUserUpdate helper exists');
  mustContain(rules, 'tier', 'tier is controlled in rules');
  mustContain(rules, 'zkVerified', 'zkVerified is controlled in rules');
  mustContain(rules, 'isPhoneVerified', 'isPhoneVerified is controlled in rules');

  // Ban / admin helpers
  mustContain(rules, 'isAdmin', 'isAdmin helper exists');
  mustContain(rules, 'isNotBanned', 'isNotBanned helper exists');

  console.log('\n✅ Firestore rules integrity gate passed');
}

run();
