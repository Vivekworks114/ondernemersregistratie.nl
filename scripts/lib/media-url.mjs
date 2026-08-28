/**
 * Resolve Payload / R2 media paths to absolute URLs for blog frontmatter.
 * Tenant media lives at:
 *   https://pub-….r2.dev/tenants/ondernemersregistratie/<filename>.jpg
 */

export const R2_HOST = 'https://pub-d4024ad3e57841448e0ee58a19abe46b.r2.dev';
export const R2_TENANT_MEDIA_BASE = `${R2_HOST}/tenants/ondernemersregistratie`;

export function extractMediaPath(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (typeof value.url === 'string' && value.url.trim()) return value.url.trim();
    if (typeof value.filename === 'string' && value.filename.trim()) return value.filename.trim();
    if (typeof value.src === 'string' && value.src.trim()) return value.src.trim();
  }
  return '';
}

export function rewriteTenantR2Url(url) {
  let out = String(url ?? '').trim();
  if (!out) return out;

  out = out
    .replace(`${R2_HOST}/tenants/ondernemersregistratie.nl/`, `${R2_TENANT_MEDIA_BASE}/`)
    .replace(`${R2_HOST}/tenants/ondernemers-registratie/`, `${R2_TENANT_MEDIA_BASE}/`);

  if (!out.startsWith(R2_HOST)) return out;
  if (out.includes('/tenants/ondernemersregistratie/')) return out;

  const rest = out.slice(R2_HOST.length).replace(/^\//, '');
  if (!rest || rest.startsWith('tenants/')) return out;
  return `${R2_TENANT_MEDIA_BASE}/${rest}`;
}

export function resolveMediaUrl(pathOrUrl, options = {}) {
  const raw = String(pathOrUrl ?? '').trim();
  if (!raw) return options.fallback ?? '';

  if (/^https?:\/\//i.test(raw)) return rewriteTenantR2Url(raw);

  // Keep local public assets as site-relative paths.
  if (raw.startsWith('/images/') || raw.startsWith('/uploads/')) {
    return raw;
  }

  const env = options.env ?? {};
  const base =
    env.R2_PUBLIC_URL ||
    env.PUBLIC_R2_URL ||
    env.PUBLIC_PAYLOAD_MEDIA_URL ||
    env.PUBLIC_MEDIA_URL ||
    R2_TENANT_MEDIA_BASE;

  const normalizedBase = base.replace(/\/+$/, '');
  const path = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;

  if (path.startsWith('/tenants/')) {
    return rewriteTenantR2Url(`${R2_HOST}${path}`);
  }

  if (normalizedBase.includes('/tenants/ondernemersregistratie')) {
    const filename = path.replace(/^\/+/, '');
    return rewriteTenantR2Url(`${normalizedBase}/${filename}`);
  }

  return rewriteTenantR2Url(`${normalizedBase}${path}`);
}

/** Normalize any image frontmatter value to a usable absolute or site-relative URL. */
export function absolutizeTenantMediaUrl(value, env = process.env) {
  const pathOrUrl = extractMediaPath(value);
  if (!pathOrUrl) return undefined;
  const resolved = resolveMediaUrl(pathOrUrl, { env, fallback: pathOrUrl });
  return resolved || undefined;
}
