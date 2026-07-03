/**
 * Fetches phone page registry and static page HTML from the live WordPress site.
 * Run: node scripts/fetch-phone-registry.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'src', 'data');
const LIVE = 'https://ondernemersregistratie.nl';

mkdirSync(DATA_DIR, { recursive: true });

async function fetchPage(slug) {
  const res = await fetch(`${LIVE}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Failed to fetch page ${slug}: ${res.status}`);
  const pages = await res.json();
  if (!pages.length) throw new Error(`Page not found: ${slug}`);
  return pages[0];
}

function toRelativeHtml(html) {
  return html
    .replaceAll('https://ondernemersregistratie.nl', '')
    .replaceAll('http://ondernemersregistratie.nl', '');
}

function extractPhoneLinks(html) {
  const map = new Map();
  for (const m of html.matchAll(/href="(?:https:\/\/ondernemersregistratie\.nl)?\/([^"/]+)\/">([^<]+)<\/a>/gi)) {
    const slug = m[1].trim();
    const label = m[2].trim();
    if (/^[0-9]/.test(slug) || /^0[0-9-]/.test(slug) || /^\d/.test(slug)) {
      map.set(slug, label);
    }
  }
  return map;
}

function extractAllLinks(html) {
  const map = new Map();
  for (const m of html.matchAll(/href="(?:https:\/\/ondernemersregistratie\.nl)?\/([^"/]*)\/">([^<]+)<\/a>/gi)) {
    const slug = m[1].trim();
    const label = m[2].trim();
    if (slug) map.set(slug, label);
  }
  return map;
}

console.log('Fetching telefoonnummers page…');
const telefoonPage = await fetchPage('telefoonnummers');
const telefoonHtml = toRelativeHtml(telefoonPage.content.rendered);

console.log('Fetching sitemap page…');
const sitemapPage = await fetchPage('sitemap');
const sitemapHtml = toRelativeHtml(sitemapPage.content.rendered);

console.log('Fetching category page…');
const categoryPage = await fetchPage('category');
const categoryHtml = toRelativeHtml(categoryPage.content.rendered);

const phoneMap = new Map([
  ...extractPhoneLinks(telefoonHtml),
  ...extractPhoneLinks(sitemapHtml),
]);

const phonePages = [...phoneMap.entries()]
  .map(([slug, label]) => ({ slug, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'nl'));

writeFileSync(join(DATA_DIR, 'phonePages.json'), JSON.stringify(phonePages, null, 2));
writeFileSync(join(DATA_DIR, 'telefoonnummersContent.html'), telefoonHtml);
writeFileSync(join(DATA_DIR, 'sitemapContent.html'), sitemapHtml);
writeFileSync(join(DATA_DIR, 'categoryContent.html'), categoryHtml);

const sitemapLinks = extractAllLinks(sitemapHtml);
console.log(`Phone pages: ${phonePages.length}`);
console.log(`Sitemap links: ${sitemapLinks.size}`);
console.log('Saved src/data/phonePages.json and HTML content files.');
