/**
 * Resolve card/hero images for Payload sync + markdown posts.
 * Prefer verified /images/… paths (blog-image-map.json), then frontmatter,
 * then body image, then unique stock covers.
 * Payload R2 https URLs are kept; broken local paths are skipped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)(\?|#|$)/i;

export const R2_HOST = 'https://pub-d4024ad3e57841448e0ee58a19abe46b.r2.dev';
export const R2_TENANT_MEDIA_BASE = `${R2_HOST}/tenants/ondernemersregistratie`;
export const BLOG_IMAGE_PLACEHOLDER = '/images/blog/featured-1.png';
export const SITE_ORIGIN = 'https://ondernemersregistratie.nl';

const STOCK_COVERS = [
  '/images/covers/01.svg',
  '/images/covers/02.svg',
  '/images/covers/03.svg',
  '/images/covers/04.svg',
  '/images/covers/05.svg',
  '/images/covers/06.svg',
];

function loadBlogImageMap(): Record<string, string> {
  try {
    const mapPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../data/blog-image-map.json',
    );
    return JSON.parse(fs.readFileSync(mapPath, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

const KNOWN_UPLOAD_BY_SLUG = loadBlogImageMap();

type ImageFields = {
  featuredImage?: unknown;
  heroImage?: unknown;
  image?: unknown;
  ogImage?: unknown;
};

export function coerceImageValue(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number') return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '[object Object]' || /^\d+$/.test(trimmed)) return undefined;
    return trimmed;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return coerceImageValue(obj.url ?? obj.src ?? obj.filename);
  }
  return undefined;
}

function rewriteTenantR2Url(url: string): string {
  let out = url
    .replace(`${R2_HOST}/tenants/ondernemersregistratie.nl/`, `${R2_TENANT_MEDIA_BASE}/`)
    .replace(`${R2_HOST}/tenants/ondernemers-registratie/`, `${R2_TENANT_MEDIA_BASE}/`);
  if (!out.startsWith(R2_HOST)) return out;
  if (out.includes('/tenants/ondernemersregistratie/')) return out;
  const rest = out.slice(R2_HOST.length).replace(/^\//, '');
  if (!rest || rest.startsWith('tenants/')) return out;
  return `${R2_TENANT_MEDIA_BASE}/${rest}`;
}

function toSiteRelative(url: string): string {
  let out = url.trim();
  out = out.replace(/^https?:\/\/(www\.)?ondernemersregistratie\.nl/i, '');
  out = out.replace(/\/wp-content\/uploads\//i, '/images/content/');
  if (out.startsWith('uploads/')) out = `/${out}`;
  if (out.startsWith('images/')) out = `/${out}`;
  return out;
}

/** Prefer full-size sibling when `-scaled` / `-NxN` exists alongside the original. */
function preferFullSizeLocal(url: string): string {
  if (!url.startsWith('/')) return url;
  const match = url.match(/^(.*?)-(?:scaled|\d+x\d+)(\.[A-Za-z0-9]+)(\?.*)?$/i);
  if (!match) return url;
  const full = `${match[1]}${match[2]}`;
  if (localPublicExists(full)) return `${full}${match[3] ?? ''}`;
  return url;
}

export function localPublicExists(url: string): boolean {
  if (!url.startsWith('/')) return true;
  try {
    const file = path.join(process.cwd(), 'public', url.replace(/^\//, '').split('?')[0] || '');
    return fs.existsSync(file);
  } catch {
    return true;
  }
}

export function normalizeImageUrl(value: unknown): string | undefined {
  const coerced = coerceImageValue(value);
  if (!coerced) return undefined;
  let trimmed = toSiteRelative(rewriteTenantR2Url(coerced));

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.endsWith('/') && !IMAGE_EXT.test(parsed.pathname)) return undefined;
      if (/ondernemersregistratie\.nl$/i.test(parsed.hostname)) {
        trimmed = `${parsed.pathname}${parsed.search}`;
      } else {
        return `${parsed.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith('/')) return preferFullSizeLocal(trimmed);
  if (IMAGE_EXT.test(trimmed) || trimmed.includes('/')) {
    return preferFullSizeLocal(`/${trimmed.replace(/^\/+/, '')}`);
  }
  return undefined;
}

function isUnusableImage(src: string): boolean {
  return /wp-smiley|emoji|data:image|logo\.svg$|undefined-\d+/i.test(src);
}

function isUsableResolvedUrl(url: string): boolean {
  if (isUnusableImage(url)) return false;
  if (/^https?:\/\//i.test(url)) return true;
  return localPublicExists(url);
}

export function uniqueStockCover(slug?: string): string {
  if (!slug) return BLOG_IMAGE_PLACEHOLDER;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return STOCK_COVERS[hash % STOCK_COVERS.length] ?? BLOG_IMAGE_PLACEHOLDER;
}

export function knownUploadForSlug(slug?: string): string | undefined {
  const key = String(slug ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .pop();
  if (!key) return undefined;
  const mapped = KNOWN_UPLOAD_BY_SLUG[key];
  if (!mapped) return undefined;
  const url = normalizeImageUrl(mapped);
  return url && isUsableResolvedUrl(url) ? url : undefined;
}

export function firstImageFromHtml(html: string): string | undefined {
  if (!html) return undefined;
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const url = normalizeImageUrl(match[1]);
    if (url && isUsableResolvedUrl(url)) return url;
  }
  return undefined;
}

/** Hero: frontmatter → known map → body → unique stock cover. */
export function resolveHeroImageOrStock(
  data: ImageFields = {},
  bodyHtml?: string,
  slug?: string,
  title?: string,
): string {
  for (const candidate of [data.heroImage, data.featuredImage, data.image, data.ogImage]) {
    const url = normalizeImageUrl(candidate);
    if (url && isUsableResolvedUrl(url)) return url;
  }

  const fromMap = knownUploadForSlug(slug);
  if (fromMap) return fromMap;

  if (bodyHtml) {
    const fromBody = firstImageFromHtml(bodyHtml);
    if (fromBody) return fromBody;
  }
  return uniqueStockCover(slug || title);
}

/** Card/listing image — same priority as hero. */
export function resolveCardImageOrPlaceholder(
  data: ImageFields = {},
  bodyHtml?: string,
  slug?: string,
  title?: string,
): string {
  return resolveHeroImageOrStock(data, bodyHtml, slug, title);
}

/** @deprecated use resolveHeroImageOrStock */
export function resolveFeaturedImage(data: ImageFields = {}, slug?: string): string {
  return resolveHeroImageOrStock(data, undefined, slug);
}
