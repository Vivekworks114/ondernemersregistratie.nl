#!/usr/bin/env node
/**
 * After tenant-cli sync, tag every file in src/content/blog as Payload-managed.
 * Writes slug snapshot used to prune unpublished Payload posts later in the build.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebuildMarkdown, splitFrontmatter } from './lib/blog-frontmatter.mjs';
import { payloadFrontmatterFields } from './lib/blog-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const CACHE_DIR = path.join(ROOT, '.cache');
const SNAPSHOT = path.join(CACHE_DIR, 'payload-published-slugs.json');

let tagged = 0;
const slugs = [];

try {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  for (const file of files) {
    const filePath = path.join(BLOG_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const { body, data } = splitFrontmatter(raw);
    const slug = String(data.slug || file.replace(/\.(md|mdx)$/i, '')).trim();
    slugs.push(slug);

    const nextData = {
      ...data,
      ...payloadFrontmatterFields(),
    };
    delete nextData._status;
    delete nextData.publishStatus;

    const next = rebuildMarkdown(nextData, body);
    if (next !== raw.replace(/\r\n/g, '\n')) {
      await fs.writeFile(filePath, next, 'utf8');
      tagged += 1;
    }
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT, JSON.stringify({ slugs, at: new Date().toISOString() }, null, 2), 'utf8');
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(SNAPSHOT, JSON.stringify({ slugs: [], at: new Date().toISOString() }, null, 2), 'utf8');
    console.log('[mark:payload] No blog directory — empty Payload snapshot.');
    process.exit(0);
  }
  throw err;
}

console.log(`[mark:payload] Tagged ${tagged} file(s); ${slugs.length} Payload slug(s) in snapshot.`);
