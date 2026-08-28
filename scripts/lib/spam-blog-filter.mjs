/**
 * Shared spam blog detection for build scripts (mirrors src/lib/spamBlogFilter.ts).
 */

export const BLOCKED_BLOG_SLUGS = new Set([
  'anna-nooshin-vriend-thijs-boermans',
  'shirley-ex-on-the-beach-leeftijd',
  'max-terpstra-vriendin',
  'oos-kesbeke-vriendin-leeftijd',
  'vriendin-bouke-scholten',
  'reclamecampagnes-van-online-casinos-die-wereldwijd-indruk-maakten',
  'de-meest-verdienende-pokerspelers-van-2025-wie-domineerde-het-live-circuit',
  'casino-night-thuis-van-smokey-eye-tot-online-spelen',
  'waarom-casinos-in-nederland-niet-meer-overal-zijn-maar-ook-niet-verdwenen-zijn',
  'de-opkomst-van-thuisgebaseerde-ondernemingen-in-de-entertainmentsector',
  'klantentertainment-ideeen-voor-kleine-bedrijven',
  'hoe-zzpers-15-minuten-pure-adrenaline-gebruiken',
  'so-optimieren-wuppertaler-betriebe-laufwege-sitzplatze-und-schattenzonen',
  'waarom-een-sterke-online-aanwezigheid-essentieel-is-voor-moderne-nederlandse-ondernemers',
]);

export const SPAM_LINK_PATTERNS = [
  /casinos\.apparata\.net/i,
  /gameshub\.com\/nl\/online-casino/i,
  /getlucky\.nl/i,
  /playsense\.nl\/online-casino/i,
  /pintravel\.pl/i,
  /ospkurow\.com\.pl/i,
  /motormuseumhagestein\.nl/i,
  /\/online-casino\//i,
  /casino zonder iDIN/i,
  /casino spelen met crypto/i,
  /kasyno online holandia/i,
];

export const SPAM_SLUG_PATTERNS = [
  /vriendin/i,
  /vriend-thijs/i,
  /ex-on-the-beach/i,
  /-leeftijd$/i,
  /casino/i,
  /poker/i,
  /^so-optimieren-wuppertaler/i,
];

export function filenameToSlug(id) {
  return id.replace(/\.(mdx?)$/i, '');
}

export function isBlockedBlogSlug(slug) {
  const normalized = slug.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return false;
  if (BLOCKED_BLOG_SLUGS.has(normalized)) return true;
  return SPAM_SLUG_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function bodyContainsSpamLinks(body) {
  if (!body) return false;
  return SPAM_LINK_PATTERNS.some((pattern) => pattern.test(body));
}

export function isSpamBlogFile(slug, body) {
  if (isBlockedBlogSlug(slug)) return true;
  if (bodyContainsSpamLinks(body)) return true;
  return false;
}
