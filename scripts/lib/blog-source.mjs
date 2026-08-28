/**
 * Frontmatter source markers — Payload vs legacy WordPress content.
 */
export const PAYLOAD_SOURCE = 'payload';
export const LEGACY_SOURCE = 'wordpress';

export function isLegacyFrontmatter(data) {
  if (data?.legacy === true || data?.legacy === 'true') return true;
  if (data?.source === LEGACY_SOURCE) return true;
  return false;
}

export function isPayloadFrontmatter(data) {
  return data?.source === PAYLOAD_SOURCE;
}

export function payloadFrontmatterFields() {
  return { source: PAYLOAD_SOURCE, legacy: false };
}

export function legacyFrontmatterFields() {
  return { source: LEGACY_SOURCE, legacy: true };
}
