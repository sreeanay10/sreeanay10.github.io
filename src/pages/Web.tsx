import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, History, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Container, EmptyData } from '../components/ui';
import { HEADER_APP } from '../components/Header';
import { attachPanZoom } from '../lib/panzoom';
import { hash, rng } from '../lib/layout';
import { fmtCompact, fmtNumber } from '../lib/format';
import { profileUrl } from '../lib/username';
import type { Account } from '../lib/types';

type Side = 'mutual' | 'following' | 'followers';
const SIDE_LABEL: Record<Side, string> = { mutual: 'Mutual', following: 'You follow', followers: 'Follow you' };
const SECTOR: Record<Side, [number, number]> = {
  mutual: [-0.86 * Math.PI, -0.14 * Math.PI],
  following: [-0.04 * Math.PI, 0.46 * Math.PI],
  followers: [0.54 * Math.PI, 1.04 * Math.PI],
};

interface WNode { a: Account; side: Side; x: number; y: number; delay: number }

/** Keep the web centred in the space below the floating header. */
const OFFSET_Y = 44;

/**
 * Connection Web: you in the middle, every real connection drawn as a line.
 * Mutual = solid, you → them = fine line, them → you = dashed. We only draw the
 * relationships your export proves; links between other accounts are unknown,
 * so they're never drawn.
 */
