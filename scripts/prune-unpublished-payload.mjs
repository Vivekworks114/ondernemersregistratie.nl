#!/usr/bin/env node
/**
 * Remove Payload-managed blog files that are no longer published (unpublish/delete in CMS).
 * Uses the slug snapshot from mark-payload-synced.mjs (tenant-cli output in CI).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from './lib/blog-frontmatter.mjs';
import { isLegacyFrontmatter } from './lib/blog-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const SNAPSHOT = path.join(ROOT, '.cache/payload-published-slugs.json');

async function loadPublishedSlugs() {
  try {
    const raw = await fs.readFile(SNAPSHOT, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.slugs) ? parsed.slugs : []);
  } catch {
    return new Set();
  }
}

const publishedSlugs = await loadPublishedSlugs();
let removed = 0;

try {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  for (const file of files) {
    const slug = file.replace(/\.(md|mdx)$/i, '');
    const filePath = path.join(BLOG_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = splitFrontmatter(raw);

    if (isLegacyFrontmatter(data)) continue;
    if (data.source !== 'payload' && publishedSlugs.size > 0) {
      // Untagged file while snapshot exists — treat as Payload output from tenant-cli.
      if (!publishedSlugs.has(slug) && !publishedSlugs.has(String(data.slug || ''))) {
        await fs.unlink(filePath);
        removed += 1;
        console.log(`[prune:payload] removed unpublished ${slug}`);
      }
      continue;
    }

    if (data.source === 'payload' && !publishedSlugs.has(slug) && !publishedSlugs.has(String(data.slug || ''))) {
      await fs.unlink(filePath);
      removed += 1;
      console.log(`[prune:payload] removed unpublished ${slug}`);
    }
  }
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.log('[prune:payload] No blog directory — skip.');
    process.exit(0);
  }
  throw err;
}

console.log(`[prune:payload] Done. Removed ${removed} unpublished Payload article(s).`);
