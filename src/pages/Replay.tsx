import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, Segmented } from '../components/ui';
import { HEADER_APP } from '../components/Header';
import { attachPanZoom } from '../lib/panzoom';
import { hash, rng } from '../lib/layout';
import { diffSnapshots, snapshotDate, sortSnapshots } from '../lib/analysis';
import { knownUsernames, relOf, setsOf, type Rel } from '../lib/history';
import { fmtDate, fmtNumber, fmtSigned } from '../lib/format';

const SECONDS_PER_STEP = 3.2;
const easeInOut = (x: number) => x * x * (3 - 2 * x);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

/**
 * Social Replay: your network animated from snapshot to snapshot. Accounts that
 * appear between two exports fade in; those that leave fade out; new mutuals pulse.
 * Snapshots are periodic, so changes are shown between dates — never at an exact time.
 */
export default function Replay() {
  const { snapshots, meta } = useStore();
  const sorted = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<'0.5' | '1' | '2'>('1');
  const tRef = useRef(0);
  tRef.current = t;
  const n = sorted.length;

  const world = useMemo(() => {
    const users = knownUsernames(sorted);
    const pos = users.map((u) => {
      const r = rng(hash(u));
      const ang = r() * Math.PI * 2;
      const rad = 70 + Math.sqrt(r()) * 280;
      return [Math.cos(ang) * rad, Math.sin(ang) * rad] as const;
    });
    const rels: Rel[][] = sorted.map((s) => {
      const { followers, following } = setsOf(s);
      return users.map((u) => relOf(followers.has(u), following.has(u)));
    });
    return { users, pos, rels };
  }, [sorted]);

  const diffs = useMemo(() => sorted.slice(1).map((s, i) => diffSnapshots(sorted[i], s, meta)), [sorted, meta]);

  /* ── Playback clock ── */
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = tRef.current + (dt * Number(speed)) / SECONDS_PER_STEP;
      if (next >= n - 1) { setT(n - 1); setPlaying(false); return; }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n]);

  /* ── Drawing ── */
  const ctlRef = useRef<ReturnType<typeof attachPanZoom> | null>(null);
  const drawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const c = canvas.current;
    if (!c || !n) return;
    const ctx = c.getContext('2d')!;
    let queued = 0;
    const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; drawRef.current(); }); };
    ctlRef.current = attachPanZoom(c, { onChange: schedule, min: 0.4, max: 8 });
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      schedule();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    drawRef.current = () => {
      const v = ctlRef.current!.view;
      const W = c.clientWidth, H = c.clientHeight;
      const tt = tRef.current;
      const k = Math.min(n - 1, Math.floor(tt));
      const f = n > 1 ? easeInOut(Math.min(1, tt - k)) : 0;
      const A = world.rels[k], B = world.rels[Math.min(n - 1, k + 1)];
      const scale = Math.min(W, H) / 900;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + v.x, H / 2 + 30 + v.y);
      ctx.scale(v.k * scale, v.k * scale);
      const px = 1 / (v.k * scale);
      // Dot size follows density: lots of accounts → finer dots, so the galaxy never clumps.
      const area = Math.PI * (350 * scale * v.k) ** 2;
      const dot = Math.min(4.2, Math.max(1.1, Math.sqrt(area / Math.max(1, world.users.length)) * 0.3)) * px;
      for (let i = 0; i < world.users.length; i++) {
        const a = A[i], b = B[i];
        if (a === 'none' && b === 'none') continue;
        const [x, y] = world.pos[i];
        const draw = (rel: Rel, alpha: number, s = 1) => {
          if (rel === 'none' || alpha <= 0.01) return;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(x, y, (rel === 'fan' ? 0.8 : 1) * s * dot, 0, Math.PI * 2);
          if (rel === 'not-following-back') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3 * px; ctx.stroke(); }
          else { ctx.fillStyle = rel === 'mutual' ? '#fff' : '#8a8a8a'; ctx.fill(); }
        };
        if (a === b) draw(a, 1);
        else if (a === 'none') draw(b, f, Math.max(0.01, easeOutBack(f)));
        else if (b === 'none') draw(a, 1 - f, 1 + f * 0.6);
        else { draw(a, 1 - f); draw(b, f); }
        if (b === 'mutual' && a !== 'mutual' && f > 0 && f < 1) {
          ctx.globalAlpha = (1 - f) * 0.8;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1 * px;
          ctx.beginPath();
          ctx.arc(x, y, dot * (1.5 + f * 6), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = '600 8px "Helvetica Neue", Helvetica, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU', 0, 0.5);
      ctx.restore();
    };
    schedule();
    return () => { cancelAnimationFrame(queued); ro.disconnect(); ctlRef.current?.destroy(); ctlRef.current = null; };
  }, [world, n]);

  useEffect(() => { drawRef.current(); }, [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight') setT((x) => Math.min(n - 1, Math.floor(x) + 1));
      if (e.key === 'ArrowLeft') setT((x) => Math.max(0, Math.ceil(x) - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);

  if (!n) return <Container><EmptyData /></Container>;
  const k = Math.min(n - 1, Math.floor(t));
  const seg = diffs[Math.min(diffs.length - 1, k)];
  const cur = sorted[Math.round(t)] ?? sorted[0];
  const followersNow = Math.round(sorted[k].followers.length + ((sorted[Math.min(n - 1, k + 1)].followers.length - sorted[k].followers.length) * (t - k)));
  const togglePlay = () => { if (t >= n - 1) setT(0); setPlaying((p) => !p); };

  return (
    <div className="fixed inset-0 bg-ink text-paper" data-header-theme="dark">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Animated replay of your network" />

      <div className="pointer-events-none absolute left-4 sm:left-6" style={{ top: HEADER_APP + 16 }}>
        <p className="eyebrow text-paper/50">Social Replay</p>
        <p className="display mt-2 text-4xl sm:text-6xl">{fmtDate(snapshotDate(cur), { month: 'short', day: 'numeric' })}</p>
        <p className="mt-1 text-sm text-paper/60">{fmtDate(snapshotDate(cur), { year: 'numeric' })} · {fmtNumber(followersNow)} followers</p>
      </div>

      {n < 2 ? (
        <div className="absolute inset-x-4 bottom-8 flex justify-center">
          <div className="glass-dark max-w-sm rounded-[26px] p-6 text-center">
            <p className="headline text-lg">One snapshot so far</p>
            <p className="mt-2 text-sm font-light text-paper/60">Upload another export later to watch your network change.</p>
            <Link to="/analyze" className="btn btn-inverse btn-sm mt-5">Upload another</Link>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-center sm:inset-x-6">
          <div className="glass-dark glass-thick w-full max-w-3xl rounded-[30px] p-4 sm:p-5">
            {seg && (
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-paper/70">
                <span>{fmtDate(snapshotDate(seg.from), { month: 'short', day: 'numeric' })} → {fmtDate(snapshotDate(seg.to), { month: 'short', day: 'numeric' })}</span>
                <span className="text-paper">{fmtSigned(seg.newFollowers.length)} followers</span>
                <span>{fmtSigned(-seg.lostFollowers.length)} lost</span>
                <span>{fmtSigned(seg.newlyFollowed.length)} followed</span>
                <span>{fmtSigned(seg.mutualGained.length)} mutual</span>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative mx-1 flex-1 sm:order-2">
                <input
                  type="range"
                  min={0}
                  max={n - 1}
                  step={0.001}
                  value={t}
                  onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
                  aria-label="Timeline"
                  className="replay-range w-full"
                />
                <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-between">
                  {sorted.map((s) => <span key={s.id} className="h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-paper/50" />)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 sm:contents">
                <div className="flex items-center gap-1 sm:order-1 sm:gap-2">
                  <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:scale-90" onClick={() => { setPlaying(false); setT(Math.max(0, Math.ceil(t) - 1)); }} aria-label="Previous snapshot"><SkipBack size={16} /></button>
                  <button className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink transition-transform duration-300 [transition-timing-function:var(--ease-spring)] active:scale-90" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause size={18} fill="#000" /> : <Play size={18} fill="#000" className="ml-0.5" />}
                  </button>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:scale-90" onClick={() => { setPlaying(false); setT(Math.min(n - 1, Math.floor(t) + 1)); }} aria-label="Next snapshot"><SkipForward size={16} /></button>
                </div>
                <div className="sm:order-3">
                  <Segmented dark label="Speed" value={speed} onChange={setSpeed} options={[{ value: '0.5', label: '½×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }]} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
