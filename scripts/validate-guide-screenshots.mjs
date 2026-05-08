#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const guidePath = path.join(repoRoot, 'docs', 'competition-management-guide.md');
const screenshotDir = path.join(repoRoot, 'docs', 'assets', 'screenshots');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(guidePath)) fail(`Guide not found: ${guidePath}`);
if (!fs.existsSync(screenshotDir)) fail(`Screenshot directory not found: ${screenshotDir}`);

const guide = fs.readFileSync(guidePath, 'utf8');
const regex = /`assets\/screenshots\/([^`]+)`/g;
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
