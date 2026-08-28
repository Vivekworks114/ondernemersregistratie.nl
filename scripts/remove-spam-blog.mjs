#!/usr/bin/env node
/**
 * Remove WordPress SEO-spam / hacked blog markdown after git restore.
 * Keeps legitimate ondernemer articles; kills casino/gossip/injected posts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSpamBlogFile } from './lib/spam-blog-filter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');

let removed = 0;

try {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  for (const file of files) {
    const slug = file.replace(/\.(md|mdx)$/i, '');
    const filePath = path.join(BLOG_DIR, file);
    const body = await fs.readFile(filePath, 'utf8');
    if (!isSpamBlogFile(slug, body)) continue;
    await fs.unlink(filePath);
    removed += 1;
    console.log(`[remove:spam] removed ${slug}`);
  }
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.log('[remove:spam] No blog directory — skip.');
    process.exit(0);
  }
  throw err;
}

console.log(`[remove:spam] Done. Removed ${removed} spam article(s).`);
