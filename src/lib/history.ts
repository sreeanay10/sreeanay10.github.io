import type { MetaMap, Snapshot } from './types';
import { diffSnapshots, snapshotDate, sortSnapshots } from './analysis';
import { fmtDate } from './format';

/*
 * Relationship history across saved snapshots.
 * Snapshots are periodic, so we only ever know that something changed *between*
 * two snapshot dates — never the exact moment. All wording reflects that.
 */

export type Rel = 'mutual' | 'not-following-back' | 'fan' | 'none';

export const REL_LABEL: Record<Rel, string> = {
  mutual: 'Mutual',
  'not-following-back': 'Not following back',
  fan: 'Follows you · you don’t follow',
  none: 'No connection',
};

const sets = new WeakMap<Snapshot, { followers: Set<string>; following: Set<string> }>();
export function setsOf(s: Snapshot) {
  let v = sets.get(s);
  if (!v) {
    v = { followers: new Set(s.followers.map((e) => e.u)), following: new Set(s.following.map((e) => e.u)) };
    sets.set(s, v);
  }
  return v;
}

export function relOf(followsYou: boolean, youFollow: boolean): Rel {
  if (followsYou && youFollow) return 'mutual';
  if (youFollow) return 'not-following-back';
  if (followsYou) return 'fan';
  return 'none';
}

export interface TimelinePoint {
  snapshot: Snapshot;
  date: number;
  followsYou: boolean;
  youFollow: boolean;
  rel: Rel;
}

export interface TimelineEvent {
  /** The snapshot where the change was first observed. */
  seen: number;
  /** The previous snapshot, where it was not yet true. */
  since: number | null;
  text: string;
}

export interface AccountTimeline {
  username: string;
  points: TimelinePoint[];
  current: Rel;
  firstInFollowing: number | null;
  lastInFollowing: number | null;
  firstInFollowers: number | null;
  lastInFollowers: number | null;
  events: TimelineEvent[];
}

export function accountTimeline(username: string, snapshots: Snapshot[]): AccountTimeline {
  const sorted = sortSnapshots(snapshots);
  const points: TimelinePoint[] = sorted.map((s) => {
    const { followers, following } = setsOf(s);
    const followsYou = followers.has(username), youFollow = following.has(username);
    return { snapshot: s, date: snapshotDate(s), followsYou, youFollow, rel: relOf(followsYou, youFollow) };
  });
  const first = (f: (p: TimelinePoint) => boolean) => points.find(f)?.date ?? null;
  const last = (f: (p: TimelinePoint) => boolean) => [...points].reverse().find(f)?.date ?? null;

  const events: TimelineEvent[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const since = prev ? prev.date : null;
    if (!prev) {
      if (p.youFollow) events.push({ seen: p.date, since: null, text: 'You follow them (first snapshot)' });
      if (p.followsYou) events.push({ seen: p.date, since: null, text: 'They follow you (first snapshot)' });
      return;
    }
    if (p.youFollow && !prev.youFollow) events.push({ seen: p.date, since, text: 'You started following them' });
    if (!p.youFollow && prev.youFollow) events.push({ seen: p.date, since, text: 'You stopped following them' });
    if (p.followsYou && !prev.followsYou) events.push({ seen: p.date, since, text: 'They started following you' });
    if (!p.followsYou && prev.followsYou) events.push({ seen: p.date, since, text: 'They stopped following you' });
  });

  return {
    username,
    points,
    current: points[points.length - 1]?.rel ?? 'none',
    firstInFollowing: first((p) => p.youFollow),
    lastInFollowing: last((p) => p.youFollow),
    firstInFollowers: first((p) => p.followsYou),
    lastInFollowers: last((p) => p.followsYou),
    events,
  };
}

/** Honest phrasing for a change observed between two snapshots. */
export function eventWindow(e: TimelineEvent): string {
  return e.since ? `between ${fmtDate(e.since)} and ${fmtDate(e.seen)}` : `as of ${fmtDate(e.seen)}`;
}

/** Every username that appears in any saved snapshot. */
export function knownUsernames(snapshots: Snapshot[]): string[] {
  const all = new Set<string>();
  for (const s of snapshots) {
    for (const e of s.followers) all.add(e.u);
    for (const e of s.following) all.add(e.u);
  }
  return [...all].sort();
}

/* ─────────────────────────── Wrapped ─────────────────────────── */

export interface WrappedData {
  year: number;
  start: Snapshot;
  end: Snapshot;
  snapshots: Snapshot[];
  gained: number;
  lost: number;
  followed: number;
  unfollowed: number;
  mutualStart: number;
  mutualEnd: number;
  rateStart: number | null;
  rateEnd: number | null;
  followersStart: number;
  followersEnd: number;
  followingEnd: number;
  /** Followers per snapshot, for the growth line. */
  series: { x: number; y: number }[];
  /** The comparison window with the most observed changes. */
  busiest: { from: number; to: number; changes: number } | null;
}

export function wrappedYears(snapshots: Snapshot[]): number[] {
  return [...new Set(snapshots.map((s) => new Date(snapshotDate(s)).getFullYear()))].sort((a, b) => b - a);
}

const mutualCount = (s: Snapshot) => {
  const { followers } = setsOf(s);
  return s.following.filter((e) => followers.has(e.u)).length;
};

/**
 * A year in review built only from snapshots. Uses the snapshots dated in that year,
 * plus the last one before it (if any) as the starting point.
 */
export function buildWrapped(year: number, all: Snapshot[], meta: MetaMap): WrappedData | null {
  const sorted = sortSnapshots(all);
  const inYear = sorted.filter((s) => new Date(snapshotDate(s)).getFullYear() === year);
  if (!inYear.length) return null;
  const before = sorted.filter((s) => snapshotDate(s) < snapshotDate(inYear[0]) && new Date(snapshotDate(s)).getFullYear() < year).pop();
  const chain = before ? [before, ...inYear] : inYear;
  if (chain.length < 2) return null;

  let gained = 0, lost = 0, followed = 0, unfollowed = 0;
  let busiest: WrappedData['busiest'] = null;
  for (let i = 1; i < chain.length; i++) {
    const d = diffSnapshots(chain[i - 1], chain[i], meta);
    gained += d.newFollowers.length;
    lost += d.lostFollowers.length;
    followed += d.newlyFollowed.length;
    unfollowed += d.unfollowedByYou.length;
    const changes = d.newFollowers.length + d.lostFollowers.length + d.newlyFollowed.length + d.unfollowedByYou.length;
    if (!busiest || changes > busiest.changes) busiest = { from: snapshotDate(chain[i - 1]), to: snapshotDate(chain[i]), changes };
  }
  const start = chain[0], end = chain[chain.length - 1];
  const rate = (s: Snapshot) => (s.following.length ? (mutualCount(s) / s.following.length) * 100 : null);
  return {
    year,
    start,
    end,
    snapshots: chain,
    gained,
    lost,
    followed,
    unfollowed,
    mutualStart: mutualCount(start),
    mutualEnd: mutualCount(end),
    rateStart: rate(start),
    rateEnd: rate(end),
    followersStart: start.followers.length,
    followersEnd: end.followers.length,
    followingEnd: end.following.length,
    series: chain.map((s) => ({ x: snapshotDate(s), y: s.followers.length })),
    busiest,
  };
}
