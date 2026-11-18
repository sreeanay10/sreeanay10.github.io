import type { AccountMeta, MetaMap } from './types';
import { normalizeUsername, usernameFromHref } from './username';
import { normalizeCountry } from './geo';

/**
 * Metadata providers supply follower counts / verification status from a legitimate,
 * permitted source. FOLLOWLY never scrapes Instagram and never invents values: a
 * provider either returns a confirmed value or leaves the field undefined.
 *
 * Built-in providers:
 *   • manual — the user's own confirmations in the Needs Review queue
 *   • file   — a CSV/JSON metadata file the user imports (e.g. exported from a tool
 *              they are authorised to use, such as the Instagram Graph API)
 *
 * To add a new source later (for example an authorised Graph API "business discovery"
 * lookup), implement MetadataProvider and register it in `providers`.
 */
export interface MetadataProvider {
  id: string;
  name: string;
  description: string;
  lookup(usernames: string[]): Promise<MetaMap>;
}

export const providers: MetadataProvider[] = [];

export function registerProvider(p: MetadataProvider) {
  if (!providers.some((x) => x.id === p.id)) providers.push(p);
}

/** Merge incoming metadata, letting newer, more specific values win without erasing known fields. */
export function mergeMeta(base: MetaMap, incoming: MetaMap): MetaMap {
  const out: MetaMap = { ...base };
  for (const [u, m] of Object.entries(incoming)) {
    const prev = out[u];
    const next: AccountMeta = { ...(prev ?? {}), source: m.source, updatedAt: m.updatedAt };
    if (m.followerCount !== undefined) next.followerCount = m.followerCount;
    if (m.verified !== undefined) next.verified = m.verified;
    if (m.displayName !== undefined) next.displayName = m.displayName;
    if (m.confirmedRegular !== undefined) next.confirmedRegular = m.confirmedRegular;
    if (m.confirmedOverThreshold !== undefined) next.confirmedOverThreshold = m.confirmedOverThreshold;
    if (m.country !== undefined) next.country = m.country;
    out[u] = next;
  }
  return out;
}

/* ───────────────────────────── file import ───────────────────────────── */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseCount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase().replace(/,/g, '');
  if (!s) return undefined;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  return Math.round(n);
}

function parseBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'verified'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'not verified', 'unverified'].includes(s)) return false;
  return undefined;
}

const HEADER_ALIASES: Record<string, string[]> = {
  username: ['username', 'user', 'handle', 'account', 'profile', 'profile_url', 'url'],
  followers: ['followers', 'follower_count', 'followers_count', 'followercount', 'follower count'],
  verified: ['verified', 'is_verified', 'isverified', 'verification'],
  displayName: ['display_name', 'name', 'full_name', 'displayname', 'display name', 'full name'],
  country: ['country', 'country_code', 'countrycode', 'country code', 'country_name', 'nation', 'location'],
};

/** Country-level only: “Paris, France” keeps “France” and discards the city. */
function parseCountry(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  return normalizeCountry(v) ?? normalizeCountry(v.split(',').pop() ?? '');
}

export interface ImportResult {
  meta: MetaMap;
  imported: number;
  skipped: number;
  countries: number;
  unrecognizedCountries: number;
}

/**
 * Import metadata from a CSV (header row required) or JSON array.
 * Columns: username + any of followers, verified, display_name, country.
 * Country values are ignored when geographic analytics are turned off.
 */
export function importMetadataFile(text: string, fileName: string, opts: { includeCountry?: boolean } = {}): ImportResult {
  const includeCountry = opts.includeCountry ?? true;
  const now = Date.now();
  const source = `file:${fileName}`;
  const meta: MetaMap = {};
  let skipped = 0, countriesFound = 0, unrecognized = 0;

  const add = (rawUser: unknown, followers: unknown, verified: unknown, name: unknown, country: unknown) => {
    const u = normalizeUsername(rawUser) ?? usernameFromHref(rawUser);
    if (!u) { skipped++; return; }
    const m: AccountMeta = { source, updatedAt: now };
    const c = parseCount(followers);
    const v = parseBool(verified);
    if (c !== undefined) m.followerCount = c;
    if (v !== undefined) m.verified = v;
    if (typeof name === 'string' && name.trim()) m.displayName = name.trim();
    if (includeCountry && typeof country === 'string' && country.trim()) {
      const code = parseCountry(country);
      if (code) { m.country = code; countriesFound++; } else unrecognized++;
    }
    if (m.followerCount === undefined && m.verified === undefined && !m.displayName && !m.country) { skipped++; return; }
    meta[u] = m;
  };

  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(text)) {
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error(`${fileName} isn't valid JSON.`); }
    const arr = Array.isArray(data) ? data : Array.isArray((data as { accounts?: unknown[] })?.accounts) ? (data as { accounts: unknown[] }).accounts : null;
    if (!arr) throw new Error('Expected a JSON array of accounts.');
    for (const r of arr as Record<string, unknown>[]) {
      add(
        r.username ?? r.handle ?? r.url,
        r.followers ?? r.follower_count ?? r.followers_count,
        r.verified ?? r.is_verified,
        r.display_name ?? r.full_name ?? r.name,
        r.country ?? r.country_code ?? r.location,
      );
    }
  } else {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('The CSV needs a header row and at least one account.');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (key: string) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
    const iu = col('username'), ifo = col('followers'), iv = col('verified'), id = col('displayName'), ic = col('country');
    if (iu < 0) throw new Error('The CSV needs a “username” column.');
    if (ifo < 0 && iv < 0 && id < 0 && ic < 0) throw new Error('Add at least one of these columns: followers, verified, display_name, country.');
    const at = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);
    for (const r of rows.slice(1)) add(r[iu], at(r, ifo), at(r, iv), at(r, id), at(r, ic));
  }
  return { meta, imported: Object.keys(meta).length, skipped, countries: countriesFound, unrecognizedCountries: unrecognized };
}
