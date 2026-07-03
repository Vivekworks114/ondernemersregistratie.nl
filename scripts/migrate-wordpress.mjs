/**
 * WordPress WXR → Astro content migration
 * Parses XML export, downloads media, generates MDX blog posts + metadata.
 */
import { XMLParser } from 'fast-xml-parser';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const XML_PATH =
  process.argv[2] ||
  'C:/Users/Asus/Downloads/ondernemersregistratienl.WordPress.2026-06-30.xml';
const BLOG_DIR = join(ROOT, 'src/content/blog');
const AUTHORS_DIR = join(ROOT, 'src/content/authors');
const CATEGORIES_DIR = join(ROOT, 'src/content/categories');
const TAGS_DIR = join(ROOT, 'src/content/tags');
const MEDIA_DIR = join(ROOT, 'public/images/content');
const BASE_URL = 'https://ondernemersregistratie.nl';

const downloaded = new Map();
const downloadLog = [];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractValue(val) {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return extractValue(val[0]);
  if (typeof val === 'object') {
    if (val['#text'] !== undefined) return String(val['#text']).trim();
    if (val['@_nicename']) return String(val['#text'] ?? val['@_nicename']).trim();
  }
  return String(val).trim();
}

/** @deprecated use extractValue */
function stripCDATA(str) {
  return extractValue(str);
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\[&hellip;\]/g, '…')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function yamlEscape(str) {
  if (!str) return '""';
  const cleaned = str.replace(/"/g, '\\"').replace(/\n/g, ' ');
  return `"${cleaned}"`;
}

function prepareBody(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();
}

async function downloadFile(url, destPath) {
  if (downloaded.has(url)) return downloaded.get(url);
  if (existsSync(destPath)) {
    const local = destPath.replace(join(ROOT, 'public'), '').replace(/\\/g, '/');
    downloaded.set(url, local);
    return local;
  }

  try {
    ensureDir(dirname(destPath));
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      downloadLog.push(`FAIL ${res.status} ${url}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buffer);
    const local = destPath.replace(join(ROOT, 'public'), '').replace(/\\/g, '/');
    downloaded.set(url, local);
    downloadLog.push(`OK ${local}`);
    return local;
  } catch (err) {
    downloadLog.push(`ERR ${url} ${err.message}`);
    return null;
  }
}

function wpUploadPath(url) {
  const match = url.match(/wp-content\/uploads\/(.+)$/);
  return match ? match[1] : null;
}

async function localizeUrl(url) {
  if (!url || !url.includes('ondernemersregistratie.nl/wp-content/uploads/')) {
    return url;
  }

  const rel = wpUploadPath(url);
  if (!rel) return url;

  const destPath = join(MEDIA_DIR, rel.replace(/\//g, '\\'));
  const local = await downloadFile(url.split('?')[0], destPath);
  return local || url;
}

async function localizeContent(html) {
  if (!html) return '';

  const urls = [
    ...html.matchAll(
      /https?:\/\/ondernemersregistratie\.nl\/wp-content\/uploads\/[^"'\s)]+/g
    ),
  ].map((m) => m[0]);

  let result = html;
  for (const url of [...new Set(urls)]) {
    const local = await localizeUrl(url);
    if (local && local.startsWith('/')) {
      result = result.split(url).join(local);
    }
  }

  // Fix internal WordPress links to Astro paths
  result = result.replace(
    /https?:\/\/ondernemersregistratie\.nl\//g,
    '/'
  );

  return result;
}

function getMetaValue(postmeta, key) {
  const items = asArray(postmeta);
  const found = items.find((m) => extractValue(m['wp:meta_key']) === key);
  return found ? extractValue(found['wp:meta_value']) : '';
}

function getTerms(item) {
  const terms = asArray(item.category);
  const categories = [];
  const tags = [];

  for (const term of terms) {
    const domain = term['@_domain'];
    const nicename = extractValue(term['@_nicename'] || term);
    const name = extractValue(term['#text'] || term) || nicename;
    if (domain === 'category' && nicename) categories.push(name || nicename);
    if (domain === 'post_tag' && nicename) tags.push(name || nicename);
  }

  return { categories, tags };
}

function sanitizeSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log('Reading WordPress XML...');
  const xml = readFileSync(XML_PATH, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '#text',
    isArray: (name) =>
      ['item', 'wp:author', 'wp:category', 'wp:tag', 'wp:term', 'category'].includes(
        name
      ),
  });

  const data = parser.parse(xml);
  const channel = data.rss.channel;
  const items = asArray(channel.item);

  ensureDir(BLOG_DIR);
  ensureDir(AUTHORS_DIR);
  ensureDir(CATEGORIES_DIR);
  ensureDir(TAGS_DIR);
  ensureDir(MEDIA_DIR);

  // Authors
  const authors = asArray(channel['wp:author']).map((a) => ({
    id: extractValue(a['wp:author_id']),
    login: extractValue(a['wp:author_login']),
    email: extractValue(a['wp:author_email']),
    name: extractValue(a['wp:author_display_name']),
  }));
  writeFileSync(join(AUTHORS_DIR, 'authors.json'), JSON.stringify(authors, null, 2));

  // Categories
  const categories = asArray(channel['wp:category']).map((c) => ({
    id: extractValue(c['wp:term_id']),
    slug: extractValue(c['wp:category_nicename']),
    name: extractValue(c['wp:cat_name']),
  }));
  writeFileSync(
    join(CATEGORIES_DIR, 'categories.json'),
    JSON.stringify(categories, null, 2)
  );

  // Tags
  const tags = asArray(channel['wp:tag']).map((t) => ({
    id: extractValue(t['wp:term_id']),
    slug: extractValue(t['wp:tag_slug']),
    name: extractValue(t['wp:tag_name']),
  }));
  writeFileSync(join(TAGS_DIR, 'tags.json'), JSON.stringify(tags, null, 2));

  // Attachment map
  const attachments = new Map();
  for (const item of items) {
    if (extractValue(item['wp:post_type']) !== 'attachment') continue;
    const id = extractValue(item['wp:post_id']);
    const url =
      extractValue(item['wp:attachment_url']) ||
      extractValue(item.guid?.['#text'] || item.guid);
    if (id && url) attachments.set(id, url);
  }

  console.log(`Attachments: ${attachments.size}`);

  const posts = items.filter(
    (item) =>
      extractValue(item['wp:post_type']) === 'post' &&
      extractValue(item['wp:status']) === 'publish'
  );

  console.log(`Published posts: ${posts.length}`);

  const manifest = [];
  let migrated = 0;

  for (const item of posts) {
    const slug = sanitizeSlug(extractValue(item['wp:post_name']));
    if (!slug) continue;

    const title = extractValue(item.title?.['#text'] || item.title);
    const excerpt = stripHtml(extractValue(item['excerpt:encoded']));
    const content = extractValue(item['content:encoded']);
    const author = extractValue(item['dc:creator']);
    const pubDate = extractValue(item['wp:post_date']);
    const updatedDate = extractValue(item['wp:post_modified']);
    const { categories: postCategories, tags: postTags } = getTerms(item);

    const thumbnailId = getMetaValue(item['wp:postmeta'], '_thumbnail_id');
    let featuredImage = '';

    if (thumbnailId && attachments.has(thumbnailId)) {
      featuredImage = await localizeUrl(attachments.get(thumbnailId));
    }

    if (!featuredImage) {
      // Extract first image from content
      const imgMatch = content.match(
        /https?:\/\/ondernemersregistratie\.nl\/wp-content\/uploads\/[^"'\s]+/
      );
      if (imgMatch) featuredImage = await localizeUrl(imgMatch[0]);
    }

    if (!featuredImage) {
      const hash = createHash('md5').update(slug).digest('hex');
      const idx = (parseInt(hash.slice(0, 2), 16) % 13) + 1;
      featuredImage = `/images/blog/featured-${idx}.png`;
    }

    const localizedContent = await localizeContent(content);
    const description = excerpt || stripHtml(localizedContent).slice(0, 200);

    const frontmatter = [
      '---',
      `title: ${yamlEscape(title)}`,
      `description: ${yamlEscape(description)}`,
      `pubDate: ${yamlEscape(pubDate)}`,
      updatedDate !== pubDate ? `updatedDate: ${yamlEscape(updatedDate)}` : null,
      author ? `author: ${yamlEscape(author)}` : null,
      postCategories.length
        ? `categories:\n${postCategories.map((c) => `  - ${yamlEscape(c)}`).join('\n')}`
        : null,
      postTags.length
        ? `tags:\n${postTags.map((t) => `  - ${yamlEscape(t)}`).join('\n')}`
        : null,
      `featuredImage: ${yamlEscape(featuredImage)}`,
      `slug: ${yamlEscape(slug)}`,
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const body = prepareBody(localizedContent);
    const mdx = `${frontmatter}\n\n${body}\n`;
    const outPath = join(BLOG_DIR, `${slug}.md`);
    writeFileSync(outPath, mdx, 'utf-8');

    manifest.push({ slug, title, pubDate, featuredImage, author });
    migrated++;

    if (migrated % 10 === 0) process.stdout.write('.');
  }

  writeFileSync(
    join(ROOT, 'src/content/blog/manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  writeFileSync(join(ROOT, 'scripts/download-log.txt'), downloadLog.join('\n'));

  console.log(`\nMigrated ${migrated} blog posts to ${BLOG_DIR}`);
  console.log(`Downloaded ${downloaded.size} media files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
