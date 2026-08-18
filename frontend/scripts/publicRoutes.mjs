import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const articlesPath = path.join(projectRoot, 'src/content/articles.ts');

export const STATIC_INDEXABLE_ROUTES = [
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

const CONTENT_ROUTE_PREFIXES = {
  blogPosts: '/blog',
  guides: '/guides',
};

function extractSectionSlugs(source, sectionName) {
  const startMarker = `export const ${sectionName}: Article[] = [`;
  const start = source.indexOf(startMarker);
  if (start === -1) return [];

  const afterStart = source.slice(start + startMarker.length);
  const endMarker = sectionName === 'blogPosts'
    ? `\nexport const guides: Article[] = [`
    : `\n];`;
  const end = afterStart.indexOf(endMarker);
  const section = end === -1 ? afterStart : afterStart.slice(0, end);

  const slugRegex = /slug:\s*'([^']+)'/g;
  const slugs = [];
  let match;
  while ((match = slugRegex.exec(section)) !== null) {
    slugs.push(match[1]);
  }
  return [...new Set(slugs)];
}

export async function getContentArticleRoutes() {
  const source = await fs.readFile(articlesPath, 'utf-8');
  const blogSlugs = extractSectionSlugs(source, 'blogPosts');
  const guideSlugs = extractSectionSlugs(source, 'guides');

  return {
    blogSlugs,
    guideSlugs,
    blogRoutes: blogSlugs.map((slug) => `${CONTENT_ROUTE_PREFIXES.blogPosts}/${slug}`),
    guideRoutes: guideSlugs.map((slug) => `${CONTENT_ROUTE_PREFIXES.guides}/${slug}`),
  };
}

export async function getPrerenderRoutes() {
  const { blogRoutes, guideRoutes } = await getContentArticleRoutes();
  return [
    ...STATIC_INDEXABLE_ROUTES.slice(0, 2),
    '/blog',
    ...blogRoutes,
    '/guides',
    ...guideRoutes,
    ...STATIC_INDEXABLE_ROUTES.slice(2),
  ];
}

export async function getSitemapEntries() {
  const { blogRoutes, guideRoutes } = await getContentArticleRoutes();

  return [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/login', changefreq: 'monthly', priority: '0.5' },
    { loc: '/signup', changefreq: 'monthly', priority: '0.5' },
    { loc: '/register-club', changefreq: 'monthly', priority: '0.6' },
    { loc: '/create-club', changefreq: 'monthly', priority: '0.6' },
    { loc: '/forgot-password', changefreq: 'monthly', priority: '0.4' },
    { loc: '/blog', changefreq: 'weekly', priority: '0.9' },
    ...blogRoutes.map((loc) => ({ loc, changefreq: 'monthly', priority: '0.8' })),
    { loc: '/guides', changefreq: 'monthly', priority: '0.8' },
    ...guideRoutes.map((loc) => ({ loc, changefreq: 'monthly', priority: '0.7' })),
    { loc: '/faq', changefreq: 'monthly', priority: '0.8' },
    { loc: '/guide', changefreq: 'monthly', priority: '0.9' },
    { loc: '/services', changefreq: 'monthly', priority: '0.8' },
    { loc: '/pricing', changefreq: 'monthly', priority: '0.7' },
    { loc: '/contact', changefreq: 'monthly', priority: '0.6' },
    { loc: '/refund-policy', changefreq: 'yearly', priority: '0.4' },
    { loc: '/privacy', changefreq: 'yearly', priority: '0.4' },
    { loc: '/terms', changefreq: 'yearly', priority: '0.4' },
  ];
}

