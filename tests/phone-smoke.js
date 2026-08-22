/**
 * Lightweight smoke test for phone verification.
 * Only checks that the file exists and contains the required exports.
 * Does NOT import the real browser module (avoids Firebase/CDN issues in Node).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSmoke() {
  console.log('🔍 Running phone verification smoke test...');

  const filePath = path.join(__dirname, '../js/phoneVerification.js');

  if (!fs.existsSync(filePath)) {
    console.error('❌ js/phoneVerification.js not found');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const required = [
    'initPhoneRecaptcha',
    'sendPhoneVerification',
    'verifyPhoneCode'
  ];

  let failed = false;

  for (const name of required) {
    const hasExport =
      content.includes(`export function ${name}`) ||
      content.includes(`export async function ${name}`);

    if (!hasExport) {
      console.error(`❌ Missing export: ${name}`);
      failed = true;
    } else {
      console.log(`  ✓ Found ${name}`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log('✅ Phone verification smoke test passed');
  process.exit(0);
}

runSmoke();
