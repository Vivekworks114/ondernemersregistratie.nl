#!/usr/bin/env node
/**
 * Normalize Payload-synced blog markdown before Astro build.
 * Only rewrites files that need R2 URL fixes or draft-flag cleanup.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPublishedFrontmatter,
  rebuildMarkdown,
  resolveBlogHeroImage,
  splitFrontmatter,
} from './lib/blog-frontmatter.mjs';
import { rewriteTenantR2Url } from './lib/media-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');

function needsImageFix(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  if (!/^https?:\/\//i.test(raw)) return false;
  const fixed = rewriteTenantR2Url(raw);
  return fixed !== raw;
}

function pickImageFields(data, heroImage) {
  const out = {};
  if (!heroImage) return out;
  out.heroImage = heroImage;
  out.featuredImage = heroImage;
  out.image = heroImage;
  return out;
}

let updated = 0;
let skipped = 0;

try {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  for (const file of files) {
    const filePath = path.join(BLOG_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const { body, data } = splitFrontmatter(raw);

    const heroImage = resolveBlogHeroImage(data);
    const published = isPublishedFrontmatter(data);
    const imageNeedsFix =
      needsImageFix(data.heroImage) ||
      needsImageFix(data.featuredImage) ||
      needsImageFix(data.image);
    const draftNeedsFix =
      published &&
      (data.draft === true ||
        data.draft === 'true' ||
        data._status ||
        data.publishStatus);

    if (!imageNeedsFix && !draftNeedsFix) {
      skipped += 1;
      continue;
    }

    const nextData = { ...data, ...pickImageFields(data, heroImage) };
    if (published) {
      nextData.draft = false;
      delete nextData._status;
      delete nextData.publishStatus;
    }

    const next = rebuildMarkdown(nextData, body);
    if (next !== raw.replace(/\r\n/g, '\n')) {
      await fs.writeFile(filePath, next, 'utf8');
      updated += 1;
    } else {
      skipped += 1;
    }
  }
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.log('[normalize:blog] No blog directory — skip.');
    process.exit(0);
  }
  throw err;
}

console.log(`[normalize:blog] updated ${updated}, skipped ${skipped}`);
