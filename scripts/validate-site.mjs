/**
 * Validates migrated site routes against live site URLs.
 * Run: npm run validate:site
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LIVE = 'https://ondernemersregistratie.nl';
const DIST = join(ROOT, 'dist');

function countHtmlFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) count += countHtmlFiles(full);
    else if (entry === 'index.html') count += 1;
  }
  return count;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function localPathForUrl(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (clean === '/') return join(DIST, 'index.html');
  return join(DIST, clean.slice(1), 'index.html');
}

async function checkUrl(pathname) {
  const localFile = localPathForUrl(pathname);
  const localExists = existsSync(localFile);

  let liveStatus = 0;
  try {
    const res = await fetch(`${LIVE}${pathname}`, { redirect: 'follow' });
    liveStatus = res.status;
  } catch {
    liveStatus = -1;
  }

  return { pathname, localExists, liveStatus };
}

console.log('Collecting routes…');

const phonePages = loadJson(join(ROOT, 'src/data/phonePages.json'));
const sitemapHtml = readFileSync(join(ROOT, 'src/data/sitemapContent.html'), 'utf8');

const routes = new Set([
  '/',
  '/blog/',
  '/over-ons/',
  '/contact/',
  '/telefoonnummers/',
  '/sitemap/',
  '/category/',
]);

for (const page of phonePages) {
  routes.add(`/${page.slug}/`);
}

for (const m of sitemapHtml.matchAll(/href="\/([^"/]+)\/"/g)) {
  routes.add(`/${m[1]}/`);
}

const routeList = [...routes].sort();
console.log(`Checking ${routeList.length} routes…`);

const missingLocal = [];
const liveErrors = [];
const batchSize = 20;

for (let i = 0; i < routeList.length; i += batchSize) {
  const batch = routeList.slice(i, i + batchSize);
  const results = await Promise.all(batch.map((path) => checkUrl(path)));

  for (const result of results) {
    if (!result.localExists) missingLocal.push(result.pathname);
    if (result.liveStatus !== 200) liveErrors.push({ path: result.pathname, status: result.liveStatus });
  }

  process.stdout.write(`\rProgress: ${Math.min(i + batchSize, routeList.length)}/${routeList.length}`);
}

console.log('\n\n=== Validation Report ===');
console.log(`Total routes checked: ${routeList.length}`);
console.log(`Missing local pages: ${missingLocal.length}`);
console.log(`Live site errors: ${liveErrors.length}`);

if (missingLocal.length) {
  console.log('\nMissing local (first 20):');
  missingLocal.slice(0, 20).forEach((p) => console.log(`  - ${p}`));
}

if (liveErrors.length) {
  console.log('\nLive errors (first 10):');
  liveErrors.slice(0, 10).forEach((e) => console.log(`  - ${e.path} (${e.status})`));
}

const distHtmlCount = existsSync(DIST) ? countHtmlFiles(DIST) : 0;
console.log(`\nBuilt HTML pages in dist/: ${distHtmlCount}`);

if (missingLocal.length === 0) {
  console.log('\nAll checked routes exist locally.');
  process.exit(0);
}

process.exit(1);
