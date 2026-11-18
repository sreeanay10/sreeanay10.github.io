import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { clamp, project, rubberband, Spring, VelocityTracker } from '../lib/spring';
import { useLiquidIndicator } from './liquid';

/* ── Brand mark: following (filled) overlapped by followers (outline) ───── */
export function Mark({ size = 18, inverse = false }: { size?: number; inverse?: boolean }) {
  const c = inverse ? '#fff' : '#000';
  return (
    <svg width={size * 1.55} height={size} viewBox="0 0 31 20" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8.6" fill={c} style={{ transition: 'fill 300ms' }} />
      <circle cx="21" cy="10" r="8.6" fill="none" stroke={c} strokeWidth="1.4" style={{ transition: 'stroke 300ms' }} />
    </svg>
  );
}

export function Wordmark({ inverse = false, className = '' }: { inverse?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Mark inverse={inverse} size={14} />
      <span
        className="text-[0.8125rem] font-bold uppercase transition-colors duration-300"
        style={{ letterSpacing: '0.38em', marginRight: '-0.38em', color: inverse ? '#fff' : '#000' }}
      >
        Followly
      </span>
    </span>
  );
}

/* ── Brand loader: the outline ring drifts in and out of overlap ────────── */
export function Loader({ label }: { label?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-5" role="status" aria-live="polite">
      <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true">
        <circle cx="14" cy="11" r="9" fill="#000" />
        <circle cx="30" cy="11" r="9" fill="none" stroke="#000" strokeWidth="1.3" className="loader-ring" />
      </svg>
      <span className={label ? 'eyebrow text-muted' : 'sr-only'}>{label ?? 'Loading'}</span>
    </span>
  );
}

