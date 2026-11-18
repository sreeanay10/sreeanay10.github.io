import { describe, expect, it } from 'vitest';
import { analyze, diffSnapshots } from './analysis';
import { accountTimeline, buildWrapped, eventWindow, knownUsernames } from './history';
import { smartSearch } from './smartSearch';
import { buildHealth } from './health';
import { layoutNetwork } from './layout';
import type { Snapshot } from './types';

const day = (d: string) => new Date(d).getTime();
const snap = (id: string, date: string, followers: string[], following: string[]): Snapshot => ({
  id, uploadedAt: day(date), exportDate: day(date), owner: 'me', source: 'zip', fileName: id,
  followers: followers.map((u) => ({ u })), following: following.map((u) => ({ u })),
});
const S1 = snap('a', '2026-01-10', ['amy', 'bob'], ['amy', 'cat']);
const S2 = snap('b', '2026-03-10', ['amy', 'cat', 'dan'], ['amy', 'cat', 'eve']);
const S3 = snap('c', '2026-06-10', ['cat', 'dan'], ['cat', 'eve', 'dan']);

describe('relationship detective', () => {
  it('builds an honest timeline between snapshot dates', () => {
    const t = accountTimeline('cat', [S3, S1, S2]);
    expect(t.points.map((p) => p.rel)).toEqual(['not-following-back', 'mutual', 'mutual']);
    expect(t.firstInFollowers).toBe(day('2026-03-10'));
    expect(t.current).toBe('mutual');
    const started = t.events.find((e) => e.text === 'They started following you')!;
    expect(eventWindow(started)).toMatch(/^between .* and /);
    const amy = accountTimeline('amy', [S1, S2, S3]);
    expect(amy.lastInFollowers).toBe(day('2026-03-10'));
    expect(amy.events.some((e) => e.text === 'They stopped following you')).toBe(true);
  });

  it('lists every known username across snapshots', () => {
    expect(knownUsernames([S1, S2, S3])).toEqual(['amy', 'bob', 'cat', 'dan', 'eve']);
  });
});

describe('wrapped', () => {
  it('sums real changes between consecutive snapshots in the year', () => {
    const w = buildWrapped(2026, [S1, S2, S3], {})!;
    const d1 = diffSnapshots(S1, S2, {}), d2 = diffSnapshots(S2, S3, {});
    expect(w.gained).toBe(d1.newFollowers.length + d2.newFollowers.length);
    expect(w.lost).toBe(d1.lostFollowers.length + d2.lostFollowers.length);
    expect(w.followersStart).toBe(2);
    expect(w.followersEnd).toBe(2);
    expect(w.series).toHaveLength(3);
  });
  it('needs at least two snapshots', () => {
    expect(buildWrapped(2026, [S1], {})).toBeNull();
    expect(buildWrapped(2025, [S1, S2], {})).toBeNull();
  });
});

describe('smart search', () => {
  const a = analyze(S3, {});
  const ctx = { analysis: a, snapshots: [S1, S2, S3], latestDiff: diffSnapshots(S2, S3, {}), meta: {}, geoEnabled: true };
  it('answers from real data', () => {
    const r1 = smartSearch('Who doesn’t follow me back?', ctx);
    expect(r1.kind).toBe('list');
    // eve is unconfirmed (needs review), so the confirmed list is empty but the note says so
    if (r1.kind === 'list') { expect(r1.total).toBe(0); expect(r1.note).toMatch(/Needs Review/); }
    const r2 = smartSearch('who recently unfollowed me', ctx);
    expect(r2.kind === 'list' && r2.usernames).toEqual(['amy']);
    const r3 = smartSearch('show all my mutual followers', ctx);
    expect(r3.kind === 'list' && r3.usernames).toEqual(['cat', 'dan']);
    const r4 = smartSearch('what is my follow-back rate', ctx);
    expect(r4.kind).toBe('stat');
  });
  it('does not invent follower counts or locations', () => {
    const big = smartSearch('which accounts have more than 100K followers', ctx);
    expect(big.kind === 'list' && big.total).toBe(0);
    const geo = smartSearch('show my follower distribution by country', ctx);
    expect(geo.kind).toBe('help');
  });
  it('asks for history when there is only one snapshot', () => {
    const r = smartSearch('who unfollowed me', { ...ctx, latestDiff: null });
    expect(r.kind === 'stat' && r.detail).toMatch(/second export/);
  });
});

describe('data health', () => {
  it('flags missing files, duplicates and mixed export dates', () => {
    const h = buildHealth({
      source: 'zip',
      files: [
        { name: 'followers_1.json', kind: 'followers', format: 'json', entries: 3, date: day('2026-01-01') },
        { name: 'followers_2.json', kind: 'followers', format: 'json', entries: 0, error: 'bad json', date: day('2026-01-01') },
        { name: 'following.json', kind: 'following', format: 'json', entries: 2, date: day('2026-02-01') },
      ],
      followersRaw: 4, followingRaw: 2,
      followers: [{ u: 'a' }, { u: 'b' }, { u: 'c' }], following: [{ u: 'a' }, { u: 'd' }], owner: null,
    });
    const ids = Object.fromEntries(h.checks.map((c) => [c.id, c.level]));
    expect(ids.malformed).toBe('warn');
    expect(ids['same-export']).toBe('warn');
    expect(ids.duplicates).toBe('info');
    expect(h.duplicates.followers).toBe(1);
  });
});

describe('layout', () => {
  it('places every account deterministically', () => {
    const a = analyze(S3, {});
    const l1 = layoutNetwork(a), l2 = layoutNetwork(a);
    expect(l1).toHaveLength(a.mutual.length + a.notFollowingBack.length + a.needsReview.length + a.excluded.length + a.fans.length);
    expect(l1.map((n) => n.p3)).toEqual(l2.map((n) => n.p3));
  });
});
