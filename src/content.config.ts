import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const payloadString = (fallback = '') =>
  z.preprocess((val) => (val == null ? fallback : String(val)), z.string());

const payloadOptionalString = () =>
  z.preprocess(
    (val) => (val == null || val === '' ? undefined : String(val)),
    z.string().optional(),
  );

function coerceImageValue(val: unknown): string | undefined {
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

const payloadImage = () => z.preprocess((val) => coerceImageValue(val), z.string().optional());

const payloadTerms = () =>
  z.preprocess((val) => {
    if (Array.isArray(val)) {
      return val
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            return String(obj.name ?? obj.value ?? obj.slug ?? '').trim();
          }
          return '';
        })
        .filter(Boolean);
    }
    if (typeof val === 'string' && val.trim()) return [val.trim()];
    return [];
  }, z.array(z.string()).optional());

const payloadDraft = () =>
  z.preprocess((val) => {
    if (val === true || val === 'true' || val === 'draft' || val === 'unpublished') return true;
    return false;
  }, z.boolean().optional());

const payloadDate = () =>
  z.preprocess((val) => {
    if (val == null || val === '') return new Date();
    return val;
  }, z.coerce.date());

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z
    .object({
      title: payloadString(),
      description: payloadOptionalString(),
      pubDate: payloadDate(),
      updatedDate: z.coerce.date().optional(),
      author: payloadOptionalString(),
      categories: payloadTerms(),
      tags: payloadTerms(),
      featuredImage: payloadImage(),
      heroImage: payloadImage(),
      image: payloadImage(),
      slug: payloadOptionalString(),
      draft: payloadDraft(),
      _status: payloadOptionalString(),
      publishStatus: payloadOptionalString(),
    })
    .passthrough()
    .transform((data) => {
      const featuredImage =
        coerceImageValue(data.featuredImage) ??
        coerceImageValue(data.heroImage) ??
        coerceImageValue(data.image);
      const status = String(data._status ?? data.publishStatus ?? '').toLowerCase();
      const draft =
        Boolean(data.draft) ||
        status === 'draft' ||
        status === 'unpublished' ||
        status === 'scheduled';

      return {
        title: data.title,
        description: data.description ?? '',
        pubDate: data.pubDate,
        updatedDate: data.updatedDate,
        author: data.author,
        categories: data.categories ?? [],
        tags: data.tags ?? [],
        featuredImage,
        heroImage: coerceImageValue(data.heroImage),
        image: coerceImageValue(data.image),
        slug: data.slug,
        draft,
      };
    }),
});

export const collections = { blog };