/* ── Environment hooks ─────────────────────────────────────────────────── */
export function useCoarsePointer(): boolean {
  const [coarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  return coarse;
}

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/* ── Scroll reveal ─────────────────────────────────────────────────────── */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = [root, ...root.querySelectorAll<HTMLElement>('[data-reveal]')].filter((e) => e.hasAttribute('data-reveal'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

/* ── Animated number ───────────────────────────────────────────────────────
 * Always animates from the value currently on screen. With an `id`, the last
 * shown value survives navigation, so revisiting a page doesn't replay the count. */
const shownNumbers = new Map<string, number>();

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-US'), duration = 1100, id }: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  id?: string;
}) {
  const initial = id !== undefined ? shownNumbers.get(id) ?? 0 : 0;
  const [shown, setShown] = useState(initial);
  const current = useRef(initial);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = current.current;
    if (reduce || from === value) {
      current.current = value;
      setShown(value);
      if (id !== undefined) shownNumbers.set(id, value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = from + (value - from) * eased;
      current.current = v;
      if (id !== undefined) shownNumbers.set(id, v);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, id]);
  return <span>{format(shown)}</span>;
}

/* ── Monogram avatar (exports contain no pictures; we never fetch them) ─── */
export function Avatar({ name, size = 40, flip = false }: { name: string; size?: number; flip?: boolean }) {
  const letter = (name.replace(/[^a-z0-9]/gi, '')[0] ?? '·').toUpperCase();
  const face = (
    <span
      className="flip-face border border-line bg-mist text-graphite"
      style={{ fontSize: size * 0.34, fontWeight: 400, letterSpacing: '0.04em' }}
    >
      {letter}
    </span>
  );
  if (!flip) {
    return (
      <span aria-hidden="true" className="relative inline-flex shrink-0" style={{ width: size, height: size }}>{face}</span>
    );
  }
  // On hover the monogram flips over to reveal an “open” arrow.
  return (
    <span aria-hidden="true" className="flip relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="flip-inner">
        {face}
        <span className="flip-face flip-back">
          <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </span>
      </span>
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Verified" role="img" className="inline-block shrink-0">
      <path fill="#000" d="M12 1.5 14.6 3.4l3.2-.2 1 3 2.7 1.8-.9 3.1.9 3.1-2.7 1.8-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3L2.5 16l.9-3.1-.9-3.1 2.7-1.8 1-3 3.2.2z" />
      <path d="m8 12.3 2.6 2.6L16.2 9.3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Compact select: shows only the chosen value, native picker underneath ── */
export function Select<T extends string>({ value, onChange, options, label, prefix }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  prefix?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <label className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-black/[0.045] px-3.5 text-ink transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/[0.08] active:scale-95 has-[select:focus-visible]:outline has-[select:focus-visible]:outline-[1.5px] has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ink">
      <span className="label whitespace-nowrap text-[0.6875rem]">
        {prefix && <span className="mr-2 hidden text-muted sm:inline">{prefix}</span>}
        {current}
      </span>
      <svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true" className="shrink-0">
        <path stroke="currentColor" strokeWidth="1.2" d="m1 1 4 4 4-4" />
      </svg>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
export function Toaster() {
  const { toastMessage } = useStore();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toastMessage) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [toastMessage]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="glass-dark rounded-full px-5 py-3 text-paper label text-[0.6875rem]"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(16px) scale(0.85)',
          transition: 'opacity 300ms var(--ease-out), transform 600ms var(--ease-spring)',
        }}
      >
        {toastMessage?.text}
      </div>
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────────────
 * Phones: a bottom sheet that rises from the edge and can be dragged down to
 * dismiss — it follows the finger 1:1, resists upward pulls, and a flick is
 * projected forward so a quick downward throw closes it. Larger screens: a
 * centred panel. Either way it can be interrupted at any moment. */
export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startY: number; base: number; h: number } | null>(null);
  const tracker = useRef(new VelocityTracker());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const spring = useMemo(
    () =>
      new Spring(0, (y) => {
        const el = layer.current;
        if (!el) return;
        el.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
        if (dim.current) dim.current.style.opacity = String(clamp(1 - y / Math.max(1, el.offsetHeight), 0, 1));
      }),
    [],
  );

  useEffect(() => {
    if (open) {
      spring.set(0);
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 520);
    return () => clearTimeout(t);
  }, [open, spring]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    spring.stop(); // grab it wherever it is, even mid-animation
    drag.current = { id: e.pointerId, startY: e.clientY, base: spring.value, h: layer.current?.offsetHeight ?? 400 };
    tracker.current.reset();
    tracker.current.add(spring.value);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = d.base + (e.clientY - d.startY);
    const y = raw < 0 ? rubberband(raw, d.h) : raw;
    spring.set(y);
    tracker.current.add(y);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const v = tracker.current.velocity();
    const y = spring.value;
    if (y + project(v) > d.h * 0.4) {
      spring.to(d.h + 48, { response: 0.32, dampingRatio: 1, velocity: Math.max(v, 400) }, () => closeRef.current());
    } else {
      spring.to(0, { response: 0.3, dampingRatio: 1, velocity: v });
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sheet-scrim absolute inset-0 ${shown ? 'is-open' : ''}`} onClick={() => closeRef.current()}>
        <div ref={dim} className="absolute inset-0 bg-ink/40" />
      </div>
      <div className={`sheet relative w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} ${shown ? 'is-open' : ''}`}>
        <div
          ref={layer}
          className="relative rounded-t-[28px] bg-paper shadow-[inset_0_1px_0_#fff,0_-12px_48px_-16px_rgba(0,0,0,0.35)] after:absolute after:inset-x-0 after:top-full after:h-[60vh] after:bg-paper sm:rounded-[28px] sm:after:hidden"
        >
          <div
            className="touch-none select-none sm:touch-auto sm:select-auto"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
              <span className="h-[5px] w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between px-6 pt-3 sm:px-8 sm:pt-7">
              <h2 className="eyebrow text-muted">{title}</h2>
              <button className="icon-btn -mr-2" onClick={() => closeRef.current()} aria-label="Close">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <div className="max-h-[calc(92svh-4rem)] overflow-y-auto overscroll-contain rounded-b-none px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 sm:rounded-b-[28px] sm:px-8 sm:pb-8">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Page scaffolding ──────────────────────────────────────────────────── */
export function PageHeader({ eyebrow, title, children, aside }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-col gap-8 pb-10 pt-12 sm:pb-14 sm:pt-20 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-5 text-muted">{eyebrow}</p>}
        <h1 className="display text-[2.5rem] sm:text-6xl lg:text-7xl">{title}</h1>
        {children && <div className="lede mt-6 max-w-2xl text-base text-graphite sm:text-lg">{children}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

export function EmptyData() {
  return (
    <div className="page-enter py-24 sm:py-36">
      <p className="eyebrow mb-6 text-muted">No analysis yet</p>
      <h1 className="display max-w-3xl text-[2.5rem] sm:text-6xl">Upload your export to begin.</h1>
      <p className="lede mt-6 max-w-lg text-lg text-graphite">
        Everything here is calculated from your own Instagram data, processed privately in this browser.
      </p>
      <Link to="/analyze" className="btn btn-primary mt-10">Analyze my account</Link>
    </div>
  );
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-12 ${className}`}>{children}</div>;
}

/* ── Segmented control with a liquid droplet thumb ─────────────────────── */
export function Segmented<T extends string>({ value, onChange, options, label, stretch = false, dark = false }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  /** Fill the available width with equal segments. */
  stretch?: boolean;
  /** For use over dark scenes. */
  dark?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLiquidIndicator(root, pill, '[data-active="true"]', [value, options.length]);
  return (
    <div ref={root} role="radiogroup" aria-label={label} className={`${dark ? 'glass-dark text-paper' : 'glass'} relative rounded-full p-1 ${stretch ? 'flex w-full' : 'inline-flex'}`}>
      <span
        ref={pill}
        aria-hidden="true"
        className={`absolute bottom-1 left-0 top-1 rounded-full ${dark ? 'bg-paper' : 'bg-ink'} shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_14px_-6px_rgba(0,0,0,0.6)]`}
        style={{ width: 0, opacity: 0 }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            onClick={() => onChange(o.value)}
            className={`label relative z-10 h-9 whitespace-nowrap rounded-full px-4 text-[0.625rem] transition-[color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-90 sm:px-5 ${stretch ? 'flex-1' : ''} ${active ? (dark ? 'text-ink' : 'text-paper') : 'hover:opacity-60'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
