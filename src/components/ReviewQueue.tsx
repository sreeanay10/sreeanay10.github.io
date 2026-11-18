import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Undo2, X } from 'lucide-react';
import { useStore, type ManualVerdict } from '../store';
import { profileUrl } from '../lib/username';
import { fmtNumber, fmtUnixDate } from '../lib/format';
import { project, rubberband, Spring, VelocityTracker } from '../lib/spring';
import { burst } from '../lib/burst';
import { Avatar, useCoarsePointer } from './ui';
import { Odometer } from './motion';
import type { Account } from '../lib/types';

type Decision = Exclude<ManualVerdict, 'unknown'> | 'skip';
type Side = 'right' | 'left' | 'up';

const ACTIONS: { key: string; v: Decision; label: string }[] = [
  { key: '1', v: 'regular', label: 'Regular' },
  { key: '2', v: 'verified', label: 'Verified' },
  { key: '3', v: 'over-threshold', label: '100K+' },
  { key: '→', v: 'skip', label: 'Skip' },
];

const sideOf = (v: Decision): Side => (v === 'regular' ? 'right' : v === 'skip' ? 'left' : 'up');
const tick = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };

/**
 * Needs Review as a deck of cards. Throw a card right for “regular”, left to skip;
 * verified / 100K+ send it flying up. Cards track the finger, carry their momentum,
 * can be caught mid-throw, and come back from the side they left when you undo.
 */
