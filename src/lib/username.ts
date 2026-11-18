const VALID = /^[a-z0-9._]{1,30}$/;

/** Path segments on instagram.com that are never usernames. */
const RESERVED = new Set([
  'accounts', 'explore', 'p', 'reel', 'reels', 'stories', 'direct', 'tv', 'about',
  'legal', 'developer', 'privacy', 'terms', 'web', 'emails', 'challenge', 'session',
]);

/** Lowercase, trim, drop a leading @. Returns null if the result is not a plausible username. */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^@+/, '').toLowerCase();
  // Some exports encode non-ASCII as mojibake; usernames are ASCII so anything else is noise.
  s = s.replace(/\s+/g, '');
  if (!VALID.test(s) || RESERVED.has(s)) return null;
  return s;
}

/** Extract a username from an Instagram profile URL (supports /_u/ and trailing slashes). */
export function usernameFromHref(href: unknown): string | null {
  if (typeof href !== 'string' || !href) return null;
  const m = href.match(/instagram\.com\/(?:_u\/)?([^/?#\s"']+)/i);
  if (!m) return null;
  try {
    return normalizeUsername(decodeURIComponent(m[1]));
  } catch {
    return normalizeUsername(m[1]);
  }
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}
