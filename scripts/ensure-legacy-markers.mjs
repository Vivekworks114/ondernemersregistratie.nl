#!/usr/bin/env node
/**
 * One-time / maintenance: mark git-tracked WordPress imports as legacy content.
 * Payload-synced posts must never receive legacy:true (they use source:payload).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebuildMarkdown, splitFrontmatter } from './lib/blog-frontmatter.mjs';
import { isLegacyFrontmatter, legacyFrontmatterFields, PAYLOAD_SOURCE } from './lib/blog-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_REL = 'src/content/blog';
const BLOG_DIR = path.join(ROOT, BLOG_REL);

function listTrackedBlogFiles() {
  try {
    return execSync(`git ls-files ${BLOG_REL}`, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /\.(md|mdx)$/i.test(line));
  } catch {
    return [];
  }
}

let updated = 0;
let skipped = 0;

for (const rel of listTrackedBlogFiles()) {
  const filePath = path.join(ROOT, rel);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    continue;
  }

  const { body, data } = splitFrontmatter(raw);
  if (data.source === PAYLOAD_SOURCE) {
    skipped += 1;
    continue;
  }
  if (isLegacyFrontmatter(data)) {
    skipped += 1;
    continue;
  }

  const next = rebuildMarkdown({ ...data, ...legacyFrontmatterFields() }, body);
  if (next !== raw.replace(/\r\n/g, '\n')) {
    await fs.writeFile(filePath, next, 'utf8');
    updated += 1;
  }
}

console.log(`[ensure:legacy] Marked ${updated} article(s) as legacy; skipped ${skipped}.`);
