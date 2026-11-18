import { hash, rng } from './layout';

/**
 * Network Fingerprint: generative artwork computed from real network statistics.
 * Same numbers → same base artwork; “regenerate” explores variations of it.
 *
 *  • rings: one per slice of your audience, arc lengths = actual category shares
 *  • spikes: one per saved snapshot, length = follower change between snapshots
 *  • strands: a flow field seeded by your numbers; density follows mutual share
 */
export interface FingerprintStats {
  followers: number;
  following: number;
  mutual: number;
  notFollowingBack: number;
  needsReview: number;
  excluded: number;
  fans: number;
  series: number[];
  countries: number;
}

function noise2(seed: number) {
  const r = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => r() - 0.5);
  const grad = perm.map(() => r() * Math.PI * 2);
  const g = (x: number, y: number) => grad[(perm[(x & 255)] + y) & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const dot = (ix: number, iy: number) => {
      const a = g(xi + ix, yi + iy);
      return Math.cos(a) * (xf - ix) + Math.sin(a) * (yf - iy);
    };
    const u = fade(xf), v = fade(yf);
    const a = dot(0, 0) + u * (dot(1, 0) - dot(0, 0));
    const b = dot(0, 1) + u * (dot(1, 1) - dot(0, 1));
    return a + v * (b - a);
  };
}

export function fingerprintSeed(s: FingerprintStats, variant: number) {
  return hash(`${s.followers}|${s.following}|${s.mutual}|${s.notFollowingBack}|${s.fans}|${s.series.join(',')}|${variant}`);
}

export function drawFingerprint(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  s: FingerprintStats,
  variant: number,
  opts: { ink?: boolean; progress?: number; caption?: string } = {},
) {
  const ink = opts.ink ?? true;
  const p = opts.progress ?? 1;
  const fg = ink ? '255,255,255' : '0,0,0';
  const seed = fingerprintSeed(s, variant);
  const r = rng(seed);
  const cx = W / 2, cy = H * (H > W * 1.3 ? 0.44 : 0.48);
  const R = Math.min(W, H) * 0.34;
  const unit = Math.min(W, H) / 1000;

  ctx.save();
  ctx.fillStyle = ink ? '#000' : '#fff';
  ctx.fillRect(0, 0, W, H);

  // Strands: a flow field around the centre
  const field = noise2(seed);
  const mutualShare = s.following ? s.mutual / s.following : 0.3;
  const strands = Math.round((180 + mutualShare * 520) * p);
  ctx.lineCap = 'round';
  for (let i = 0; i < strands; i++) {
    const a = r() * Math.PI * 2;
    const rad = R * (0.35 + r() * 0.95);
    let x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 26 + Math.floor(r() * 30);
    for (let k = 0; k < steps; k++) {
      const ang = field((x - cx) / (R * 0.5), (y - cy) / (R * 0.5)) * Math.PI * 2.2 + Math.atan2(y - cy, x - cx) + Math.PI / 2;
      x += Math.cos(ang) * 6 * unit;
      y += Math.sin(ang) * 6 * unit;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${fg},${0.05 + r() * 0.12})`;
    ctx.lineWidth = (0.6 + r() * 1.2) * unit;
    ctx.stroke();
  }

  // Rings: category shares as arcs
  const parts = [s.mutual, s.notFollowingBack, s.needsReview, s.excluded, s.fans];
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const rings = 18 + (s.followers % 17);
  const shown = Math.ceil(rings * Math.min(1, p * 1.4));
  for (let j = 0; j < shown; j++) {
    const rr = R * (0.18 + (0.8 * j) / rings);
    const cat = (j + (seed % 5)) % 5;
    const share = parts[cat] / total;
    if (share <= 0) continue;
    const start = r() * Math.PI * 2 + j * 2.399963;
    const len = Math.max(0.02, share * Math.PI * 2);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, start, start + len);
    ctx.strokeStyle = `rgba(${fg},${cat === 0 ? 0.95 : 0.35 + 0.1 * (4 - cat)})`;
    ctx.lineWidth = (cat === 0 ? 2.4 : 1.2) * unit;
    ctx.stroke();
    if (cat === 0) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(start + len) * rr, cy + Math.sin(start + len) * rr, 3.2 * unit, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${fg})`;
      ctx.fill();
    }
  }

  // Spikes: change between snapshots
  const series = s.series.length > 1 ? s.series : [s.followers, s.followers];
  const deltas = series.slice(1).map((v, i) => v - series[i]);
  const maxD = Math.max(1, ...deltas.map(Math.abs));
  const spikes = Math.max(12, deltas.length * 12);
  for (let i = 0; i < spikes * p; i++) {
    const d = deltas[i % deltas.length] ?? 0;
    const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
    const len = R * (0.06 + 0.22 * (Math.abs(d) / maxD)) * (0.6 + r() * 0.4);
    const r0 = R * 1.06;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r0 + (d >= 0 ? len : len * 0.5)), cy + Math.sin(a) * (r0 + (d >= 0 ? len : len * 0.5)));
    ctx.strokeStyle = `rgba(${fg},${d >= 0 ? 0.7 : 0.3})`;
    ctx.lineWidth = 1 * unit;
    ctx.stroke();
  }

  // Core: you
  ctx.beginPath();
  ctx.arc(cx, cy, 9 * unit, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${fg})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 11 * unit, cy, 9 * unit, 0, Math.PI * 2);
  ctx.strokeStyle = `rgb(${fg})`;
  ctx.lineWidth = 1.4 * unit;
  ctx.stroke();

  // Caption
  ctx.fillStyle = `rgba(${fg},0.85)`;
  ctx.textAlign = 'center';
  ctx.font = `700 ${18 * unit}px "Helvetica Neue", Helvetica, Arial`;
  const word = 'F O L L O W L Y';
  ctx.fillText(word, W / 2, H - 70 * unit * (H > W * 1.3 ? 2.2 : 1));
  ctx.font = `400 ${13 * unit}px "Helvetica Neue", Helvetica, Arial`;
  ctx.fillStyle = `rgba(${fg},0.55)`;
  ctx.fillText(opts.caption ?? `${s.followers} · ${s.following} · ${Math.round(mutualShare * 100)}%`, W / 2, H - 44 * unit * (H > W * 1.3 ? 2.6 : 1));
  ctx.restore();
}
