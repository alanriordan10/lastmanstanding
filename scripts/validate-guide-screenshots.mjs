#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const guidePaths = [
  path.join(repoRoot, 'docs', 'competition-management-guide.md'),
  path.join(repoRoot, 'docs', 'how-to-use-app-and-web.md'),
];
const screenshotDir = path.join(repoRoot, 'docs', 'assets', 'screenshots');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

for (const guidePath of guidePaths) {
  if (!fs.existsSync(guidePath)) fail(`Guide not found: ${guidePath}`);
}
if (!fs.existsSync(screenshotDir)) fail(`Screenshot directory not found: ${screenshotDir}`);

const guide = guidePaths.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
// Matches both `assets/screenshots/x.png` and (assets/screenshots/x.svg) links.
const regex = /assets\/screenshots\/([A-Za-z0-9._-]+)/g;
const referenced = new Set();
let match;
while ((match = regex.exec(guide)) !== null) {
  referenced.add(match[1]);
}

if (referenced.size === 0) {
  console.log('No screenshot references found in guide.');
  process.exit(0);
}

const missing = [];
for (const file of referenced) {
  const full = path.join(screenshotDir, file);
  if (!fs.existsSync(full)) missing.push(file);
}

console.log(`Referenced screenshots: ${referenced.size}`);
console.log(`Found screenshots: ${referenced.size - missing.length}`);

if (missing.length > 0) {
  console.log('\nMissing files:');
  for (const file of missing) console.log(`- assets/screenshots/${file}`);
  process.exit(2);
}

console.log('\nAll referenced screenshots exist.');
