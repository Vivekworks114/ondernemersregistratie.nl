/**
 * Export WordPress pages metadata from WXR for reference / future CMS integration.
 * Page rendering remains in existing Astro page components.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const XML_PATH =
  process.argv[2] ||
  'C:/Users/Asus/Downloads/ondernemersregistratienl.WordPress.2026-06-30.xml';
const PAGES_DIR = join(ROOT, 'src/content/pages');

function asArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function extractValue(val) {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return extractValue(val[0]);
  if (typeof val === 'object' && val['#text'] !== undefined) return String(val['#text']).trim();
  return String(val).trim();
}

const xml = readFileSync(XML_PATH, 'utf-8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#text',
  isArray: (name) => ['item', 'category'].includes(name),
});

const items = asArray(parser.parse(xml).rss.channel.item);
const pages = items
  .filter(
    (i) =>
      extractValue(i['wp:post_type']) === 'page' && extractValue(i['wp:status']) === 'publish'
  )
  .map((i) => ({
    slug: extractValue(i['wp:post_name']),
    title: extractValue(i.title?.['#text'] || i.title),
    link: extractValue(i.link),
    pubDate: extractValue(i['wp:post_date']),
    modified: extractValue(i['wp:post_modified']),
  }));

if (!existsSync(PAGES_DIR)) mkdirSync(PAGES_DIR, { recursive: true });
writeFileSync(join(PAGES_DIR, 'pages.json'), JSON.stringify(pages, null, 2));
console.log(`Exported ${pages.length} pages to src/content/pages/pages.json`);
