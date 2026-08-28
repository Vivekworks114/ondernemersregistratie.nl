#!/usr/bin/env node
/**
 * Restore legacy WordPress articles from git without undoing Payload CMS lifecycle.
 * Only files marked legacy:true (or source:wordpress) in git HEAD are restored.
 * Published Payload posts from tenant-cli always win on slug conflicts.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLegacyFrontmatter, isPayloadFrontmatter } from './lib/blog-source.mjs';
import { splitFrontmatter } from './lib/blog-frontmatter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_REL = 'src/content/blog';
const BLOG_DIR = path.join(ROOT, BLOG_REL);

if (process.env.RESTORE_BLOG_SKIP === '1' || process.env.RESTORE_BLOG_SKIP === 'true') {
  console.log('[restore:legacy] Skipped (RESTORE_BLOG_SKIP).');
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  console.log('[restore:legacy] Not a git repo — skip.');
  process.exit(0);
}

function gitShow(relPath) {
  try {
    return execSync(`git show HEAD:${relPath.replace(/\\/g, '/')}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

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

let restored = 0;
let skippedPayload = 0;
let skippedNotLegacy = 0;

for (const rel of listTrackedBlogFiles()) {
  const headRaw = gitShow(rel);
  if (!headRaw) continue;

  const { data: headData } = splitFrontmatter(headRaw);
  if (!isLegacyFrontmatter(headData)) {
    skippedNotLegacy += 1;
    continue;
  }

  const fileName = path.basename(rel);
  const dest = path.join(BLOG_DIR, fileName);

  if (fs.existsSync(dest)) {
    try {
      const currentRaw = fs.readFileSync(dest, 'utf8');
      const { data: currentData } = splitFrontmatter(currentRaw);
      if (isPayloadFrontmatter(currentData) || currentData.source === 'payload') {
        skippedPayload += 1;
        continue;
      }
    } catch {
      /* fall through to restore */
    }
  }

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(dest, headRaw.replace(/\r\n/g, '\n'), 'utf8');
  restored += 1;
}

console.log(
  `[restore:legacy] Restored ${restored} legacy article(s); skipped ${skippedPayload} Payload conflict(s), ${skippedNotLegacy} non-legacy in git.`,
);
