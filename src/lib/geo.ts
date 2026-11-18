import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import type { Analysis, MetaMap } from './types';

/*
 * Country data for the Follower World Map.
 *
 * Location is never inferred. A country exists for an account only when the user
 * entered it, or imported it from a source where people shared it voluntarily.
 * Only country-level data is stored — no cities, coordinates or addresses.
 */

countries.registerLocale(en);

/** Short, neutral display names where the ISO "official" name is long or awkward. */
const DISPLAY: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', RU: 'Russia', KR: 'South Korea', KP: 'North Korea',
  TW: 'Taiwan', IR: 'Iran', SY: 'Syria', LA: 'Laos', MD: 'Moldova', FM: 'Micronesia', MK: 'North Macedonia',
  PS: 'Palestine', TZ: 'Tanzania', CD: 'DR Congo', CG: 'Republic of the Congo', VE: 'Venezuela', BO: 'Bolivia',
  VN: 'Vietnam', CI: "Côte d'Ivoire", BN: 'Brunei', CV: 'Cabo Verde', CZ: 'Czechia', VA: 'Vatican City',
  SZ: 'Eswatini', BS: 'Bahamas', GM: 'Gambia', VG: 'British Virgin Islands', VI: 'U.S. Virgin Islands',
  FK: 'Falkland Islands', MO: 'Macao', HK: 'Hong Kong', XK: 'Kosovo', TR: 'Türkiye', NL: 'Netherlands',
  DO: 'Dominican Republic', AE: 'United Arab Emirates', CF: 'Central African Republic', BA: 'Bosnia and Herzegovina',
};

const ALIASES: Record<string, string> = {
  england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', britain: 'GB', 'great britain': 'GB',
  america: 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states': 'US', holland: 'NL', 'viet nam': 'VN',
  'south korea': 'KR', 'north korea': 'KP', 'ivory coast': 'CI', 'czech republic': 'CZ', burma: 'MM',
  'the netherlands': 'NL', 'the bahamas': 'BS', 'the gambia': 'GM', 'dr congo': 'CD', drc: 'CD',
  'macau': 'MO', 'swaziland': 'SZ', 'cape verde': 'CV', 'vatican': 'VA', 'turkiye': 'TR', 'türkiye': 'TR',
};

const NAMES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, official] of Object.entries(countries.getNames('en', { select: 'official' }))) {
    if (DISPLAY[code]) { out[code] = DISPLAY[code]; continue; }
    const alias = countries.getName(code, 'en', { select: 'alias' });
    out[code] = official.includes(',') && alias && !alias.includes(',') ? alias : official;
  }
  return out;
})();

export function countryName(code: string): string {
  return NAMES[code] ?? code;
}

/** All countries, sorted by display name — for pickers and search. */
export const COUNTRY_LIST: { code: string; name: string }[] = Object.entries(NAMES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Accepts ISO alpha-2 / alpha-3 / numeric codes and English names (“USA”, “UK”, “Türkiye”). */
export function normalizeCountry(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return countries.isValid(up) ? up : up === 'UK' ? 'GB' : null;
  if (/^[A-Z]{3}$/.test(up)) {
    const a2 = countries.alpha3ToAlpha2(up);
    if (a2) return a2;
  }
  if (/^\d{1,3}$/.test(raw)) return countries.numericToAlpha2(raw.padStart(3, '0')) ?? null;
  const lower = raw.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  return countries.getSimpleAlpha2Code(raw, 'en') ?? countries.getAlpha2Code(raw, 'en') ?? null;
}

export function alpha2ToNumeric(code: string): string | undefined {
  return countries.alpha2ToNumeric(code) ?? (code === 'XK' ? '983' : undefined);
}

export function numericToAlpha2(id: string): string | undefined {
  return countries.numericToAlpha2(id);
}

/** Search names, codes and common aliases. */
export function searchCountries(query: string, limit = 8): { code: string; name: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const direct = normalizeCountry(query);
  const scored = COUNTRY_LIST.map((c) => {
    const n = c.name.toLowerCase();
    const score = c.code === direct ? 0 : n.startsWith(q) ? 1 : n.split(/[\s-]/).some((w) => w.startsWith(q)) ? 2 : n.includes(q) ? 3 : 9;
    return { c, score };
  }).filter((x) => x.score < 9);
  return scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name)).slice(0, limit).map((x) => x.c);
}

