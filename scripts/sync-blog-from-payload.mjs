#!/usr/bin/env node
/**
 * Merge published Payload blog posts into src/content/blog/*.md.
 * Legacy WordPress articles in git are never deleted (merge mode).
 *
 * Env:
 *   PAYLOAD_URL or PUBLIC_PAYLOAD_URL
 *   PAYLOAD_API_KEY (optional in CI — tenant-cli sync runs before build)
 *   TENANT_SLUG (default ondernemersregistratie)
 *   PAYLOAD_SYNC_SKIP=1 to skip
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rebuildMarkdown,
  resolveBlogCategories,
  resolveBlogHeroImage,
  splitFrontmatter,
} from './lib/blog-frontmatter.mjs';
import { extractMediaPath, resolveMediaUrl } from './lib/media-url.mjs';
import { isLegacyFrontmatter, payloadFrontmatterFields, PAYLOAD_SOURCE } from './lib/blog-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const TENANT = process.env.TENANT_SLUG || 'ondernemersregistratie';
const DEFAULT_PAYLOAD_URL = 'https://payload.10beste.com';

async function loadDotEnv() {
  for (const name of ['.env', '.env.astropayload']) {
    try {
      const text = await fs.readFile(path.join(ROOT, name), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      /* optional */
    }
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function mediaEnv() {
  return {
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    PUBLIC_R2_URL: process.env.PUBLIC_R2_URL,
    PUBLIC_PAYLOAD_MEDIA_URL: process.env.PUBLIC_PAYLOAD_MEDIA_URL,
    PUBLIC_MEDIA_URL: process.env.PUBLIC_MEDIA_URL,
    PUBLIC_PAYLOAD_URL: process.env.PUBLIC_PAYLOAD_URL || process.env.PAYLOAD_URL,
    PAYLOAD_URL: process.env.PAYLOAD_URL,
  };
}

function resolveDocImage(doc, keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let cur = doc;
    for (const part of parts) {
      if (cur == null) {
        cur = null;
        break;
      }
      cur = cur[part];
    }
    const pathOrUrl = extractMediaPath(cur);
    if (!pathOrUrl) continue;
    const resolved = resolveMediaUrl(pathOrUrl, { env: mediaEnv(), fallback: null });
    if (resolved) return resolved;
  }
  return '';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lexicalNodeToHtml(node) {
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(lexicalNodeToHtml).join('');

  const type = node.type;
  const children = Array.isArray(node.children) ? node.children.map(lexicalNodeToHtml).join('') : '';

  if (type === 'text') {
    let text = escapeHtml(node.text || '');
    const format = Number(node.format || 0);
    if (format & 1) text = `<strong>${text}</strong>`;
    if (format & 2) text = `<em>${text}</em>`;
    if (format & 4) text = `<s>${text}</s>`;
    if (format & 8) text = `<u>${text}</u>`;
    if (format & 16) text = `<code>${text}</code>`;
    return text;
  }
  if (type === 'linebreak') return '<br>';
  if (type === 'paragraph') return `<p>${children}</p>`;
  if (type === 'heading') {
    const tag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag) ? node.tag : 'h2';
    return `<${tag}>${children}</${tag}>`;
  }
  if (type === 'quote') return `<blockquote>${children}</blockquote>`;
  if (type === 'list') {
    const tag = node.listType === 'number' || node.tag === 'ol' ? 'ol' : 'ul';
    return `<${tag}>${children}</${tag}>`;
  }
  if (type === 'listitem' || type === 'list-item') return `<li>${children}</li>`;
  if (type === 'link' || type === 'autolink') {
    const href = node.url || node.fields?.url || '#';
    return `<a href="${escapeHtml(href)}">${children}</a>`;
  }
  if (type === 'upload' || type === 'image') {
    const src = node.value?.url || node.src || extractMediaPath(node.value) || '';
    if (!src) return children;
    const resolved = resolveMediaUrl(src, { env: mediaEnv(), fallback: src });
    const alt = escapeHtml(node.alt || node.value?.alt || '');
    return `<img src="${escapeHtml(resolved)}" alt="${alt}">`;
  }
  if (type === 'horizontalrule' || type === 'horizontalRule') return '<hr>';
  if (type === 'code') return `<pre><code>${children || escapeHtml(node.text || '')}</code></pre>`;
  if (type === 'root' || type === 'block' || type === 'layout-container') return children;
  return children;
}

function lexicalToHtml(value) {
  if (!value || typeof value !== 'object') return '';
  if (value.root) return lexicalNodeToHtml(value.root);
  return lexicalNodeToHtml(value);
}

