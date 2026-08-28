/**
 * Shared blog frontmatter helpers for Astro schema and build scripts.
 */

import { absolutizeTenantMediaUrl } from './media-url.mjs';

export function resolveBlogHeroImage(data, env = process.env) {
  for (const key of ['heroImage', 'featuredImage', 'image']) {
    const url = absolutizeTenantMediaUrl(data[key], env);
    if (url) return url;
  }
  return undefined;
}

export function resolveBlogCategories(data) {
  if (Array.isArray(data.categories) && data.categories.length) {
    return data.categories.map((c) => String(c).trim()).filter(Boolean);
  }
  const single = data.category?.trim();
  if (single) return [single];
  return ['Uncategorised'];
}

export function splitFrontmatter(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: normalized, data: {} };
  const data = parseSimpleYaml(match[1]);
  return { frontmatter: match[1], body: match[2], data };
}

export function parseSimpleYaml(yaml) {
  const data = {};
  let currentListKey = null;

  for (const line of yaml.split('\n')) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentListKey) {
      data[currentListKey].push(stripYamlScalar(listMatch[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;

    const key = kv[1];
    const value = kv[2].trim();
    currentListKey = null;

    if (value === '') {
      data[key] = [];
      currentListKey = key;
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => stripYamlScalar(part.trim()))
        .filter(Boolean);
      continue;
    }

    data[key] = coerceYamlScalar(stripYamlScalar(value));
  }

  return data;
}

function stripYamlScalar(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function coerceYamlScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function upsertFrontmatterField(yaml, key, value) {
  const line = `${key}: ${yamlEscape(value)}`;
  const re = new RegExp(`^${key}:\\s*.*$`, 'm');
  if (re.test(yaml)) return yaml.replace(re, line);
  return `${yaml.trimEnd()}\n${line}`;
}

export function removeFrontmatterField(yaml, key) {
  return yaml
    .replace(new RegExp(`^${key}:\\s*.*\\r?\\n?`, 'm'), '')
    .replace(new RegExp(`^${key}:\\s*\\n(?:\\s+- .+\\n)*`, 'm'), '');
}

export function yamlEscape(value) {
  return JSON.stringify(String(value ?? ''));
}

export function rebuildMarkdown(data, body) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlEscape(item)}`);
      continue;
    }
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${yamlEscape(String(value))}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}${body.replace(/^\n+/, '')}`;
}

/** Payload sync sometimes writes draft flags; published posts must stay live on this site. */
export function isPublishedFrontmatter(data) {
  const status = String(data._status ?? data.publishStatus ?? '').toLowerCase();
  if (status === 'draft' || status === 'unpublished' || status === 'scheduled') return false;
  if (data.draft === true || data.draft === 'true') return false;
  return true;
}
