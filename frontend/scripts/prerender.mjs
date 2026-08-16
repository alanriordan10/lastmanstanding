#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexHtmlPath = path.join(distDir, 'index.html');

/**
 * Routes to prerender as static HTML files.
 * Each route will get its own HTML file with SPA-compatible routing.
 */
const PRERENDER_ROUTES = [
  '/',
  '/faq',
  '/guide',
  '/services',
  '/pricing',
  '/contact',
  '/refund-policy',
  '/privacy',
  '/terms',
  '/login',
  '/signup',
  '/register-club',
  '/create-club',
  '/forgot-password',
];

async function prerender() {
  try {
    console.log('📄 Prerendering public routes to static HTML...');

    // Read the base index.html
    const indexHtml = await fs.readFile(indexHtmlPath, 'utf-8');

    // For each route, create a dedicated HTML file
    for (const route of PRERENDER_ROUTES) {
      // Skip root — it's already index.html
      if (route === '/') continue;

      // Convert route to file path
      // /faq → faq.html
      // /guide → guide.html
      // /register-club → register-club.html
      const fileName = route.slice(1) + '.html';
      const filePath = path.join(distDir, fileName);

      // Create HTML with base href adjustment for subdirectory routes
      // This ensures relative imports still work correctly
      let html = indexHtml;

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

