#!/usr/bin/env node
/**
 * Jenkins tenant-cli sync uses clean:true and deletes the entire blog folder,
 * leaving only Payload-published posts. Restore tracked legacy WordPress articles
 * from git so recent + historical content stays online (site-only fix).
 *
 * Skips when RESTORE_BLOG_SKIP=1 (local builds that should not touch git).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_REL = 'src/content/blog';

if (process.env.RESTORE_BLOG_SKIP === '1' || process.env.RESTORE_BLOG_SKIP === 'true') {
  console.log('[restore:blog] Skipped (RESTORE_BLOG_SKIP).');
  process.exit(0);
}

const blogDir = path.join(ROOT, BLOG_REL);
if (!fs.existsSync(path.join(ROOT, '.git'))) {
  console.log('[restore:blog] Not a git repo — skip restore.');
  process.exit(0);
}

try {
  execSync(`git checkout HEAD -- ${BLOG_REL}`, { cwd: ROOT, stdio: 'inherit' });
  const tracked = execSync(`git ls-files ${BLOG_REL}`, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((line) => /\.(md|mdx)$/i.test(line)).length;
  const onDisk = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx')).length
    : 0;
  console.log(`[restore:blog] Restored legacy blog markdown from git (${tracked} tracked, ${onDisk} on disk).`);
} catch (err) {
  console.warn('[restore:blog] git checkout failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