export default function Web() {
  const { analysis } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState<Set<Side>>(() => new Set());
  const [selected, setSelected] = useState<WNode | null>(null);
  const [q, setQ] = useState('');
  const ctl = useRef<ReturnType<typeof attachPanZoom> | null>(null);
  const state = useRef({ hidden, selected: null as WNode | null, hover: null as WNode | null });
  state.current.hidden = hidden;
  state.current.selected = selected;

  const nodes = useMemo<WNode[]>(() => {
    if (!analysis) return [];
    const groups: [Side, Account[]][] = [
      ['mutual', analysis.mutual],
      ['following', [...analysis.notFollowingBack, ...analysis.needsReview, ...analysis.excluded]],
      ['followers', analysis.fans],
    ];
    const out: WNode[] = [];
    for (const [side, list] of groups) {
      const [a0, a1] = SECTOR[side];
      const sorted = [...list].sort((x, y) => hash(x.username) - hash(y.username));
      sorted.forEach((a, i) => {
        const r = rng(hash(a.username));
        const ang = a0 + (a1 - a0) * ((i * 0.6180339 + r() * 0.15) % 1);
        const rad = 105 + Math.sqrt(r()) * 190;
        out.push({ a, side, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, delay: Math.min(0.9, (i / Math.max(1, sorted.length)) * 0.9) });
      });
    }
    return out;
  }, [analysis]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !nodes.length) return;
    const ctx = c.getContext('2d')!;
    let raf = 0, dirty = true, start = performance.now();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) start -= 5000;
    const kick = () => { dirty = true; };

    const toScreen = (x: number, y: number) => {
      const v = ctl.current!.view;
      return { x: c.clientWidth / 2 + v.x + x * v.k, y: c.clientHeight / 2 + OFFSET_Y + v.y + y * v.k };
    };
    const pick = (cx: number, cy: number) => {
      const r = c.getBoundingClientRect();
      let best: WNode | null = null, bestD = 14 * 14;
      for (const n of nodes) {
        if (state.current.hidden.has(n.side)) continue;
        const s = toScreen(n.x, n.y);
        const d = (s.x - (cx - r.left)) ** 2 + (s.y - (cy - r.top)) ** 2;
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    };
    ctl.current = attachPanZoom(c, { onChange: kick, onTap: (x, y) => setSelected(pick(x, y)), min: 0.35, max: 10 });
    // Fit the whole web on narrow screens.
    const fit = Math.min(1, (c.clientWidth - 24) / 760, (c.clientHeight - 260) / 700);
    if (fit < 1) ctl.current.fit(fit);

    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const h = pick(e.clientX, e.clientY);
      if (h !== state.current.hover) { state.current.hover = h; c.style.cursor = h ? 'pointer' : 'grab'; kick(); }
    };
    c.addEventListener('pointermove', onHover);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      kick();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const intro = t < 2.2;
      if (dirty || intro) {
        dirty = false;
        const v = ctl.current!.view;
        const W = c.clientWidth, H = c.clientHeight;
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2 + v.x, H / 2 + OFFSET_Y + v.y);
        ctx.scale(v.k, v.k);
        const lw = 1 / v.k;
        // Finer nodes for big networks so sectors stay legible.
        const dot = Math.min(3.4, Math.max(1.4, 110 / Math.sqrt(Math.max(1, nodes.length))));
        const { hidden: hid, hover, selected: sel } = state.current;
        const focus = hover ?? sel;
        for (const n of nodes) {
          if (hid.has(n.side)) continue;
          const p = Math.min(1, Math.max(0, (t - n.delay * 0.9) / 0.9));
          const e = 1 - Math.pow(1 - p, 3);
          const x = n.x * e, y = n.y * e;
          const on = focus === n;
          ctx.globalAlpha = on ? 0.9 : n.side === 'mutual' ? 0.16 : 0.09;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = (on ? 1.6 : 1) * lw;
          ctx.setLineDash(n.side === 'followers' ? [4 * lw, 4 * lw] : []);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const n of nodes) {
          if (hid.has(n.side)) continue;
          const p = Math.min(1, Math.max(0, (t - n.delay * 0.9) / 0.9));
          const e = 1 - Math.pow(1 - p, 3);
          const x = n.x * e, y = n.y * e;
          const on = focus === n;
          const r = (on ? 5.5 : (n.side === 'followers' ? 0.8 : 1) * dot) * Math.max(0.8, 1 / Math.sqrt(v.k));
          ctx.globalAlpha = n.a.category === 'needs-review' ? 0.55 : 1;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          if (n.side === 'following' && !on) {
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.lineWidth = 1.3 * lw;
            ctx.strokeStyle = '#000';
            ctx.stroke();
          } else {
            ctx.fillStyle = n.side === 'followers' && !on ? '#8A8A8A' : '#000';
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        // You
        ctx.beginPath();
        ctx.arc(0, 0, 18 * Math.max(0.7, 1 / Math.sqrt(v.k)), 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${9 * Math.max(0.7, 1 / Math.sqrt(v.k))}px "Helvetica Neue", Helvetica, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YOU', 0, 0.5);
        // Sector labels
        ctx.fillStyle = '#767676';
        ctx.font = `500 ${11 / v.k}px "Helvetica Neue", Helvetica, Arial`;
        (Object.keys(SECTOR) as Side[]).forEach((s) => {
          if (hid.has(s)) return;
          const mid = (SECTOR[s][0] + SECTOR[s][1]) / 2;
          ctx.fillText(SIDE_LABEL[s].toUpperCase(), Math.cos(mid) * 330, Math.sin(mid) * 330);
        });
        // Hover label
        if (hover) {
          ctx.font = `500 ${12 / v.k}px "Helvetica Neue", Helvetica, Arial`;
          ctx.fillStyle = '#000';
          ctx.textAlign = 'left';
          ctx.fillText(`@${hover.a.username}`, hover.x + 9 / v.k, hover.y - 9 / v.k);
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener('pointermove', onHover); ctl.current?.destroy(); ctl.current = null; };
  }, [nodes]);

  // Redraw when filters/selection change
  useEffect(() => { ctl.current?.zoomBy(1); }, [hidden, selected]);

  const counts = useMemo(() => {
    const c: Record<Side, number> = { mutual: 0, following: 0, followers: 0 };
    nodes.forEach((n) => c[n.side]++);
    return c;
  }, [nodes]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, '');
    if (!term) return [];
    return nodes.filter((n) => n.a.username.includes(term))
      .sort((x, y) => Number(y.a.username === term) - Number(x.a.username === term) || x.a.username.localeCompare(y.a.username))
      .slice(0, 7);
  }, [q, nodes]);

  if (!analysis) return <Container><EmptyData /></Container>;
  const top = HEADER_APP + 8;
  const choose = (n: WNode) => { setSelected(n); setQ(''); ctl.current?.focus(n.x, n.y, 2.6); };

  return (
    <div className="fixed inset-0 bg-paper">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Connection web of your account" />

      <div className="pointer-events-none absolute inset-x-0 flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6" style={{ top }}>
        <div className="pointer-events-auto relative w-full max-w-xs">
          <label className="glass relative flex items-center rounded-full">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) choose(matches[0]); }} placeholder="Find an account" aria-label="Find an account" className="h-11 w-full rounded-full bg-transparent pl-10 pr-4 text-sm font-light placeholder:text-muted focus:outline-none" autoCapitalize="none" spellCheck={false} />
          </label>
          {matches.length > 0 && (
            <ul className="glass glass-thick absolute inset-x-0 top-full mt-2 rounded-[20px] p-1.5" style={{ animation: 'rise 380ms var(--ease-spring) backwards' }}>
              {matches.map((n) => (
                <li key={n.a.username}><button className="w-full rounded-[14px] px-3 py-2 text-left text-sm hover:bg-black/5" onClick={() => choose(n)}>@{n.a.username}</button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass glass-thick pointer-events-auto flex rounded-full p-1">
          <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 active:scale-90" onClick={() => ctl.current?.zoomBy(1.6)} aria-label="Zoom in"><Plus size={16} strokeWidth={1.5} /></button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 active:scale-90" onClick={() => ctl.current?.zoomBy(1 / 1.6)} aria-label="Zoom out"><Minus size={16} strokeWidth={1.5} /></button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 active:scale-90" onClick={() => ctl.current?.reset()} aria-label="Reset view"><RotateCcw size={14} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:left-6 sm:right-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {(Object.keys(SIDE_LABEL) as Side[]).map((s) => {
          const off = hidden.has(s);
          return (
            <button
              key={s}
              onClick={() => setHidden((h) => { const x = new Set(h); if (x.has(s)) x.delete(s); else x.add(s); return x; })}
              className={`glass flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs transition-[opacity,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-95 ${off ? 'opacity-40' : ''}`}
              aria-pressed={!off}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${s === 'following' ? 'ring-[1.5px] ring-ink' : s === 'mutual' ? 'bg-ink' : 'bg-stone'}`} />
              {SIDE_LABEL[s]} <span className="tabular-nums text-muted">{fmtCompact(counts[s])}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <aside
          key={selected.a.username}
          className="glass glass-thick absolute inset-x-3 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)] rounded-[26px] p-5 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[var(--panel-top)] sm:w-80"
          style={{ ['--panel-top' as string]: `${top + 56}px`, animation: 'rise 520ms var(--ease-spring) backwards' }}
        >
          <div className="flex items-start justify-between">
            <Avatar name={selected.a.username} size={44} />
            <button className="icon-btn h-8 w-8" onClick={() => setSelected(null)} aria-label="Close"><X size={15} /></button>
          </div>
          <p className="mt-4 break-all text-lg font-medium">@{selected.a.username}</p>
          <p className="label mt-2 text-[0.625rem] text-muted">
            {selected.side === 'mutual' ? 'You follow each other' : selected.side === 'following' ? 'You follow them · they don’t follow you' : 'They follow you · you don’t follow them'}
          </p>
          {selected.a.meta?.followerCount !== undefined && <p className="mt-2 text-sm">{fmtNumber(selected.a.meta.followerCount)} followers</p>}
          <div className="mt-5 flex gap-2">
            <a href={profileUrl(selected.a.username)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Profile <ArrowUpRight size={13} /></a>
            <Link to={`/watchlist?u=${encodeURIComponent(selected.a.username)}`} className="btn btn-outline btn-sm"><History size={13} /> History</Link>
          </div>
        </aside>
      )}
    </div>
  );
}
