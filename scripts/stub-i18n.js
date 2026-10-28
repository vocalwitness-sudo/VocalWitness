/**
 * VocalWitness i18n Stub & Auto-Fill Script
 * Recursively scans secondary locale files and stubs missing keys using en.json as the source of truth.
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../translations');
const BASE_LANG = 'en';

// Deep clone & fill missing properties from source object into target object
function fillMissingKeys(source, target) {
  let addedCount = 0;

  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      addedCount += fillMissingKeys(source[key], target[key]);
    } else {
      if (target[key] === undefined || target[key] === '') {
        // Stub format: Mark clearly so translators or automated workflows can spot stubs
        target[key] = `[STUB] ${source[key]}`;
        addedCount++;
      }
    }
  }
  return addedCount;
}

function runStubber() {
  const baseFilePath = path.join(TRANSLATIONS_DIR, `${BASE_LANG}.json`);

  if (!fs.existsSync(baseFilePath)) {
    console.error(`❌ Base language file (${BASE_LANG}.json) not found in ${TRANSLATIONS_DIR}!`);
    process.exit(1);
  }

  const baseContent = JSON.parse(fs.readFileSync(baseFilePath, 'utf8'));
  const files = fs.readdirSync(TRANSLATIONS_DIR).filter(f => f.endsWith('.json') && f !== `${BASE_LANG}.json`);

  if (files.length === 0) {
    console.log('⚠️ No other translation files found to stub.');
    process.exit(0);
  }

  console.log('🛠️ Starting VocalWitness i18n Auto-Stubber...\n');

  files.forEach(file => {
    const langFilePath = path.join(TRANSLATIONS_DIR, file);
    let langContent = {};

    try {
      const fileData = fs.readFileSync(langFilePath, 'utf8');
      langContent = fileData.trim() ? JSON.parse(fileData) : {};
    } catch (e) {
      console.warn(`⚠️ [${file}] Could not parse existing JSON (initializing fresh structure): ${e.message}`);
    }

    const added = fillMissingKeys(baseContent, langContent);

    if (added > 0) {
      // Write back nicely formatted JSON with 2-space indentation
      fs.writeFileSync(langFilePath, JSON.stringify(langContent, null, 2) + '\n', 'utf8');
      console.log(`✅ [${file}] Added and stubbed ${added} missing key(s).`);
    } else {
      console.log(`✨ [${file}] Already fully synchronized.`);
    }
  });

  console.log('\n🎉 Translation stubbing complete!');
}

runStubber();
