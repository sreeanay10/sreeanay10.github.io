import type { Entry, ParseResult } from './types';
import { normalizeUsername, usernameFromHref } from './username';
import { buildHealth, type FileReport } from './health';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export type Kind = 'followers' | 'following';
export type Format = 'json' | 'html';

export interface ProgressUpdate {
  stage: 'reading' | 'locating' | 'parsing' | 'analyzing' | 'done';
  /** 0–1 */
  progress: number;
  detail?: string;
}
export type OnProgress = (u: ProgressUpdate) => void;

/* ───────────────────────── file identification ───────────────────────── */

const FOLLOWERS_RE = /^followers(?:_\d+)?\.(json|html?)$/i;
const FOLLOWING_RE = /^following(?:_\d+)?\.(json|html?)$/i;

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Strict match used inside ZIP archives, where Instagram's names are reliable. */
export function identifyExportPath(path: string): { kind: Kind; format: Format } | null {
  if (/(^|\/)__MACOSX\//.test(path) || basename(path).startsWith('._')) return null;
  const name = basename(path);
  let m = name.match(FOLLOWERS_RE);
  if (m) return { kind: 'followers', format: m[1].toLowerCase() === 'json' ? 'json' : 'html' };
  m = name.match(FOLLOWING_RE);
  if (m) return { kind: 'following', format: m[1].toLowerCase() === 'json' ? 'json' : 'html' };
  return null;
}

export function formatOf(name: string): Format | null {
  if (/\.json$/i.test(name)) return 'json';
  if (/\.html?$/i.test(name)) return 'html';
  return null;
}

/* ───────────────────────────── JSON parsing ───────────────────────────── */

interface StringListItem {
  href?: string;
  value?: string;
  timestamp?: number;
}

function entryFromNode(node: Record<string, unknown>): Entry | null {
  const list = node.string_list_data as StringListItem[] | undefined;
  const first = Array.isArray(list) ? list[0] ?? {} : {};
  const u =
    normalizeUsername(first.value) ??
    normalizeUsername(node.title) ??
    usernameFromHref(first.href);
  if (!u) return null;
  const t = typeof first.timestamp === 'number' && first.timestamp > 0 ? first.timestamp : undefined;
  return t ? { u, t } : { u };
}

/**
 * Walk any Instagram relationship JSON and collect entries. Works for both the
 * older shape (array of { string_list_data: [{ value, href, timestamp }] }) and the
 * newer one ({ relationships_following: [{ title, string_list_data: [{ href, timestamp }] }] }).
 */
export function parseRelationshipJson(text: string, fileName = 'file'): Entry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError(`${fileName} isn't valid JSON. It may be damaged or incomplete — try downloading your export again.`);
  }
  const out: Entry[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.string_list_data)) {
      const e = entryFromNode(obj);
      if (e) out.push(e);
      return;
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  };
  walk(data, 0);
  return out;
}

/** Guess whether a JSON document is a followers or following list from its contents. */
export function sniffJsonKind(text: string): Kind | null {
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes('relationships_following')) return 'following';
  if (head.includes('relationships_followers')) return 'followers';
  if (/^\s*\[/.test(text)) return 'followers';
  return null;
}

/* ───────────────────────────── HTML parsing ───────────────────────────── */

const DATE_RE =
  /([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}(?:,? \d{1,2}:\d{2}(?::\d{2})?\s?(?:[ap]\.?m\.?)?)?)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHtmlDate(raw: string): number | undefined {
  const cleaned = raw.replace(/\./g, '').replace(/(\d)\s?(am|pm)$/i, '$1 $2');
  const ms = Date.parse(cleaned.replace(/,(\s\d{1,2}:)/, '$1'));
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : undefined;
}

/**
 * Parse an Instagram HTML export page. Each account is an anchor to its profile,
 * optionally followed by a date line. Regex-based so it works identically in
 * the browser and in tests, and tolerates the several HTML layouts Instagram has shipped.
 */