function toHtml(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return toHtml(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(value)) return value.map(toHtml).filter(Boolean).join('');
  if (typeof value === 'object') {
    if (typeof value.html === 'string' && value.html.trim()) return value.html;
    if (value.root) return lexicalToHtml(value);
    for (const key of ['content', 'body', 'richText', 'children']) {
      if (value[key]) {
        const nested = toHtml(value[key]);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function extractBodyHtml(doc) {
  for (const key of ['contentHtml', 'html', 'bodyHtml', 'content', 'body', 'richText', 'layout', 'blocks']) {
    const html = toHtml(doc[key]);
    if (html && html.replace(/<[^>]+>/g, '').trim().length > 0) return html;
  }
  return '';
}

function extractTitle(doc) {
  return String(doc.title || doc.headline || doc.name || '').trim();
}

function extractDescription(doc) {
  const raw = doc.meta?.description || doc.seo?.description || doc.description || doc.excerpt || doc.summary || '';
  const text = String(raw).replace(/<[^>]+>/g, '').trim();
  if (text) return text;
  return extractBodyHtml(doc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function extractAuthor(doc) {
  const author = doc.author || doc.authors?.[0] || doc.createdBy;
  if (!author) return 'Redactie';
  if (typeof author === 'string') return author;
  return author.name || author.fullName || author.email || 'Redactie';
}

function extractDate(doc) {
  const raw = doc.publishedAt || doc.publishedDate || doc.pubDate || doc.date || doc.createdAt || doc.updatedAt;
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function extractCategories(doc) {
  const raw = doc.categories || doc.category || doc.tags || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      return item.title || item.name || item.value || item.slug || '';
    })
    .filter(Boolean);
}

function payloadBaseUrl() {
  return (process.env.PAYLOAD_URL || process.env.PUBLIC_PAYLOAD_URL || DEFAULT_PAYLOAD_URL).replace(/\/+$/, '');
}

function authHeaderSets(apiKey) {
  const accept = { Accept: 'application/json' };
  if (!apiKey) return [accept];
  return [
    { ...accept, Authorization: `users API-Key ${apiKey}`, 'X-API-Key': apiKey },
    { ...accept, Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey },
  ];
}

function collectionPageUrl(base, collection, page, tenantSlug) {
  const url = new URL(`${base}/api/${collection}`);
  url.searchParams.set('depth', '2');
  url.searchParams.set('limit', '100');
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', '-pubDate');
  url.searchParams.set('where[publishStatus][equals]', 'published');
  url.searchParams.set('where[pubDate][less_than_equal]', new Date().toISOString());
  url.searchParams.set('where[tenant.slug][equals]', tenantSlug);
  return url;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

async function fetchCollection(collection) {
  const base = payloadBaseUrl();
  const apiKey = process.env.PAYLOAD_API_KEY || process.env.PAYLOAD_TOKEN || '';
  const headerSets = authHeaderSets(apiKey);

  for (const candidateHeaders of headerSets) {
    const { res, data } = await fetchJson(collectionPageUrl(base, collection, 1, TENANT), candidateHeaders);
    if (!res.ok || !(data?.docs?.length)) continue;

    const docs = [...(data.docs || [])];
    let page = 2;
    const totalPages = Math.min(data.totalPages || 1, 50);
    while (page <= totalPages) {
      const next = await fetchJson(collectionPageUrl(base, collection, page, TENANT), candidateHeaders);
      if (!next.res.ok) break;
      docs.push(...(next.data?.docs || []));
      page += 1;
    }

    console.log(`[sync:blog] Using "${collection}" (${docs.length} published docs for ${TENANT}).`);
    return docs;
  }

  return [];
}

function buildMarkdown(post) {
  const heroImage = resolveBlogHeroImage({
    heroImage: post.heroImage,
    featuredImage: post.featuredImage,
  });
  const categories = post.categories?.length ? post.categories : ['Uncategorised'];
  const data = {
    title: post.title,
    description: post.description,
    pubDate: post.date,
    slug: post.slug,
    author: post.author,
    categories,
    draft: false,
    ...payloadFrontmatterFields(),
  };
  if (heroImage) {
    data.heroImage = heroImage;
    data.featuredImage = post.featuredImage || heroImage;
    data.image = post.featuredImage || heroImage;
  }
  return rebuildMarkdown(data, post.html || `<p>${escapeHtml(post.description)}</p>\n`);
}

function mapDoc(doc) {
  const slug = slugify(doc.slug || doc.path || doc.id || extractTitle(doc));
  if (!slug) return null;
  const title = extractTitle(doc) || slug;
  const heroImage = resolveDocImage(doc, ['heroImage', 'hero_image', 'hero']);
  const featuredImage = resolveDocImage(doc, [
    'featuredImage',
    'featured_image',
    'meta.image',
    'heroImage',
  ]);
  const categories = extractCategories(doc);
  return {
    slug,
    title,
    description: extractDescription(doc) || title,
    author: extractAuthor(doc),
    date: isoDate(extractDate(doc)),
    categories: categories.length ? categories : ['Uncategorised'],
    heroImage: heroImage || featuredImage,
    featuredImage: featuredImage || heroImage,
    html: extractBodyHtml(doc),
  };
}

async function readExistingSlugs() {
  try {
    const files = await fs.readdir(BLOG_DIR);
    return files.filter((f) => f.endsWith('.md') || f.endsWith('.mdx')).length;
  } catch {
    return 0;
  }
}

async function updateExistingFrontmatter(filePath, post) {
  const raw = await fs.readFile(filePath, 'utf8');
  const { body, data } = splitFrontmatter(raw);
  const heroImage = resolveBlogHeroImage({
    heroImage: post.heroImage,
    featuredImage: post.featuredImage,
  });

  const nextData = {
    ...data,
    title: post.title,
    description: post.description,
    pubDate: post.date,
    slug: post.slug,
    author: post.author,
    categories: post.categories,
    draft: false,
    ...payloadFrontmatterFields(),
  };
  delete nextData._status;
  delete nextData.publishStatus;

  if (heroImage) {
    nextData.heroImage = heroImage;
    nextData.featuredImage = post.featuredImage || heroImage;
    nextData.image = post.featuredImage || heroImage;
  } else {
    delete nextData.heroImage;
    delete nextData.featuredImage;
    delete nextData.image;
  }

  if (post.html && post.html.replace(/<[^>]+>/g, '').trim().length > 40) {
    const next = rebuildMarkdown(nextData, post.html);
    if (next !== raw.replace(/\r\n/g, '\n')) {
      await fs.writeFile(filePath, next, 'utf8');
      return true;
    }
    return false;
  }

  const next = rebuildMarkdown(nextData, body);
  if (next === raw.replace(/\r\n/g, '\n')) return false;
  await fs.writeFile(filePath, next, 'utf8');
  return true;
}

export async function syncBlogFromPayload() {
  await loadDotEnv();

  if (process.env.PAYLOAD_SYNC_SKIP === '1' || process.env.PAYLOAD_SYNC_SKIP === 'true') {
    console.log('[sync:blog] Skipped (PAYLOAD_SYNC_SKIP).');
    return;
  }

  const apiKey = process.env.PAYLOAD_API_KEY || process.env.PAYLOAD_TOKEN || '';
  if (!apiKey) {
    console.log('[sync:blog] No PAYLOAD_API_KEY — tenant-cli + mark/prune handle CI publish sync.');
    return;
  }

  console.log(`[sync:blog] Payload sync for ${TENANT} from ${payloadBaseUrl()} …`);

  let docs = [];
  for (const name of [
    process.env.PAYLOAD_BLOG_COLLECTION || 'blog-posts',
    'blog-posts',
    'posts',
    'articles',
  ]) {
    docs = await fetchCollection(name);
    if (docs.length) break;
  }

  const mapped = docs.map(mapDoc).filter(Boolean);
  const syncedSlugs = new Set(mapped.map((post) => post.slug));
  const existingCount = await readExistingSlugs();

  if (!mapped.length && existingCount === 0) {
    console.warn('[sync:blog] No published Payload posts found.');
    return;
  }

  await fs.mkdir(BLOG_DIR, { recursive: true });

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const post of mapped) {
    const filePath = path.join(BLOG_DIR, `${post.slug}.md`);
    try {
      await fs.access(filePath);
      if (await updateExistingFrontmatter(filePath, post)) {
        updated += 1;
        console.log(`[sync:blog] updated ${post.slug}`);
      }
    } catch {
      await fs.writeFile(filePath, buildMarkdown(post), 'utf8');
      created += 1;
      console.log(`[sync:blog] created ${post.slug}`);
    }
  }

  for (const file of await fs.readdir(BLOG_DIR)) {
    if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
    const slug = file.replace(/\.(md|mdx)$/, '');
    if (syncedSlugs.has(slug)) continue;

    const filePath = path.join(BLOG_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = splitFrontmatter(raw);
    if (isLegacyFrontmatter(data)) continue;
    if (data.source !== 'payload' && data.source !== PAYLOAD_SOURCE) continue;

    await fs.unlink(filePath);
    removed += 1;
    console.log(`[sync:blog] removed unpublished ${slug}`);
  }

  // Update snapshot after API sync (local dev / when API key is available).
  const snapshotPath = path.join(ROOT, '.cache/payload-published-slugs.json');
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(
    snapshotPath,
    JSON.stringify({ slugs: [...syncedSlugs], at: new Date().toISOString() }, null, 2),
    'utf8',
  );

  console.log(
    `[sync:blog] Done. ${mapped.length} published; created ${created}, updated ${updated}, removed ${removed}.`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncBlogFromPayload().catch((err) => {
    console.error('[sync:blog] Fatal:', err.message || err);
    process.exit(1);
  });
}
