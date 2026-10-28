/**
 * VocalWitness i18n Audit Script
 * Scans all translation JSON files in /translations and reports completeness against en.json.
 * Exits with code 1 if missing keys are found (ideal for CI/CD checks).
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../translations');
const BASE_LANG = 'en';

function flattenKeys(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenKeys(obj[k], pre));
    } else {
      acc[pre] = obj[k];
    }
    return acc;
  }, {});
}

function auditTranslations() {
  const baseFilePath = path.join(TRANSLATIONS_DIR, `${BASE_LANG}.json`);
  
  if (!fs.existsSync(baseFilePath)) {
    console.error(`❌ Base language file (${BASE_LANG}.json) not found in ${TRANSLATIONS_DIR}!`);
    process.exit(1);
  }

  const baseContent = JSON.parse(fs.readFileSync(baseFilePath, 'utf8'));
  const baseKeys = flattenKeys(baseContent);
  const totalKeys = Object.keys(baseKeys).length;

  console.log(`🌍 i18n Audit Report (Base: ${BASE_LANG}.json with ${totalKeys} keys)\n`);

  const files = fs.readdirSync(TRANSLATIONS_DIR).filter(f => f.endsWith('.json') && f !== `${BASE_LANG}.json`);
  
  if (files.length === 0) {
    console.log('⚠️ No other translation files found to compare against.');
    process.exit(0);
  }

  let hasErrors = false;

  files.forEach(file => {
    const langCode = path.basename(file, '.json');
    const langFilePath = path.join(TRANSLATIONS_DIR, file);
    
    let langContent;
    try {
      langContent = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    } catch (e) {
      console.error(`❌ [${langCode}] Failed to parse JSON: ${e.message}`);
      hasErrors = true;
      return;
    }

    const langKeys = flattenKeys(langContent);
    const missingKeys = Object.keys(baseKeys).filter(k => langKeys[k] === undefined || langKeys[k] === '');
    const completeness = ((totalKeys - missingKeys.length) / totalKeys * 100).toFixed(1);

    const statusIcon = completeness == 100 ? '✅' : completeness > 80 ? '⚠️' : '❌';
    console.log(`${statusIcon} ${langCode.padEnd(10)} : ${completeness}% complete (${missingKeys.length} missing keys)`);

    if (missingKeys.length > 0) {
      hasErrors = true;
      if (missingKeys.length <= 5) {
        console.log(`    Missing: ${missingKeys.join(', ')}`);
      } else {
        console.log(`    Missing keys (showing first 5 of ${missingKeys.length}): ${missingKeys.slice(0, 5).join(', ')}...`);
      }
    }
  });

  console.log('\n----------------------------------------');
  if (hasErrors) {
    console.log('❌ Audit complete: Missing translation keys detected.');
    process.exit(1); // Fails CI/CD pipeline if keys are missing
  } else {
    console.log('✨ Audit complete: All translation files are 100% complete!');
    process.exit(0);
  }
}

auditTranslations();