export function parseRelationshipHtml(html: string): Entry[] {
  const out: Entry[] = [];
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']*instagram\.com[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(anchorRe)];
  matches.forEach((m, i) => {
    // Only trust the link target: anchor text like "Log in" must never become a username.
    const u = usernameFromHref(m[1]);
    if (!u) return;
    const segEnd = i + 1 < matches.length ? matches[i + 1].index! : Math.min(html.length, m.index! + 800);
    const segment = decodeEntities(html.slice(m.index! + m[0].length, segEnd).replace(/<[^>]+>/g, ' '));
    const d = segment.match(DATE_RE);
    const t = d ? parseHtmlDate(d[1]) : undefined;
    out.push(t ? { u, t } : { u });
  });
  return out;
}

export function sniffHtmlKind(html: string): Kind | null {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').toLowerCase();
  if (title.includes('following')) return 'following';
  if (title.includes('follower')) return 'followers';
  return null;
}

/* ───────────────────────────── shared helpers ─────────────────────────── */

/** Remove duplicates by username, keeping the earliest known timestamp. */
export function dedupe(entries: Entry[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const e of entries) {
    const prev = map.get(e.u);
    if (!prev) map.set(e.u, { ...e });
    else if (e.t && (!prev.t || e.t < prev.t)) prev.t = e.t;
  }
  return [...map.values()];
}

export function parseByFormat(text: string, format: Format, fileName: string): Entry[] {
  return format === 'json' ? parseRelationshipJson(text, fileName) : parseRelationshipHtml(text);
}