/* ─────────────────────────── aggregation ─────────────────────────── */

export type GeoMode = 'followers' | 'following';
export type GeoFilter = 'all' | 'mutual' | 'one-way';

export interface CountryStat {
  code: string;
  followers: number;
  following: number;
  mutual: number;
  /** Accounts you follow that don't follow back (verified / 100K+ excluded; includes ones awaiting review). */
  nonFollowBack: number;
  /** Followers you don't follow back. */
  fans: number;
  /** Count for the active mode + filter — drives the map shading. */
  value: number;
  /** Usernames for the active mode + filter. Shown only when the user asks. */
  accounts: string[];
}

export interface GeoSummary {
  byCountry: Map<string, CountryStat>;
  ranked: CountryStat[];
  /** Accounts in the active mode + filter. */
  total: number;
  /** …of which have a country. */
  located: number;
  /** Followers with a country (denominator for “share of followers”). */
  locatedFollowers: number;
  max: number;
}

export function filterLabel(mode: GeoMode, filter: GeoFilter): string {
  if (filter === 'mutual') return 'Mutual';
  if (filter === 'one-way') return mode === 'followers' ? "You don't follow back" : 'Not following you back';
  return mode === 'followers' ? 'All followers' : 'All following';
}

export function summarizeGeo(analysis: Analysis, meta: MetaMap, mode: GeoMode, filter: GeoFilter): GeoSummary {
  const followers = new Set(analysis.snapshot.followers.map((e) => e.u));
  const following = new Set(analysis.snapshot.following.map((e) => e.u));
  const mutual = new Set(analysis.mutual.map((a) => a.username));
  const nonFollowBack = new Set([...analysis.notFollowingBack, ...analysis.needsReview].map((a) => a.username));
  const fans = new Set(analysis.fans.map((a) => a.username));

  const inView = (u: string) => {
    if (mode === 'followers') {
      if (!followers.has(u)) return false;
      return filter === 'all' || (filter === 'mutual' ? mutual.has(u) : fans.has(u));
    }
    if (!following.has(u)) return false;
    return filter === 'all' || (filter === 'mutual' ? mutual.has(u) : nonFollowBack.has(u));
  };

  const byCountry = new Map<string, CountryStat>();
  const stat = (code: string) => {
    let s = byCountry.get(code);
    if (!s) {
      s = { code, followers: 0, following: 0, mutual: 0, nonFollowBack: 0, fans: 0, value: 0, accounts: [] };
      byCountry.set(code, s);
    }
    return s;
  };

  let located = 0, locatedFollowers = 0;
  const everyone = new Set([...followers, ...following]);
  for (const u of everyone) {
    const code = meta[u]?.country;
    if (!code) continue;
    const s = stat(code);
    if (followers.has(u)) { s.followers++; locatedFollowers++; }
    if (following.has(u)) s.following++;
    if (mutual.has(u)) s.mutual++;
    if (nonFollowBack.has(u)) s.nonFollowBack++;
    if (fans.has(u)) s.fans++;
    if (inView(u)) { s.value++; s.accounts.push(u); located++; }
  }
  let total = 0;
  for (const u of everyone) if (inView(u)) total++;

  for (const s of byCountry.values()) s.accounts.sort();
  const ranked = [...byCountry.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value || countryName(a.code).localeCompare(countryName(b.code)));
  return { byCountry, ranked, total, located, locatedFollowers, max: ranked[0]?.value ?? 0 };
}

/** Five-step monochrome scale; square-root so one big country doesn't wash out the rest. */
export const HEAT = ['#E3E3E3', '#C4C4C4', '#9B9B9B', '#6B6B6B', '#383838', '#000000'] as const;

export function heatLevel(value: number, max: number): number {
  if (!value || !max) return 0;
  return Math.max(1, Math.min(5, Math.ceil(5 * Math.sqrt(value / max))));
}
