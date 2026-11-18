import type { Entry } from './types';

/**
 * Data health check: what was found in an export and how trustworthy it looks.
 * Everything here is measured from the files themselves — nothing is assumed.
 */

export type HealthLevel = 'ok' | 'info' | 'warn' | 'error';

export interface HealthCheck {
  id: string;
  level: HealthLevel;
  title: string;
  detail?: string;
}

export interface FileReport {
  name: string;
  kind: 'followers' | 'following';
  format: 'json' | 'html';
  entries: number;
  error?: string;
  /** File date (ZIP entry date or last-modified), ms. */
  date?: number;
}

export interface HealthReport {
  checks: HealthCheck[];
  files: FileReport[];
  duplicates: { followers: number; following: number };
  /** Share of entries that carry a follow date (0–1). */
  dated: number;
}

const DAY = 86_400_000;

export function buildHealth(input: {
  source: 'zip' | 'files';
  files: FileReport[];
  followersRaw: number;
  followingRaw: number;
  followers: Entry[];
  following: Entry[];
  owner: string | null;
}): HealthReport {
  const { files, followers, following } = input;
  const checks: HealthCheck[] = [];
  const ok = (f: FileReport) => !f.error;

  checks.push({ id: 'readable', level: 'ok', title: input.source === 'zip' ? 'ZIP opened' : 'Files read' });

  const fol = files.filter((f) => f.kind === 'followers' && ok(f));
  const ing = files.filter((f) => f.kind === 'following' && ok(f));
  checks.push(fol.length
    ? { id: 'followers', level: 'ok', title: fol.length > 1 ? `${fol.length} followers files, combined` : 'Followers file found' }
    : { id: 'followers', level: 'error', title: 'No followers file', detail: 'Everyone you follow will look like they don’t follow back.' });
  checks.push(ing.length
    ? { id: 'following', level: 'ok', title: 'Following file found' }
    : { id: 'following', level: 'error', title: 'No following file' });

  const broken = files.filter((f) => f.error);
  checks.push(broken.length
    ? { id: 'malformed', level: 'warn', title: `${broken.length} damaged ${broken.length === 1 ? 'file' : 'files'} skipped`, detail: broken.map((f) => f.name).join(', ') }
    : { id: 'malformed', level: 'ok', title: 'No damaged files' });

  const empty = !followers.length || !following.length;
  checks.push(empty
    ? { id: 'complete', level: 'warn', title: 'Data looks incomplete', detail: `${followers.length} followers · ${following.length} following` }
    : { id: 'complete', level: 'ok', title: `${followers.length.toLocaleString('en-US')} followers · ${following.length.toLocaleString('en-US')} following` });

  const dupF = Math.max(0, input.followersRaw - followers.length);
  const dupG = Math.max(0, input.followingRaw - following.length);
  checks.push(dupF + dupG
    ? { id: 'duplicates', level: 'info', title: `${(dupF + dupG).toLocaleString('en-US')} duplicates removed` }
    : { id: 'duplicates', level: 'ok', title: 'No duplicates' });

  const total = followers.length + following.length;
  const dated = total ? [...followers, ...following].filter((e) => e.t).length / total : 0;
  checks.push(dated >= 0.5
    ? { id: 'dates', level: 'ok', title: 'Follow dates included' }
    : { id: 'dates', level: 'info', title: 'Few follow dates', detail: 'HTML exports often leave them out.' });

  const times = files.map((f) => f.date).filter((d): d is number => !!d);
  if (times.length >= 2) {
    const spread = Math.max(...times) - Math.min(...times);
    checks.push(spread > 2 * DAY
      ? { id: 'same-export', level: 'warn', title: 'Files are from different dates', detail: `${Math.round(spread / DAY)} days apart — results may mix two exports.` }
      : { id: 'same-export', level: 'ok', title: 'Files are from one export' });
  }

  checks.push(input.owner
    ? { id: 'owner', level: 'ok', title: `Account @${input.owner}` }
    : { id: 'owner', level: 'info', title: 'Account name not included' });

  return { checks, files, duplicates: { followers: dupF, following: dupG }, dated };
}

export function healthScore(r: HealthReport): HealthLevel {
  if (r.checks.some((c) => c.level === 'error')) return 'error';
  if (r.checks.some((c) => c.level === 'warn')) return 'warn';
  return 'ok';
}
