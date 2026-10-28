/**
 * VocalWitness i18n Auto-Stubber (ESM Version)
 * Recursively scans secondary locale files and stubs missing keys
 * using en.json as the source of truth.
 *
 * Usage:
 *   node scripts/stub-i18n.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSLATIONS_DIR = path.join(__dirname, '../translations');
const BASE_LANG = 'en';
const STUB_PREFIX = '[STUB] ';

/**
 * Recursively fills missing keys from source into target.
 * Returns the number of keys that were added/stubbed.
 */
function fillMissingKeys(source, target) {
  let addedCount = 0;

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];

    // Nested object
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal)
    ) {
      if (
        !target[key] ||
        typeof target[key] !== 'object' ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }
      addedCount += fillMissingKeys(sourceVal, target[key]);
    }
    // Leaf value
    else {
      if (target[key] === undefined || target[key] === '') {
        target[key] = `${STUB_PREFIX}${sourceVal}`;
        addedCount++;
      }
    }
  }

  return addedCount;
}

function runStubber() {
  const baseFilePath = path.join(TRANSLATIONS_DIR, `${BASE_LANG}.json`);

  if (!fs.existsSync(baseFilePath)) {
    console.error(
      `❌ Base language file (${BASE_LANG}.json) not found in ${TRANSLATIONS_DIR}!`
    );
    process.exit(1);
  }

  let baseContent;
  try {
    baseContent = JSON.parse(fs.readFileSync(baseFilePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${BASE_LANG}.json: ${err.message}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(TRANSLATIONS_DIR)
    .filter(
      (f) =>
        f.endsWith('.json') &&
        f !== `${BASE_LANG}.json` &&
        !f.includes(' ') // skip files with spaces in the name
    );

  if (files.length === 0) {
    console.log('⚠️  No other translation files found to stub.');
    process.exit(0);
  }

  console.log('🛠️  Starting VocalWitness i18n Auto-Stubber...\n');

  let totalAdded = 0;

  for (const file of files) {
    const langFilePath = path.join(TRANSLATIONS_DIR, file);
    let langContent = {};

    try {
      const raw = fs.readFileSync(langFilePath, 'utf8').trim();
      langContent = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn(
        `⚠️  [${file}] Could not parse existing JSON – starting with empty object: ${err.message}`
      );
      langContent = {};
    }

    const added = fillMissingKeys(baseContent, langContent);

    if (added > 0) {
      fs.writeFileSync(
        langFilePath,
        JSON.stringify(langContent, null, 2) + '\n',
        'utf8'
      );
      console.log(`✅  [${file}] Added and stubbed ${added} missing key(s).`);
      totalAdded += added;
    } else {
      console.log(`✨  [${file}] Already fully synchronized.`);
    }
  }

  console.log('\n----------------------------------------');
  if (totalAdded > 0) {
    console.log(`🎉  Stubbing complete! ${totalAdded} key(s) added across all files.`);
  } else {
    console.log('✨  All translation files are already fully synchronized.');
  }
}

runStubber();
