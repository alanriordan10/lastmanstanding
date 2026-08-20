#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrerenderRoutes } from './publicRoutes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const DEFAULT_SITE_ORIGIN = 'https://runlastmanstanding.com';

function normalizeOrigin(origin) {
  const trimmed = String(origin || '').trim().replace(/\/$/, '');
  try {
    return new URL(trimmed).origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN || DEFAULT_SITE_ORIGIN);

async function prerender() {
  try {
    console.log('📄 Prerendering public routes to static HTML...');

    // Read the base index.html
    const indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');
    const prerenderRoutes = await getPrerenderRoutes();

    // For each route, create a dedicated HTML file
    for (const route of prerenderRoutes) {
      // Skip root — it's already index.html
      if (route === '/') continue;

      // Convert route to file path
      // /faq → faq.html
      // /blog/how-to-run-a-last-man-standing-competition → blog/how-to-run-a-last-man-standing-competition.html
      // /guide → guide.html
      // /register-club → register-club.html
      const fileName = route.slice(1) + '.html';
      const filePath = path.join(distDir, fileName);

      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Create HTML with base href adjustment for subdirectory routes
      // This ensures relative imports still work correctly
      let html = indexHtml;

      // Ensure prerendered pages ship the correct canonical URL even before JS runs.
      const routeCanonical = `${SITE_ORIGIN}${route}`;
      html = html
        .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${routeCanonical}" />`)
        .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${routeCanonical}" />`);

      // If the route is a subdirectory (contains /), inject a <base> tag
      // to help the SPA router find assets correctly
      if (route.includes('/') && !route.endsWith('/')) {
        // e.g., /faq/details → <base href="/faq/details/">
        const baseHref = `${route}/`;
        html = html.replace(
          '<head>',
          `<head>\n    <base href="${baseHref}">`
        );
      }

      await fs.writeFile(filePath, html, 'utf-8');
      console.log(`  ✓ ${fileName}`);
    }

    console.log('✅ Prerendering complete!');
  } catch (error) {
    console.error('❌ Prerendering failed:', error);
    process.exit(1);
  }
}

prerender();

