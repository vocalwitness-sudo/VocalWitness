import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DIST = "dist";

console.log("🚀 Starting production build...\n");

// 1. Clean previous build
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST);

// 2. Build CSS (minified)
console.log("🎨 Building CSS...");
execSync("npx @tailwindcss/cli -i ./input.css -o ./style.css --minify", {
  stdio: "inherit",
});

// 3. Audit i18n
console.log("🌍 Auditing translations...");
execSync("node scripts/audit-i18n.js", { stdio: "inherit" });

// 4. Files & folders to copy into dist/
const toCopy = [
  // HTML pages
  "index.html",
  "about.html",
  "admin.html",
  "dao.html",
  "forensic-ledger.html",
  "governance.html",
  "group-detail.html",
  "groups.html",
  "journalist-verify.html",
  "live-arena.html",
  "moderation.html",
  "my-testimonies.html",
  "privacy.html",
  "profile.html",
  "safety.html",
  "status.html",
  "terms.html",
  "transparency.html",
  "true-witness.html",
  "verify.html",
  "witness-voice.html",

  // Core assets
  "style.css",
  "manifest.json",
  "sw.js",
  "favicon.ico",
  "logo.png",

  // Folders
  "js",
  "translations",
  "c2pa",
];

// Copy everything
for (const item of toCopy) {
  const src = path.resolve(item);
  const dest = path.resolve(DIST, item);

  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Skipped (not found): ${item}`);
    continue;
  }

  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`✅ Copied: ${item}`);
}

console.log("\n✨ Production build complete → /dist");
console.log("You can now deploy with: firebase deploy --only hosting");
