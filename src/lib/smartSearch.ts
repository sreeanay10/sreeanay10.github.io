import type { Analysis, MetaMap, Snapshot, SnapshotDiff } from './types';
import { FOLLOWER_THRESHOLD } from './analysis';
import { countryName, summarizeGeo } from './geo';
import { fmtNumber, fmtPercent } from './format';
import { normalizeUsername } from './username';

/**
 * Smart Search: plain-English questions answered from the uploaded data only.
 * A small rule-based parser — no AI service, nothing leaves the device, and
 * questions it can't answer from real data get an honest “can't tell” instead.
 */

export type SearchResult =
  | { kind: 'list'; title: string; usernames: string[]; total: number; link?: string; note?: string }
  | { kind: 'stat'; title: string; value: string; detail?: string; link?: string }
  | { kind: 'countries'; title: string; rows: { name: string; value: number; share: number }[]; detail: string; link: string }
  | { kind: 'help'; title: string; detail?: string };

export const SUGGESTIONS = [
  'Who doesn’t follow me back?',
  'Who recently unfollowed me?',
  'Show all my mutual followers',
  'Which accounts have more than 100K followers?',
  'Show my follower distribution by country',
  'What’s my follow-back rate?',
  'Who started following me?',
  'Followers I don’t follow back',
];

interface Ctx {
  analysis: Analysis;
  snapshots: Snapshot[];
  latestDiff: SnapshotDiff | null;
  meta: MetaMap;
  geoEnabled: boolean;
}

const LIMIT = 60;
const list = (title: string, usernames: string[], link?: string, note?: string): SearchResult => ({
  kind: 'list', title, usernames: usernames.slice(0, LIMIT), total: usernames.length, link, note,
});
const names = (a: { username: string }[]) => a.map((x) => x.username).sort();

export function smartSearch(raw: string, ctx: Ctx): SearchResult {
  const q = raw.toLowerCase().replace(/[’']/g, "'").replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim();
  const { analysis: a, latestDiff: d, meta } = ctx;
  if (!q) return { kind: 'help', title: 'Ask about your network' };
  const has = (re: RegExp) => re.test(q);
  const needsHistory = (title: string): SearchResult => ({
    kind: 'stat', title, value: '—', detail: 'Upload a second export to compare. Changes can only be seen between two snapshots.', link: '/analyze',
  });

  // Changes over time (need two snapshots)
  if (has(/\b(i|me) (have )?unfollowed\b|\bunfollowed by me\b|\bi stopped following\b/)) {
    return d ? list(`You unfollowed · since ${new Date(d.from.exportDate ?? d.from.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, d.unfollowedByYou, '/activity') : needsHistory('Accounts you unfollowed');
  }
  if (has(/unfollow(ed)? me|lost (my )?followers|stopped following me|who left|lost followers/)) {
    return d ? list('Stopped following you since your last upload', d.lostFollowers, '/activity', 'Seen between your last two snapshots — not the exact day.') : needsHistory('Who unfollowed you');
  }
  if (has(/new followers|started following me|gained|who followed me|recent followers/)) {
    return d ? list('New followers since your last upload', d.newFollowers, '/activity') : needsHistory('New followers');
  }

  // Relationship lists
  if (has(/\bi (do not|don't|dont) follow\b|follow me but|followers i|fans\b|not followed by me|i don't follow back|i dont follow back/)) {
    return list('Follow you · you don’t follow back', names(a.fans), '/followers-only');
  }
  if (has(/(doesn't|does not|dont|don't|do not|not|aren't|isn't) follow(ing)?( me)? back|non.?follow|not following back|unfollowers?/)) {
    return list('Not following you back', names(a.notFollowingBack), '/not-following-back',
      a.needsReview.length ? `${fmtNumber(a.needsReview.length)} more are waiting in Needs Review.` : undefined);
  }
  if (has(/mutual|follow each other|both follow/)) return list('Mutual followers', names(a.mutual), '/mutual');
  if (has(/needs? review|unconfirmed|to review/)) return list('Needs review', names(a.needsReview), '/review');
  if (has(/excluded|set aside/)) return list('Excluded accounts', names(a.excluded), '/excluded');

  // Metadata questions — only confirmed values
  if (has(/(more than|over|above|>|bigger than)\s*100\s*k|100,?000|famous|celebrit|big accounts|large accounts|public figures/)) {
    const everyone = new Set([...ctx.analysis.snapshot.followers, ...ctx.analysis.snapshot.following].map((e) => e.u));
    const big = [...everyone].filter((u) => (meta[u]?.followerCount ?? 0) > FOLLOWER_THRESHOLD || meta[u]?.confirmedOverThreshold).sort();
    return list('Over 100K followers', big, '/excluded', 'Only accounts whose size you’ve confirmed — Instagram’s export doesn’t include follower counts.');
  }
  if (has(/verified|blue (check|badge)/)) {
    const everyone = new Set([...a.snapshot.followers, ...a.snapshot.following].map((e) => e.u));
    return list('Verified accounts', [...everyone].filter((u) => meta[u]?.verified).sort(), '/excluded', 'Only accounts you’ve confirmed as verified.');
  }
  if (has(/countr|where|location|map|distribution|geograph/)) {
    if (!ctx.geoEnabled) return { kind: 'help', title: 'The World Map is turned off', detail: 'Turn it on in Settings.' };
    const g = summarizeGeo(a, meta, 'followers', 'all');
    if (!g.ranked.length) return { kind: 'help', title: 'No locations yet', detail: 'Instagram doesn’t share them. Add countries per account or import a CSV.' };
    return {
      kind: 'countries',
      title: 'Followers by country',
      rows: g.ranked.slice(0, 6).map((r) => ({ name: countryName(r.code), value: r.value, share: g.locatedFollowers ? (r.value / g.locatedFollowers) * 100 : 0 })),
      detail: `${fmtNumber(g.locatedFollowers)} of ${fmtNumber(a.followersCount)} followers have a country you added.`,
      link: '/world',
    };
  }

  // Numbers
  if (has(/rate|percent|ratio|how many follow (me )?back/)) {
    return { kind: 'stat', title: 'Follow-back rate', value: fmtPercent(a.followBackRate), detail: `${fmtNumber(a.mutual.length)} of ${fmtNumber(a.followingCount)} you follow follow you back.`, link: '/analytics' };
  }
  if (has(/how many (people|accounts) (do )?i follow|following count|how many following/)) {
    return { kind: 'stat', title: 'You follow', value: fmtNumber(a.followingCount), link: '/dashboard' };
  }
  if (has(/how many followers|follower count|followers do i have/)) {
    return { kind: 'stat', title: 'Followers', value: fmtNumber(a.followersCount), link: '/dashboard' };
  }

  // Username lookup
  const handle = normalizeUsername(q.replace(/^(find|show|who is|search)\s+/, '').split(' ')[0]);
  if (handle) {
    const everyone = new Set([...a.snapshot.followers, ...a.snapshot.following].map((e) => e.u));
    const matches = [...everyone].filter((u) => u.includes(handle)).sort((x, y) => (x === handle ? -1 : y === handle ? 1 : x.localeCompare(y)));
    if (matches.length) return list(`Accounts matching “${handle}”`, matches);
  }
  return { kind: 'help', title: 'I can’t answer that from your export', detail: 'Try one of the questions below.' };
}
