// scripts/syntax-check.mjs
// Fail fast on parse errors before ESLint (Batch 6)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['js', 'functions', 'scripts', 'tests'].map((d) => path.join(root, d));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = dirs.flatMap((d) => walk(d));
let failed = 0;

for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`\n❌ SYNTAX: ${path.relative(root, file)}`);
    console.error(r.stderr || r.stdout);
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed node --check`);
  process.exit(1);
}
console.log(`✅ syntax-check: ${files.length} files OK`);
