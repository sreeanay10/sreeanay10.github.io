import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;


/* ═══════════════════════════ Odometer ═══════════════════════════
 * Digits roll into place like a mechanical counter. Remembers what it showed,
 * so coming back to a page doesn't replay the roll unless the number changed. */
const rolled = new Set<string>();

export function Odometer({ value, id, className = '' }: { value: string; id: string; className?: string }) {
  const [live, setLive] = useState(() => rolled.has(id));
  const root = useRef<HTMLSpanElement>(null);
  // Roll only once the number is actually on screen.
  useEffect(() => {
    if (live) return;
    const el = root.current;
    const go = () => { rolled.add(id); setLive(true); };
    if (!el || !('IntersectionObserver' in window)) { const r = requestAnimationFrame(go); return () => cancelAnimationFrame(r); }
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); raf = requestAnimationFrame(() => { raf = requestAnimationFrame(go); }); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [id, live]);
  const chars = value.split('');
  let digitIndex = 0;
  return (
    <span ref={root} className={`odo ${className}`}>
      <span className="sr-only">{value}</span>
      {chars.map((c, i) => {
        const key = chars.length - i; // keyed from the right so units stay units
        if (!/\d/.test(c)) return <span key={`s${key}`} className="odo-static" aria-hidden="true">{c}</span>;
        const n = Number(c);
        const delay = digitIndex++ * 70;
        return (
          <span key={`d${key}`} className="odo-digit" aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(${-(live ? n : 0) * 10}%)`, transitionDelay: `${delay}ms` }}>
              {'0123456789'.split('').map((x) => <span key={x}>{x}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ═══════════════════════════ Rolling label ═══════════════════════════ */
export function Roll({ children }: { children: string }) {
  return (
    <span className="roll">
      <span data-text={children}>{children}</span>
    </span>
  );
}

/* ═══════════════════════════ Kinetic headline ═══════════════════════════
 * Letters rise in one by one, then lift toward the pointer like a wave. */
export function KineticHeadline({ lines, className = '' }: { lines: string[]; className?: string }) {
  const root = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !finePointer() || reducedMotion()) return;
    const letters = [...el.querySelectorAll<HTMLElement>('.kinetic-letter')];
    let centers: { x: number; y: number }[] = [];
    const measure = () => {
      centers = letters.map((l) => {
        const r = l.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };
    let raf = 0, px = 0, py = 0, active = false;
    const paint = () => {
      raf = 0;
      letters.forEach((l, i) => {
        const c = centers[i];
        const dist = Math.hypot(px - c.x, (py - c.y) * 1.4);
        const k = active ? Math.max(0, 1 - dist / 170) : 0;
        l.style.translate = k ? `0 ${(-k * k * 22).toFixed(1)}px` : '';
      });
    };
    const onMove = (e: PointerEvent) => {
      if (!centers.length) measure();
      px = e.clientX; py = e.clientY; active = true;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => { active = false; if (!raf) raf = requestAnimationFrame(paint); };
    const reset = () => { centers = []; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', reset, { passive: true });
    window.addEventListener('resize', reset);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', reset);
      window.removeEventListener('resize', reset);
    };
  }, []);

  let n = 0;
  return (
    <h1 ref={root} className={className} aria-label={lines.join(' ')}>
      {lines.map((line) => (
        <span key={line} className="-mt-[0.3em] block overflow-hidden pb-[0.06em] pt-[0.3em]" aria-hidden="true">
          {line.split(' ').map((word, wi, words) => (
            <span key={wi} className="kinetic">
              {word.split('').map((ch, ci) => (
                <span key={ci} className="kinetic-letter" style={{ animationDelay: `${120 + n++ * 28}ms` }}>{ch}</span>
              ))}
              {wi < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/* ═══════════════════════════ Scroll marquee ═══════════════════════════
 * A giant band of words that drifts sideways and speeds up with your scroll —
 * changing direction when you change direction. */
export function Marquee({ words }: { words: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current, wrap = host.current;
    if (!el || !wrap || reducedMotion()) return;
    let x = 0, dir = -1, boost = 0, lastY = window.scrollY, raf = 0, last = performance.now(), on = false;
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    });
    io.observe(wrap);
    const onScroll = () => {
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      if (dy) dir = dy > 0 ? -1 : 1;
      boost = Math.min(1600, boost + Math.abs(dy) * 6);
    };
    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      boost *= Math.pow(0.04, dt);
      x += dir * (60 + boost) * dt;
      const half = el!.scrollWidth / 2;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      el!.style.transform = `translate3d(${x}px, 0, 0)`;
      raf = on ? requestAnimationFrame(tick) : 0;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); };
  }, []);
  const row = (k: string) => (
    <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 'b'}>
      {words.map((w, i) => (
        <span key={i} className="flex items-center">
          <span className={i % 2 ? 'text-transparent [-webkit-text-stroke:1.5px_#000]' : 'text-ink'}>{w}</span>
          <svg viewBox="0 0 31 20" className="mx-[0.35em] h-[0.42em] w-auto shrink-0" aria-hidden="true">
            <circle cx="10" cy="10" r="8.6" fill="#000" />
            <circle cx="21" cy="10" r="8.6" fill="none" stroke="#000" strokeWidth="1.4" />
          </svg>
        </span>
      ))}
    </div>
  );
  return (
    <div ref={host} className="overflow-hidden border-y border-ink py-6 sm:py-10">
      <div ref={track} className="display flex w-max whitespace-nowrap text-[18vw] leading-none sm:text-[11vw]" style={{ willChange: 'transform' }}>
        {row('a')}
        {row('b')}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Page transitions ═══════════════════════════
 * Internal link clicks open the next page as a circle growing from the click,
 * using the View Transitions API. Falls back to a normal navigation. */
export function usePageTransitions() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = useRef(pathname);
  current.current = pathname;
  useEffect(() => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!doc.startViewTransition) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reducedMotion()) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === current.current) return;
      e.preventDefault(); // stops the router link from navigating on its own
      const x = e.clientX || innerWidth / 2, y = e.clientY || innerHeight / 2;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const root = document.documentElement.style;
      root.setProperty('--vt-x', `${x}px`);
      root.setProperty('--vt-y', `${y}px`);
      root.setProperty('--vt-r', `${r}px`);
      // Name the header only for the transition: a view-transition-name makes it a
      // backdrop root, which would stop its Liquid Glass from seeing the page behind.
      const header = document.querySelector<HTMLElement>('[data-site-header]');
      header?.style.setProperty('view-transition-name', 'site-header');
      const vt = doc.startViewTransition!(() => {
        flushSync(() => navigate(url.pathname + url.search + url.hash));
        if (!url.hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }) as { finished?: Promise<void> } | undefined;
      const clear = () => header?.style.removeProperty('view-transition-name');
      if (vt?.finished) vt.finished.then(clear, clear); else clear();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
}

