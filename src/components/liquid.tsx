import { useEffect, useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';
import { Spring } from '../lib/spring';

/* ═══════════════════════════ Liquid Glass ═══════════════════════════ */

/**
 * Real refraction for every `.glass` / `.glass-dark` surface.
 *
 * For each surface we build a displacement map shaped to its exact size and corner
 * radius: neutral in the middle, bending hard near the rim (a rounded-rect signed
 * distance field). The backdrop is pushed through it with an SVG filter in
 * `backdrop-filter`, so text and shapes passing behind the glass visibly bend and
 * stretch at the edges — like light through a droplet. Chromium supports SVG
 * filters in backdrop-filter; other browsers keep the frosted fallback.
 */
const SUPPORTS_REFRACTION = (() => {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand)) || (/Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent));
})();

function displacementMap(w: number, h: number, radius: number, rim: number): string {
  const S = 0.5; // half-resolution map; the filter stretches it smoothly
  const cw = Math.max(2, Math.round(w * S)), ch = Math.max(2, Math.round(h * S));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  const hx = w / 2 - radius, hy = h / 2 - radius;
  for (let y = 0; y < ch; y++) {
    const py = (y + 0.5) / S - h / 2;
    for (let x = 0; x < cw; x++) {
      const px = (x + 0.5) / S - w / 2;
      const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const sd = outside + Math.min(Math.max(qx, qy), 0) - radius; // < 0 inside
      const inset = -sd; // distance in from the edge
      let r = 128, g = 128;
      if (inset < rim) {
        const t = 1 - Math.max(0, inset) / rim;
        const m = Math.pow(t, 1.7);
        let nx = 0, ny = 0;
        if (qx > 0 && qy > 0) { nx = ox / (outside || 1); ny = oy / (outside || 1); }
        else if (qx > qy) nx = 1;
        else ny = 1;
        nx *= Math.sign(px) || 1;
        ny *= Math.sign(py) || 1;
        // sample from further inside: the rim stretches the backdrop outward
        r = 128 - nx * m * 127;
        g = 128 - ny * m * 127;
      }
      const i = (y * cw + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function LiquidGlass() {
  useEffect(() => {
    if (!SUPPORTS_REFRACTION || window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return;
    document.documentElement.classList.add('lg-refract');
    const host = document.createElementNS(SVG_NS, 'svg');
    host.setAttribute('width', '0');
    host.setAttribute('height', '0');
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'absolute';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);

    let seq = 0;
    const tracked = new Map<HTMLElement, { id: string; filter: SVGFilterElement; key: string }>();
    const pending = new Set<HTMLElement>();
    let raf = 0;

    const build = (el: HTMLElement) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!el.isConnected || w < 8 || h < 8) return;
      const cs = getComputedStyle(el);
      const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
      const dark = el.classList.contains('glass-dark');
      const rim = Math.min(dark ? 18 : 24, Math.min(w, h) * 0.4);
      const key = `${w}x${h}r${Math.round(radius)}`;
      let entry = tracked.get(el);
      if (entry && entry.key === key) return;
      if (!entry) {
        const id = `lg-${++seq}`;
        const filter = document.createElementNS(SVG_NS, 'filter') as SVGFilterElement;
        filter.setAttribute('id', id);
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        host.appendChild(filter);
        entry = { id, filter, key };
        tracked.set(el, entry);
      }
      entry.key = key;
      const strength = Math.round(rim * (dark ? 1.1 : 1.3));
      const map = displacementMap(w, h, radius, rim);
      const thick = el.classList.contains('glass-thick');
      const blur = thick ? 'blur(18px) saturate(180%)' : dark ? 'blur(6px) saturate(160%)' : 'blur(2px) saturate(185%) brightness(1.06)';
      const filter = entry.filter, id = entry.id;
      // Chrome renders a backdrop filter once; if the lens image hasn't decoded yet the
      // glass comes out empty. Decode first, then (re)apply so it picks up the new lens.
      const img = new Image();
      img.src = map;
      img.decode().catch(() => undefined).then(() => {
        if (!el.isConnected || tracked.get(el)?.key !== key) return;
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', String(w));
        filter.setAttribute('height', String(h));
        filter.innerHTML = `<feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${strength}" xChannelSelector="R" yChannelSelector="G"/>`;
        el.style.removeProperty('backdrop-filter');
        requestAnimationFrame(() => {
          el.style.setProperty('backdrop-filter', `url(#${id}) ${blur}`);
          el.style.setProperty('-webkit-backdrop-filter', `url(#${id}) ${blur}`);
        });
      });
    };

    const flush = () => {
      raf = 0;
      for (const el of pending) build(el);
      pending.clear();
    };
    const queue = (el: HTMLElement) => {
      pending.add(el);
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const ro = new ResizeObserver((entries) => entries.forEach((e) => queue(e.target as HTMLElement)));
    const scan = () => {
      const now = new Set(document.querySelectorAll<HTMLElement>('.glass, .glass-dark, .btn-outline'));
      for (const el of now) {
        if (!tracked.has(el)) { ro.observe(el); queue(el); }
      }
      for (const [el, entry] of tracked) {
        if (!now.has(el)) {
          ro.unobserve(el);
          entry.filter.remove();
          el.style.removeProperty('backdrop-filter');
          el.style.removeProperty('-webkit-backdrop-filter');
          tracked.delete(el);
        }
      }
    };
    let scanRaf = 0;
    const mo = new MutationObserver(() => { if (!scanRaf) scanRaf = requestAnimationFrame(() => { scanRaf = 0; scan(); }); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    scan();

    return () => {
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scanRaf);
      for (const [el] of tracked) {
        el.style.removeProperty('backdrop-filter');
        el.style.removeProperty('-webkit-backdrop-filter');
      }
      host.remove();
      document.documentElement.classList.remove('lg-refract');
    };
  }, []);
  return null;
}

/** Moves the specular highlight on whichever glass surface is under the pointer. */
export function useGlassLight() {
  useEffect(() => {
    let raf = 0;
    let target: HTMLElement | null = null;
    let x = 0, y = 0;
    const paint = () => {
      raf = 0;
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--gx', `${x - r.left}px`);
      target.style.setProperty('--gy', `${y - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      target = (e.target as Element | null)?.closest?.<HTMLElement>('.glass, .glass-dark') ?? null;
      x = e.clientX;
      y = e.clientY;
      if (target && !raf) raf = requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);
}

/**
 * A liquid indicator that slides between options like a droplet: the leading
 * edge springs ahead, the trailing edge catches up, so it stretches in motion,
 * squashes slightly, then settles with a small wobble. First placement is instant.
 */
export function useLiquidIndicator(
  container: RefObject<HTMLElement>,
  pill: RefObject<HTMLElement>,
  selector: string,
  deps: DependencyList,
) {
  const state = useRef<{ L: Spring; R: Spring; target: { l: number; r: number }; ready: boolean } | null>(null);
  if (!state.current) {
    const st = { target: { l: 0, r: 0 }, ready: false } as { L: Spring; R: Spring; target: { l: number; r: number }; ready: boolean };
    const apply = () => {
      const el = pill.current;
      if (!el) return;
      const l = st.L.value, r = st.R.value;
      const w = Math.max(0, r - l);
      const tw = st.target.r - st.target.l;
      const stretch = tw > 0 ? Math.max(0, w / tw - 1) : 0;
      el.style.width = `${w}px`;
      el.style.transform = `translate3d(${l}px, 0, 0) scaleY(${(1 - Math.min(0.22, stretch * 0.4)).toFixed(3)})`;
    };
    st.L = new Spring(0, apply);
    st.R = new Spring(0, apply);
    state.current = st;
  }

  useLayoutEffect(() => {
    const root = container.current;
    const st = state.current!;
    if (!root) return;
    const measure = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>(selector);
      const el = pill.current;
      if (!active || !el) { if (el) el.style.opacity = '0'; return; }
      el.style.opacity = '1';
      const l = active.offsetLeft, r = l + active.offsetWidth;
      if (!animate || !st.ready) {
        st.target = { l, r };
        st.L.set(l, false);
        st.R.set(r);
        st.ready = true;
        return;
      }
      const right = l > st.target.l;
      st.target = { l, r };
      const lead = { response: 0.24, dampingRatio: 0.68 };
      const trail = { response: 0.44, dampingRatio: 0.78 };
      st.L.to(l, right ? trail : lead);
      st.R.to(r, right ? lead : trail);
    };
    measure(true);
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(root);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
