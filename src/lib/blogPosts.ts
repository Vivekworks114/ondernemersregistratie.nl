import type { CollectionEntry } from 'astro:content';
import { isSpamBlogEntry } from './spamBlogFilter';

export type BlogEntry = CollectionEntry<'blog'>;

/** Static routes that must not be generated as root `/:slug` blog pages. */
export const RESERVED_ROOT_SLUGS = new Set([
  'blog',
  'updates',
  'contact',
  'over-ons',
  'sitemap',
  'category',
  'telefoonnummers',
  'zb_mp_nummer',
  '404',
  'index',
]);

export function isLiveBlogPost(post: BlogEntry): boolean {
  if (post.data.draft) return false;
  if (isSpamBlogEntry(post)) return false;
  return true;
}

export function sortBlogPosts(posts: BlogEntry[]): BlogEntry[] {
  return [...posts]
    .filter(isLiveBlogPost)
    .sort((a, b) => {
      const da = a.data.pubDate instanceof Date ? a.data.pubDate : new Date(String(a.data.pubDate ?? 0));
      const db = b.data.pubDate instanceof Date ? b.data.pubDate : new Date(String(b.data.pubDate ?? 0));
      return db.valueOf() - da.valueOf();
    });
}

function filenameSlug(post: BlogEntry): string {
  return post.id.replace(/\.(mdx?)$/i, '');
}

export function postSlug(post: BlogEntry): string {
  const fromData = typeof post.data.slug === 'string' ? post.data.slug.trim() : '';
  if (fromData) return fromData.replace(/^\/+|\/+$/g, '').replace(/\.(mdx?)$/i, '');
  return filenameSlug(post);
}

/** Unique route keys: filename id + frontmatter slug (Payload may differ). */
export function postRouteSlugs(post: BlogEntry): string[] {
  return [...new Set([filenameSlug(post), postSlug(post)].filter(Boolean))];
}

/** Canonical public URL — WordPress-style root path on this site. */
export function postUrl(post: BlogEntry): string {
  return `/${postSlug(post)}/`;
}

export function formatBlogDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  if (Number.isNaN(d.valueOf())) return '';
  return d.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' });
}