function dateFromFileName(name: string): number | null {
  const m = name.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function finalize(
  followers: Entry[],
  following: Entry[],
  extras: Omit<ParseResult, 'followers' | 'following' | 'health'>,
  source: 'zip' | 'files',
  files: FileReport[],
): ParseResult {
  const res = { followers: dedupe(followers), following: dedupe(following), ...extras } as ParseResult;
  if (res.owner) {
    res.followers = res.followers.filter((e) => e.u !== res.owner);
    res.following = res.following.filter((e) => e.u !== res.owner);
  }
  res.health = buildHealth({
    source,
    files,
    followersRaw: followers.length,
    followingRaw: following.length,
    followers: res.followers,
    following: res.following,
    owner: res.owner,
  });
  return res;
}

/* ─────────────────────────────── ZIP import ───────────────────────────── */

type ZipLike = import('jszip');

async function locateInZip(zip: ZipLike, depth = 0): Promise<{
  zip: ZipLike;
  hits: { path: string; kind: Kind; format: Format; date: Date }[];
}> {
  const hits: { path: string; kind: Kind; format: Format; date: Date }[] = [];
  const nested: string[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const id = identifyExportPath(path);
    if (id) hits.push({ path, ...id, date: entry.date });
    else if (/\.zip$/i.test(path) && !path.includes('__MACOSX')) nested.push(path);
  });
  // Instagram keeps the real lists in connections/followers_and_following/. Other folders
  // (e.g. Threads) reuse the same file names, so when that folder exists, use only it.
  const official = hits.filter((h) => /(^|\/)followers_and_following\//i.test(h.path));
  if (official.length) hits.splice(0, hits.length, ...official);
  else hits.splice(0, hits.length, ...hits.filter((h) => !/(^|\/)threads\//i.test(h.path)));
  if (hits.length === 0 && nested.length > 0 && depth === 0) {
    const JSZip = (await import('jszip')).default;
    for (const p of nested) {
      const inner = await JSZip.loadAsync(await zip.file(p)!.async('arraybuffer'));
      const res = await locateInZip(inner, 1);
      if (res.hits.length) return res;
    }
  }
  return { zip, hits };
}

export async function parseZip(file: File, onProgress?: OnProgress): Promise<ParseResult> {
  onProgress?.({ stage: 'reading', progress: 0.05, detail: 'Opening archive' });
  const JSZip = (await import('jszip')).default;
  let root: ZipLike;
  try {
    root = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ImportError("This file couldn't be opened as a ZIP archive. Make sure it's the export Instagram sent you, fully downloaded.");
  }
  onProgress?.({ stage: 'locating', progress: 0.25, detail: 'Finding followers and following' });
  const { zip, hits } = await locateInZip(root);

  const warnings: string[] = [];
  const pick = (kind: Kind) => {
    const all = hits.filter((h) => h.kind === kind);
    const json = all.filter((h) => h.format === 'json');
    return json.length ? json : all.filter((h) => h.format === 'html');
  };
  const followersFiles = pick('followers');
  const followingFiles = pick('following');

  if (!followersFiles.length && !followingFiles.length) {
    throw new ImportError(
      "We couldn't find followers or following data in this archive. When requesting your download, make sure “Followers and following” is selected.",
    );
  }
  if (!followersFiles.length) warnings.push('No followers file was found in this export, so everyone you follow will appear as not following back.');
  if (!followingFiles.length) warnings.push('No following file was found in this export.');

  const targets = [...followersFiles, ...followingFiles];
  const followers: Entry[] = [];
  const following: Entry[] = [];
  const reports: FileReport[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    onProgress?.({
      stage: 'parsing',
      progress: 0.3 + 0.6 * (i / targets.length),
      detail: `File ${i + 1} of ${targets.length} · ${basename(t.path)}`,
    });
    const text = await zip.file(t.path)!.async('string');
    const report: FileReport = { name: basename(t.path), kind: t.kind, format: t.format, entries: 0, date: t.date?.getTime() };
    try {
      const parsed = parseByFormat(text, t.format, basename(t.path));
      report.entries = parsed.length;
      (t.kind === 'followers' ? followers : following).push(...parsed);
    } catch (e) {
      report.error = e instanceof Error ? e.message : 'unreadable';
      warnings.push(e instanceof Error ? e.message : `Couldn't read ${basename(t.path)}.`);
    }
    reports.push(report);
  }

  // Only followers and following are read — nothing else in the archive is opened.
  const owner: string | null = null;

  const zipDates = targets.map((t) => t.date?.getTime()).filter((d): d is number => !!d && d > 1262304000000 && d < Date.now() + 864e5);
  const exportDate = dateFromFileName(file.name) ?? (zipDates.length ? Math.max(...zipDates) : null);

  if (!followers.length && !following.length) {
    throw new ImportError('The followers and following files were found, but contained no accounts we could read.');
  }

  return finalize(followers, following, {
    owner,
    exportDate,
    filesUsed: targets.map((t) => t.path),
    warnings,
  }, 'zip', reports);
}

/* ──────────────────────────── individual files ────────────────────────── */

export async function parseFiles(
  followersFiles: File[],
  followingFiles: File[],
  onProgress?: OnProgress,
): Promise<ParseResult> {
  const all = [
    ...followersFiles.map((f) => ({ f, kind: 'followers' as Kind })),
    ...followingFiles.map((f) => ({ f, kind: 'following' as Kind })),
  ];
  if (!all.length) throw new ImportError('Add at least one followers or following file.');
  const followers: Entry[] = [];
  const following: Entry[] = [];
  const warnings: string[] = [];
  const reports: FileReport[] = [];
  for (let i = 0; i < all.length; i++) {
    const { f, kind } = all[i];
    onProgress?.({ stage: 'parsing', progress: 0.1 + 0.8 * (i / all.length), detail: `File ${i + 1} of ${all.length} · ${f.name}` });
    const format = formatOf(f.name);
    if (!format) {
      warnings.push(`${f.name} was skipped — only .json and .html files from Instagram are supported here.`);
      continue;
    }
    const text = await f.text();
    const sniffed = format === 'json' ? sniffJsonKind(text) : sniffHtmlKind(text);
    if (sniffed && sniffed !== kind) {
      warnings.push(`${f.name} looks like a ${sniffed} file but was added as ${kind}. It was read as ${sniffed}.`);
    }
    const finalKind = sniffed ?? kind;
    const target = finalKind === 'followers' ? followers : following;
    const report: FileReport = { name: f.name, kind: finalKind, format, entries: 0, date: f.lastModified || undefined };
    try {
      const parsed = parseByFormat(text, format, f.name);
      report.entries = parsed.length;
      target.push(...parsed);
    } catch (e) {
      report.error = e instanceof Error ? e.message : 'unreadable';
      warnings.push(e instanceof Error ? e.message : `Couldn't read ${f.name}.`);
    }
    reports.push(report);
  }
  if (!followers.length && !following.length) {
    throw new ImportError("We couldn't find any accounts in these files. Check that they're the followers and following files from your Instagram export.");
  }
  if (!followers.length) warnings.push('No followers were found, so everyone you follow will appear as not following back.');
  if (!following.length) warnings.push('No following accounts were found.');
  return finalize(followers, following, {
    owner: null,
    exportDate: null,
    filesUsed: all.map((a) => a.f.name),
    warnings,
  }, 'files', reports);
}