export function ReviewQueue({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const { setVerdict } = useStore();
  const coarse = useCoarsePointer();
  const [queue] = useState(() => accounts.map((a) => ({ u: a.username, t: a.followedAt })));
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<{ index: number; v: Decision }[]>([]);
  const [returning, setReturning] = useState<{ index: number; side: Side } | null>(null);
  const done = i >= queue.length;

  const layer = useRef<HTMLDivElement>(null);
  const stamps = { regular: useRef<HTMLSpanElement>(null), skip: useRef<HTMLSpanElement>(null), aside: useRef<HTMLSpanElement>(null) };
  const doneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; baseX: number; baseY: number; engaged: boolean } | null>(null);
  const tracker = useRef(new VelocityTracker());
  const trackerY = useRef(new VelocityTracker());
  const flying = useRef(false);
  const armed = useRef(0);

  const threshold = () => Math.min(window.innerWidth * 0.28, 180);

  const springs = useMemo(() => {
    const s = {} as { x: Spring; y: Spring };
    const apply = () => {
      const el = layer.current;
      if (!el) return;
      const x = s.x.value, y = s.y.value;
      el.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0) rotate(${(x / Math.max(320, innerWidth)) * 14}deg)` : '';
      const t = Math.min(1, Math.abs(x) / threshold());
      const set = (ref: React.RefObject<HTMLSpanElement>, k: number) => {
        if (!ref.current) return;
        ref.current.style.opacity = String(k);
        ref.current.style.scale = String(1.5 - 0.5 * k);
      };
      if (!flying.current) {
        set(stamps.regular, x > 0 ? t : 0);
        set(stamps.skip, x < 0 ? t : 0);
      }
    };
    s.x = new Spring(0, apply);
    s.y = new Spring(0, apply);
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showStamp = (v: Decision) => {
    const map = { regular: stamps.regular, skip: stamps.skip, verified: stamps.aside, 'over-threshold': stamps.aside };
    const el = map[v].current;
    if (!el) return;
    if (map[v] === stamps.aside) el.textContent = v === 'verified' ? 'Verified' : '100K+';
    el.style.opacity = '1';
    el.style.scale = '1';
  };

  const resetCard = () => {
    springs.x.set(0, false);
    springs.y.set(0, false);
    flying.current = false;
  };

  const commit = useCallback((index: number, v: Decision) => {
    if (v !== 'skip') setVerdict([queue[index].u], v);
    setHistory((h) => [...h, { index, v }]);
    setReturning(null);
    setI(index + 1);
  }, [queue, setVerdict]);

  /** Throw the top card off-screen, then record the decision. */
  const throwCard = useCallback((v: Decision, velocity = 0, velocityY = 0) => {
    if (done || flying.current) return;
    flying.current = true;
    showStamp(v);
    const index = i;
    const side = sideOf(v);
    const rest = () => { resetCard(); commit(index, v); };
    if (side === 'up') {
      springs.x.to(springs.x.value * 1.4, { response: 0.4, dampingRatio: 1, velocity: 0 });
      springs.y.to(-(innerHeight + 320), { response: 0.36, dampingRatio: 1, velocity: Math.min(velocityY, -1400) }, rest);
    } else {
      const sign = side === 'right' ? 1 : -1;
      springs.x.to(sign * (innerWidth + 320), { response: 0.36, dampingRatio: 1, velocity: sign * Math.max(Math.abs(velocity), 1100) }, rest);
    }
    if (v === 'regular') {
      const r = layer.current?.getBoundingClientRect();
      if (r) burst(r.right - 20, r.top + r.height / 2, { count: 18, power: 0.6, angle: 0, spread: Math.PI * 1.2 });
    }
    tick();
  }, [done, i, commit, springs]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || flying.current) return;
    resetCard();
    if (last.v !== 'skip') setVerdict([queue[last.index].u], 'unknown');
    setHistory((h) => h.slice(0, -1));
    setReturning({ index: last.index, side: sideOf(last.v) });
    setI(last.index);
  }, [history, queue, setVerdict]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Gesture ─────────────────────────────────────────────────────────── */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (done || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (flying.current) { springs.x.stop(); springs.y.stop(); flying.current = false; } // caught mid-throw
    const moving = springs.x.value !== 0 || springs.y.value !== 0;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: springs.x.value, baseY: springs.y.value, engaged: moving };
    if (moving) e.currentTarget.setPointerCapture(e.pointerId);
    armed.current = 0;
    tracker.current.reset();
    trackerY.current.reset();
    tracker.current.add(springs.x.value);
    trackerY.current.add(springs.y.value);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.engaged) {
      if (Math.hypot(dx, dy) < 10) return; // still a tap (e.g. the profile link)
      d.engaged = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const x = d.baseX + dx;
    const y = rubberband(d.baseY + dy, innerHeight * 0.5, 0.4);
    springs.x.set(x);
    springs.y.set(y);
    tracker.current.add(x);
    trackerY.current.add(y);
    const zone = x > threshold() ? 1 : x < -threshold() ? -1 : 0;
    if (zone !== armed.current) { if (zone) tick(); armed.current = zone; }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.engaged) return;
    const v = tracker.current.velocity();
    const projected = springs.x.value + project(v);
    if (projected > threshold()) throwCard('regular', v);
    else if (projected < -threshold()) throwCard('skip', v);
    else {
      springs.x.to(0, { response: 0.34, dampingRatio: 0.7, velocity: v }); // a little wobble on the way back
      springs.y.to(0, { response: 0.34, dampingRatio: 0.7, velocity: trackerY.current.velocity() });
    }
  };

  /* ── Keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        return;
      }
      if (e.key === 'Escape') onClose();
      else if (e.key === '1') throwCard('regular');
      else if (e.key === '2') throwCard('verified');
      else if (e.key === '3') throwCard('over-threshold');
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 's') throwCard('skip');
      else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'u') undo();
      else if (e.key.toLowerCase() === 'o' && queue[i]) window.open(profileUrl(queue[i].u), '_blank', 'noopener,noreferrer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [throwCard, undo, onClose, queue, i]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; springs.x.stop(); springs.y.stop(); };
  }, [springs]);

  // The finish line deserves a little celebration.
  useEffect(() => {
    if (!done || !history.length) return;
    const t = setTimeout(() => {
      const r = doneRef.current?.getBoundingClientRect();
      burst(innerWidth / 2, r ? r.top + 40 : innerHeight / 2, { count: 70, power: 1.15 });
    }, 250);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewed = history.filter((h) => h.v !== 'skip').length;
  const deck = queue.slice(i, i + 3).map((item, depth) => ({ item, depth, index: i + depth })).reverse();

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col bg-paper fade-in" role="dialog" aria-modal="true" aria-label="Review accounts">
      <div className="h-[2px] bg-line" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="h-full bg-ink transition-[width] duration-500 ease-sheet" style={{ width: `${queue.length ? (i / queue.length) * 100 : 100}%` }} />
      </div>
      <div className="flex items-center justify-between px-5 py-3 sm:px-10 sm:py-4">
        <p className="eyebrow tabular-nums text-muted" aria-live="polite">
          {done ? 'Done' : `${fmtNumber(i + 1)} / ${fmtNumber(queue.length)}`}
        </p>
        <div className="flex items-center gap-1">
          <button className="icon-btn disabled:opacity-30" onClick={undo} disabled={!history.length} aria-label="Undo">
            <Undo2 size={18} strokeWidth={1.5} />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close review">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden px-5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-cursor={done ? undefined : 'Drag'}
      >
        {done ? (
          <div ref={doneRef} className="page-enter text-center">
            <h2 className="display text-5xl sm:text-7xl">All caught up.</h2>
            <p className="numeral mt-8 text-7xl"><Odometer id={`review-done-${history.length}`} value={String(reviewed)} /></p>
            <p className="eyebrow mt-3 text-muted">{reviewed === 1 ? 'account confirmed' : 'accounts confirmed'}</p>
            <button className="btn btn-primary mt-10" onClick={onClose}>See results</button>
          </div>
        ) : (
          <div className="relative grid w-[min(92vw,34rem)] place-items-center">
            {deck.map(({ item, depth, index }) => {
              const top = depth === 0;
              const back = returning && returning.index === index ? returning.side : null;
              return (
                <div
                  key={index}
                  className="col-start-1 row-start-1 w-full"
                  style={{
                    transform: top ? 'none' : `translate3d(0, ${depth * 16}px, 0) scale(${1 - depth * 0.05})`,
                    opacity: top ? 1 : 1 - depth * 0.3,
                    transition: 'transform 520ms var(--ease-sheet), opacity 400ms var(--ease-out)',
                    zIndex: 10 - depth,
                    animation: back ? `card-back-${back} 620ms var(--ease-sheet) backwards` : top && index === 0 && !history.length ? 'rise 640ms var(--ease-sheet) backwards' : undefined,
                  }}
                  aria-hidden={!top}
                >
                  <div
                    ref={top ? layer : undefined}
                    className="relative rounded-[32px] bg-paper px-6 py-12 text-center shadow-[inset_0_0_0_1px_#EAEAEA,inset_0_1px_0_#fff,0_40px_80px_-40px_rgba(0,0,0,0.35)] sm:px-10 sm:py-16"
                    style={{ willChange: top ? 'transform' : undefined }}
                  >
                    {top && (
                      <>
                        <span ref={stamps.regular} className="stamp label absolute left-6 top-6 -rotate-12 rounded-full bg-ink px-4 py-2 text-[0.6875rem] text-paper opacity-0">Regular</span>
                        <span ref={stamps.skip} className="stamp label absolute right-6 top-6 rotate-12 rounded-full border-2 border-ink px-4 py-1.5 text-[0.6875rem] opacity-0">Skip</span>
                        <span ref={stamps.aside} className="stamp label absolute left-1/2 top-6 -translate-x-1/2 rounded-full border-2 border-ink bg-paper px-4 py-1.5 text-[0.6875rem] opacity-0">Set aside</span>
                      </>
                    )}
                    <div className="flex justify-center"><Avatar name={item.u} size={56} /></div>
                    <h2 className="display mt-6 break-all text-[2rem] leading-none sm:text-5xl">@{item.u}</h2>
                    <p className="eyebrow mt-4 text-muted">{item.t ? `Followed ${fmtUnixDate(item.t)}` : 'Not following you back'}</p>
                    {top && (
                      <a
                        href={profileUrl(item.u)}
                        target="_blank"
                        rel="noopener noreferrer"
                        draggable={false}
                        className="label link-underline mt-8 inline-flex items-center gap-1.5 text-[0.6875rem]"
                      >
                        Open profile <ArrowUpRight size={14} strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!done && (
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-10 sm:pb-8">
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
            {ACTIONS.map((a, idx) => (
              <button
                key={a.v}
                onClick={() => throwCard(a.v)}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-full transition-[background-color,color,transform] duration-500 [transition-timing-function:var(--ease-spring)] active:scale-90 ${
                  idx === 0 ? 'bg-ink text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-12px_rgba(0,0,0,0.55)]' : 'glass text-ink'
                }`}
              >
                <span className="label text-[0.625rem]">{a.label}</span>
                {!coarse && <kbd className="font-sans text-[0.625rem] opacity-40">{a.key}</kbd>}
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-[0.6875rem] text-muted">
            {coarse ? 'Swipe right for regular · left to skip' : 'Throw the card — or press 1 2 3 →'}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
