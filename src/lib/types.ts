/** A single relationship entry as stored in a snapshot. Kept deliberately minimal. */
export interface Entry {
  /** Normalized (lowercase) Instagram username. */
  u: string;
  /** Unix timestamp (seconds) from the export, when present. */
  t?: number;
}

export interface Snapshot {
  id: string;
  /** Optional label and note from the Memory Vault. */
  name?: string;
  note?: string;
  /** Data health check captured at import. */
  health?: import('./health').HealthReport;
  /** When the user uploaded the export into FOLLOWLY (ms). */
  uploadedAt: number;
  /** Date the export was generated, if it could be determined (ms). */
  exportDate: number | null;
  /** The account owner's username, if present in the export. */
  owner: string | null;
  source: 'zip' | 'files';
  fileName: string;
  followers: Entry[];
  following: Entry[];
}

export interface ParseResult {
  followers: Entry[];
  following: Entry[];
  owner: string | null;
  exportDate: number | null;
  filesUsed: string[];
  warnings: string[];
  health: import('./health').HealthReport;
}

/** A user-made group of accounts: a Museum collection or a social circle. */
export interface Group {
  id: string;
  name: string;
  kind: 'collection' | 'circle';
  members: string[];
  createdAt: number;
}

/** Account metadata. Every field is optional: unknown means unknown, never assumed. */
export interface AccountMeta {
  followerCount?: number;
  verified?: boolean;
  displayName?: string;
  /** The user personally confirmed this is a regular (non-verified, ≤50K) account. */
  confirmedRegular?: boolean;
  /** The user personally confirmed this account has more than 50,000 followers (exact count unknown). */
  confirmedOverThreshold?: boolean;
  /**
   * ISO 3166-1 alpha-2 country, only ever from a location someone shared or the user entered.
   * Never inferred from a username or profile link. Country-level only: no cities or addresses.
   */
  country?: string;
  source: string;
  updatedAt: number;
}

export type MetaMap = Record<string, AccountMeta>;

export type Category = 'not-following-back' | 'mutual' | 'excluded' | 'needs-review' | 'fans';

export type ExclusionReason = 'verified' | 'over-threshold';

export interface Account {
  username: string;
  href: string;
  /** When the user followed this account (seconds), if known. */
  followedAt?: number;
  /** When this account followed the user (seconds), if known. */
  followerSince?: number;
  meta?: AccountMeta;
  category: Category;
  reasons: ExclusionReason[];
}

export interface Analysis {
  snapshot: Snapshot;
  followersCount: number;
  followingCount: number;
  mutual: Account[];
  notFollowingBack: Account[];
  excluded: Account[];
  needsReview: Account[];
  /** Accounts that follow the user but the user does not follow. */
  fans: Account[];
  /** mutual / following, 0–100. null when following is empty. */
  followBackRate: number | null;
}

export interface SnapshotDiff {
  from: Snapshot;
  to: Snapshot;
  newFollowers: string[];
  lostFollowers: string[];
  newlyFollowed: string[];
  unfollowedByYou: string[];
  mutualGained: string[];
  mutualLost: string[];
  newNonFollowBacks: string[];
  resolvedNonFollowBacks: string[];
}

export interface Settings {
  historyEnabled: boolean;
  /** Follower World Map and country fields. Off hides all geographic analytics. */
  geoEnabled: boolean;
}
