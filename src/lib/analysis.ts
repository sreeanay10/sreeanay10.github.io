import type {
  Account, AccountMeta, Analysis, Category, ExclusionReason, MetaMap, Snapshot, SnapshotDiff,
} from './types';
import { profileUrl } from './username';

/** Accounts with MORE than this many followers are excluded. Exactly 100,000 is not. */
export const FOLLOWER_THRESHOLD = 100_000;

export type Verdict =
  | { category: 'excluded'; reasons: ExclusionReason[] }
  | { category: 'not-following-back'; reasons: [] }
  | { category: 'needs-review'; reasons: [] };

/**
 * Decide where a non-follow-back account belongs.
 *  • Verified (any size)            → excluded
 *  • More than 100,000 followers    → excluded
 *  • Confirmed not verified AND confirmed ≤100,000, or confirmed regular by the user → not following back
 *  • Anything unconfirmed           → needs review (never assumed ordinary)
 */
export function classifyNonFollowBack(meta: AccountMeta | undefined): Verdict {
  const reasons: ExclusionReason[] = [];
  if (meta?.verified === true) reasons.push('verified');
  if (
    meta?.confirmedOverThreshold ||
    (typeof meta?.followerCount === 'number' && meta.followerCount > FOLLOWER_THRESHOLD)
  ) reasons.push('over-threshold');
  if (reasons.length) return { category: 'excluded', reasons };

  if (meta?.confirmedRegular) return { category: 'not-following-back', reasons: [] };
  if (meta?.verified === false && typeof meta.followerCount === 'number') {
    return { category: 'not-following-back', reasons: [] };
  }
  return { category: 'needs-review', reasons: [] };
}

function setOf(entries: { u: string }[]): Set<string> {
  return new Set(entries.map((e) => e.u));
}

export function analyze(snapshot: Snapshot, metadata: MetaMap): Analysis {
  const followers = new Map(snapshot.followers.map((e) => [e.u, e]));
  const following = new Map(snapshot.following.map((e) => [e.u, e]));

  const make = (u: string, category: Category, reasons: ExclusionReason[] = []): Account => ({
    username: u,
    href: profileUrl(u),
    followedAt: following.get(u)?.t,
    followerSince: followers.get(u)?.t,
    meta: metadata[u],
    category,
    reasons,
  });

  const mutual: Account[] = [];
  const notFollowingBack: Account[] = [];
  const excluded: Account[] = [];
  const needsReview: Account[] = [];
  const fans: Account[] = [];

  for (const u of following.keys()) {
    if (followers.has(u)) {
      mutual.push(make(u, 'mutual'));
      continue;
    }
    const v = classifyNonFollowBack(metadata[u]);
    if (v.category === 'excluded') excluded.push(make(u, 'excluded', v.reasons));
    else if (v.category === 'not-following-back') notFollowingBack.push(make(u, 'not-following-back'));
    else needsReview.push(make(u, 'needs-review'));
  }
  for (const u of followers.keys()) {
    if (!following.has(u)) fans.push(make(u, 'fans'));
  }

  return {
    snapshot,
    followersCount: followers.size,
    followingCount: following.size,
    mutual,
    notFollowingBack,
    excluded,
    needsReview,
    fans,
    followBackRate: following.size ? (mutual.length / following.size) * 100 : null,
  };
}

/** Raw FOLLOWING − FOLLOWERS, before any filtering. */
export function rawNonFollowBacks(s: Snapshot): Set<string> {
  const f = setOf(s.followers);
  return new Set(s.following.map((e) => e.u).filter((u) => !f.has(u)));
}

/** Non-follow-backs that are not excluded as verified / >100K (includes ones still awaiting review). */
export function eligibleNonFollowBacks(s: Snapshot, metadata: MetaMap): Set<string> {
  return new Set([...rawNonFollowBacks(s)].filter((u) => classifyNonFollowBack(metadata[u]).category !== 'excluded'));
}

export function mutualSet(s: Snapshot): Set<string> {
  const f = setOf(s.followers);
  return new Set(s.following.map((e) => e.u).filter((u) => f.has(u)));
}

const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

/** Compare two snapshots. `from` must be the older one. */
export function diffSnapshots(from: Snapshot, to: Snapshot, metadata: MetaMap): SnapshotDiff {
  const fa = setOf(from.followers), fb = setOf(to.followers);
  const ga = setOf(from.following), gb = setOf(to.following);
  const ma = mutualSet(from), mb = mutualSet(to);
  const na = eligibleNonFollowBacks(from, metadata), nb = eligibleNonFollowBacks(to, metadata);
  return {
    from,
    to,
    newFollowers: minus(fb, fa),
    lostFollowers: minus(fa, fb),
    newlyFollowed: minus(gb, ga),
    unfollowedByYou: minus(ga, gb),
    mutualGained: minus(mb, ma),
    mutualLost: minus(ma, mb),
    newNonFollowBacks: minus(nb, na),
    resolvedNonFollowBacks: minus(na, nb),
  };
}

export function snapshotDate(s: Snapshot): number {
  return s.exportDate ?? s.uploadedAt;
}

export function sortSnapshots(list: Snapshot[]): Snapshot[] {
  return [...list].sort((a, b) => snapshotDate(a) - snapshotDate(b) || a.uploadedAt - b.uploadedAt);
}
