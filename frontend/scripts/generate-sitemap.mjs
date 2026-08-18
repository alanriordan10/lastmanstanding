#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSitemapEntries } from './publicRoutes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const SITE_ORIGIN = 'https://runlastmanstanding.com';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function generateSitemap() {
  try {
    const entries = await getSitemapEntries();
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((entry) => [
        '  <url>',
        `    <loc>${escapeXml(`${SITE_ORIGIN}${entry.loc}`)}</loc>`,
        `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
        `    <priority>${escapeXml(entry.priority)}</priority>`,
        '  </url>',
      ].join('\n')),
      '</urlset>',
      '',
    ].join('\n');

    await fs.writeFile(sitemapPath, xml, 'utf-8');
    console.log(`🗺️  Wrote sitemap with ${entries.length} URLs to ${sitemapPath}`);
  } catch (error) {
    console.error('❌ Sitemap generation failed:', error);
    process.exit(1);
  }
}

generateSitemap();

