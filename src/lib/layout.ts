import type { Account, Analysis } from './types';

/** Deterministic, stable layouts for the network visualizations (same account → same place). */

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A tiny seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Ring = 'mutual' | 'not-following-back' | 'needs-review' | 'excluded' | 'fans';

export const RING_ORDER: Ring[] = ['mutual', 'not-following-back', 'needs-review', 'excluded', 'fans'];

export const RING_LABEL: Record<Ring, string> = {
  mutual: 'Mutual',
  'not-following-back': 'Not following back',
  'needs-review': 'Needs review',
  excluded: 'Excluded',
  fans: 'You don’t follow',
};

export interface Node {
  account: Account;
  ring: Ring;
  /** 3D position */
  p3: [number, number, number];
  /** 2D position (z = 0) */
  p2: [number, number];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const SHELL: Record<Ring, { r: number; spread: number; mode: 'sphere' | 'orbit'; tilt: number }> = {
  mutual: { r: 38, spread: 7, mode: 'sphere', tilt: 0 },
  'not-following-back': { r: 72, spread: 5, mode: 'orbit', tilt: 0.42 },
  'needs-review': { r: 84, spread: 5, mode: 'orbit', tilt: 0.42 },
  excluded: { r: 108, spread: 4, mode: 'orbit', tilt: -0.9 },
  fans: { r: 132, spread: 12, mode: 'sphere', tilt: 0 },
};
const BAND: Record<Ring, [number, number]> = {
  mutual: [18, 52],
  'not-following-back': [60, 78],
  'needs-review': [80, 92],
  excluded: [96, 106],
  fans: [112, 150],
};

/** Place every account on its ring: spheres and tilted orbits in 3D, concentric bands in 2D. */
export function layoutNetwork(a: Analysis): Node[] {
  const groups: Record<Ring, Account[]> = {
    mutual: a.mutual,
    'not-following-back': a.notFollowingBack,
    'needs-review': a.needsReview,
    excluded: a.excluded,
    fans: a.fans,
  };
  const out: Node[] = [];
  for (const ring of RING_ORDER) {
    const list = [...groups[ring]].sort((x, y) => hash(x.username) - hash(y.username));
    const n = list.length;
    const cfg = SHELL[ring];
    list.forEach((account, i) => {
      const rand = rng(hash(account.username));
      const jitter = (rand() - 0.5) * 2;
      let p3: [number, number, number];
      if (cfg.mode === 'sphere') {
        const y = 1 - (2 * (i + 0.5)) / Math.max(1, n);
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const th = i * GOLDEN;
        const R = cfg.r + jitter * cfg.spread;
        p3 = [Math.cos(th) * rr * R, y * R, Math.sin(th) * rr * R];
      } else {
        const th = (i / Math.max(1, n)) * Math.PI * 2 + rand() * 0.05;
        const R = cfg.r + jitter * cfg.spread;
        const x = Math.cos(th) * R, z = Math.sin(th) * R, y = (rand() - 0.5) * cfg.spread * 1.6;
        // tilt the orbit around the x axis
        p3 = [x, y * Math.cos(cfg.tilt) - z * Math.sin(cfg.tilt), y * Math.sin(cfg.tilt) + z * Math.cos(cfg.tilt)];
      }
      const [b0, b1] = BAND[ring];
      const rad = b0 + Math.sqrt((i + 0.5) / Math.max(1, n)) * 0 + rand() * (b1 - b0);
      const ang = i * GOLDEN * 3 + rand() * 0.3;
      out.push({ account, ring, p3, p2: [Math.cos(ang) * rad, Math.sin(ang) * rad] });
    });
  }
  return out;
}
