import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { MapData } from '../lib/geoShapes';
import { HEAT, countryName, heatLevel } from '../lib/geo';
import { clamp, project, rubberband, Spring, VelocityTracker } from '../lib/spring';

const MAX_K = 10;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export interface WorldMapHandle {
  focus(code: string): void;
  reset(): void;
}

interface Props {
  data: MapData;
  values: Map<string, number>;
  max: number;
  selected: string | null;
  onSelect: (code: string | null) => void;
  valueLabel: (n: number) => string;
  /** Horizontal position (0–1) where a focused country is centred — leaves room for a side panel. */
  focusX?: number;
  children?: ReactNode;
}

type Pan = { kind: 'pan'; id: number; sx: number; sy: number; bx: number; by: number; moved: boolean; target: Element | null };
type Pinch = { kind: 'pinch'; d0: number; m0: [number, number]; k0: number; x0: number; y0: number };

/**
 * Interactive choropleth. Panning tracks the pointer 1:1 and is handed to springs on
 * release with the gesture's velocity and projected momentum; edges rubber-band;
 * pinch / ⌘-scroll zoom around the fingers or cursor; any motion can be caught mid-flight.
 */
export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap(
  { data, values, max, selected, onSelect, valueLabel, focusX = 0.5, children },
  ref,
) {
  const W = data.width, H = data.height;
  const frame = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomG = useRef<SVGGElement>(null);
  const markerG = useRef<SVGGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(H); // viewBox height, matched to the frame's aspect ratio
  const vhRef = useRef(H);
  const [unitPerPx, setUnitPerPx] = useState(1);
  const unitRef = useRef(1);

  /* ── View state: three independent springs (scale, x, y) ─────────────── */
  const view = useMemo(() => {
    const v = {} as { k: Spring; x: Spring; y: Spring; apply: () => void };
    v.apply = () => {
      const k = v.k.value, x = v.x.value, y = v.y.value;
      zoomG.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
      const mg = markerG.current;
      if (mg) {
        for (const el of Array.from(mg.children) as SVGGElement[]) {
          el.setAttribute('transform', `translate(${x + k * Number(el.dataset.x)} ${y + k * Number(el.dataset.y)})`);
        }
      }
      if (svgRef.current) svgRef.current.style.touchAction = k > 1.01 ? 'none' : 'pan-y';
    };
    v.k = new Spring(1, v.apply);
    v.x = new Spring(0, v.apply);
    v.y = new Spring(0, v.apply);
    return v;
  }, []);

  const range = (k: number) => {
    const VH = vhRef.current;
    const cw = W * k, ch = H * k;
    const x = cw <= W ? [(W - cw) / 2, (W - cw) / 2] : [W - cw, 0];
    const y = ch <= VH ? [(VH - ch) / 2, (VH - ch) / 2] : [VH - ch, 0];
    return { minX: x[0], maxX: x[1], minY: y[0], maxY: y[1] };
  };
  const clampView = (k: number, x: number, y: number) => {
    const r = range(k);
    return { x: clamp(x, r.minX, r.maxX), y: clamp(y, r.minY, r.maxY) };
  };
  const soft = (v: number, min: number, max: number, dim: number) =>
    v > max ? max + rubberband(v - max, dim) : v < min ? min - rubberband(min - v, dim) : v;

  const animateTo = (k: number, x: number, y: number, response = 0.5) => {
    const kk = clamp(k, 1, MAX_K);
    const c = clampView(kk, x, y);
    view.k.to(kk, { response, dampingRatio: 1 });
    view.x.to(c.x, { response, dampingRatio: 1 });
    view.y.to(c.y, { response, dampingRatio: 1 });
  };
  const zoomAround = (factor: number, cx: number, cy: number, animate = true) => {
    const k0 = view.k.value;
    const k1 = clamp(k0 * factor, 1, MAX_K);
    const x1 = cx - (cx - view.x.value) * (k1 / k0);
    const y1 = cy - (cy - view.y.value) * (k1 / k0);
    if (animate) { animateTo(k1, x1, y1, 0.42); return; }
    const c = clampView(k1, x1, y1);
    view.k.set(k1, false);
    view.x.set(c.x, false);
    view.y.set(c.y);
  };
  const stopAll = () => { view.k.stop(); view.x.stop(); view.y.stop(); };

  useImperativeHandle(ref, () => ({
    focus(code: string) {
      const shape = data.shapeByCode.get(code);
      const pt = data.points.get(code);
      let k: number, cx: number, cy: number;
      if (shape) {
        const [[x0, y0], [x1, y1]] = shape.bounds;
        // Frame the country without zooming past the detail of the 1:110m boundaries.
        k = clamp(0.42 / Math.max((x1 - x0) / W, (y1 - y0) / vhRef.current), 1.4, 4);
        cx = (x0 + x1) / 2;
        cy = (y0 + y1) / 2;
      } else if (pt) {
        k = 4;
        [cx, cy] = pt;
      } else return;
      animateTo(k, W * focusX - k * cx, vhRef.current / 2 - k * cy, 0.62);
    },
    reset() {
      animateTo(1, 0, 0, 0.55);
    },
  }));

  /* ── Frame size → viewBox aspect, marker scale ───────────────────────── */
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const next = (W * r.height) / r.width;
      vhRef.current = next;
      unitRef.current = W / r.width;
      setVh(next);
      setUnitPerPx(W / r.width);
      const c = clampView(view.k.value, view.x.value, view.y.value);
      view.x.set(c.x, false);
      view.y.set(c.y);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, view]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Pointer gestures ────────────────────────────────────────────────── */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Pan | Pinch | null>(null);
  const vx = useRef(new VelocityTracker());
  const vy = useRef(new VelocityTracker());
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const svgPoint = (clientX: number, clientY: number): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * vhRef.current];
  };

  const hideTip = () => { if (tip.current) tip.current.style.opacity = '0'; };
  const showTip = (e: React.PointerEvent) => {
    const t = tip.current, f = frame.current;
    if (!t || !f || e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest?.('[data-code]');
    if (!el) { hideTip(); return; }
    const code = el.getAttribute('data-code')!;
    t.textContent = `${countryName(code)} · ${valueLabel(values.get(code) ?? 0)}`;
    const r = f.getBoundingClientRect();
    const x = Math.min(e.clientX - r.left + 14, r.width - t.offsetWidth - 8);
    t.style.transform = `translate(${x}px, ${e.clientY - r.top + 16}px)`;
    t.style.opacity = '1';
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      m0: svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
      k0: view.k.value,
      x0: view.x.value,
      y0: view.y.value,
    };
  };

  const settle = (velX: number, velY: number) => {
    const k = clamp(view.k.value, 1, MAX_K);
    const c = clampView(k, view.x.value + project(velX, 0.997), view.y.value + project(velY, 0.997));
    view.k.to(k, { response: 0.4, dampingRatio: 1 });
    view.x.to(c.x, { response: 0.55, dampingRatio: 1, velocity: velX });
    view.y.to(c.y, { response: 0.55, dampingRatio: 1, velocity: velY });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopAll(); // catch the map mid-glide
    hideTip();
    if (pointers.current.size === 1) {
      gesture.current = { kind: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, bx: view.x.value, by: view.y.value, moved: false, target: e.target as Element };
      vx.current.reset(); vy.current.reset();
      vx.current.add(view.x.value); vy.current.add(view.y.value);
    } else if (pointers.current.size === 2) {
      startPinch();
      for (const id of pointers.current.keys()) { try { svgRef.current!.setPointerCapture(id); } catch { /* already released */ } }
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) { showTip(e); return; }
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const m = svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      let k = (g.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0;
      k = k < 1 ? 1 - rubberband(1 - k, 1, 0.35) : k > MAX_K ? MAX_K + rubberband(k - MAX_K, MAX_K, 0.35) : k;
      const px = (g.m0[0] - g.x0) / g.k0, py = (g.m0[1] - g.y0) / g.k0; // map point under the fingers
      const r = range(Math.max(k, 1));
      view.k.set(k, false);
      view.x.set(soft(m[0] - k * px, r.minX, r.maxX, W * 0.25), false);
      view.y.set(soft(m[1] - k * py, r.minY, r.maxY, vhRef.current * 0.25));
      return;
    }
    if (g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 6) return; // still a tap
      g.moved = true;
      svgRef.current!.setPointerCapture(e.pointerId);
    }
    const s = unitRef.current, r = range(view.k.value);
    const x = soft(g.bx + dx * s, r.minX, r.maxX, W * 0.3);
    const y = soft(g.by + dy * s, r.minY, r.maxY, vhRef.current * 0.3);
    view.x.set(x, false);
    view.y.set(y);
    vx.current.add(x);
    vy.current.add(y);
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') {
      const rest = [...pointers.current.entries()];
      if (rest.length === 1) {
        const [id, p] = rest[0];
        gesture.current = { kind: 'pan', id, sx: p.x, sy: p.y, bx: view.x.value, by: view.y.value, moved: true, target: null };
        vx.current.reset(); vy.current.reset();
      } else if (rest.length === 0) {
        gesture.current = null;
        settle(0, 0);
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.moved) { settle(vx.current.velocity(), vy.current.velocity()); return; }
    if (e.type !== 'pointerup') { settle(0, 0); return; }
    // A tap: select what's under it (or clear on the ocean); a second quick tap zooms in.
    const hit = (g.target as Element | null)?.closest?.('[data-code]');
    onSelect(hit ? hit.getAttribute('data-code') : null);
    const now = performance.now();
    const p = svgPoint(e.clientX, e.clientY);
    const lt = lastTap.current;
    if (lt && now - lt.t < 320 && Math.hypot(p[0] - lt.x, p[1] - lt.y) < 30 * unitRef.current) {
      zoomAround(2, p[0], p[1]);
      lastTap.current = null;
    } else {
      lastTap.current = { t: now, x: p[0], y: p[1] };
      settle(0, 0);
    }
  };

  /* ── Wheel / trackpad pinch (⌘ or Ctrl) and Safari gesture events ───── */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let hintTimer = 0;
    const flashHint = () => {
      const h = hint.current;
      if (!h) return;
      h.style.opacity = '1';
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => { h.style.opacity = '0'; }, 1100);
    };
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) { flashHint(); return; } // plain scroll belongs to the page
      e.preventDefault();
      stopAll();
      const p = svgPoint(e.clientX, e.clientY);
      const unit = e.deltaMode === 1 ? 0.05 : Math.abs(e.deltaY) < 40 ? 0.012 : 0.0025;
      zoomAround(clamp(Math.exp(-e.deltaY * unit), 0.5, 2), p[0], p[1], false);
    };
    let g0 = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); g0 = view.k.value; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const p = svgPoint(ge.clientX, ge.clientY);
      zoomAround((g0 * ge.scale) / view.k.value, p[0], p[1], false);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('gesturestart', onGestureStart);
    svg.addEventListener('gesturechange', onGestureChange);
    return () => {
      clearTimeout(hintTimer);
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('gesturestart', onGestureStart);
      svg.removeEventListener('gesturechange', onGestureChange);
    };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    const VH = vhRef.current;
    const step = 80 * unitRef.current;
    if (e.key === '+' || e.key === '=') zoomAround(1.6, W / 2, VH / 2);
    else if (e.key === '-' || e.key === '_') zoomAround(1 / 1.6, W / 2, VH / 2);
    else if (e.key === '0') animateTo(1, 0, 0);
    else if (e.key === 'ArrowLeft') animateTo(view.k.value, view.x.value + step, view.y.value, 0.35);
    else if (e.key === 'ArrowRight') animateTo(view.k.value, view.x.value - step, view.y.value, 0.35);
    else if (e.key === 'ArrowUp') animateTo(view.k.value, view.x.value, view.y.value + step, 0.35);
    else if (e.key === 'ArrowDown') animateTo(view.k.value, view.x.value, view.y.value - step, 0.35);
    else if (e.key === 'Escape') onSelect(null);
    else return;
    e.preventDefault();
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  const fills = useMemo(
    () => new Map(data.shapes.map((s) => [s.key, s.code ? HEAT[heatLevel(values.get(s.code) ?? 0, max)] : HEAT[0]])),
    [data, values, max],
  );
  const markers = useMemo(
    () => [...values.entries()]
      .filter(([code, v]) => v > 0 && data.points.has(code))
      .sort((a, b) => a[1] - b[1])
      .map(([code, v]) => ({ code, v, p: data.points.get(code)! })),
    [values, data],
  );
  const selectedShape = selected ? data.shapeByCode.get(selected) : undefined;

  // Re-apply the current view whenever the marker set or viewBox changes.
  useLayoutEffect(() => { view.apply(); }, [markers, selected, vh, view]);

  return (
    <div ref={frame} className="relative h-full w-full overflow-hidden bg-mist">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${vh}`}
        className="geo-map absolute inset-0 h-full w-full select-none outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-ink"
        style={{ touchAction: 'pan-y' }}
        role="application"
        aria-label="World map. Drag to pan, pinch or use the zoom buttons to zoom, tap a country for details."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={hideTip}
      >
        <rect width={W} height={vh} fill="transparent" />
        <g ref={zoomG}>
          {data.shapes.map((s) => (
            <path
              key={s.key}
              d={s.d}
              data-code={s.code}
              className={s.code ? 'geo-land geo-land-in' : 'geo-land-in'}
              style={{ animationDelay: `${Math.round((s.bounds[0][0] / W) * 700)}ms` }}
              fill={fills.get(s.key)}
              stroke="#F7F7F7"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
              pointerEvents={s.code ? undefined : 'none'}
            />
          ))}
          {selectedShape && (
            <path d={selectedShape.d} fill="none" stroke="#000" strokeWidth={1.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </g>
        <g ref={markerG}>
          {markers.map(({ code, v, p }, mi) => {
            const isSel = code === selected;
            // Marker size in screen pixels (constant while zooming), a little smaller on small maps.
            const base = W / unitPerPx < 600 ? 0.75 : 1;
            const r = (2 + 4 * Math.sqrt(v / Math.max(1, max)) + (isSel ? 1.5 : 0)) * base * unitPerPx;
            return (
              <g key={code} data-x={p[0]} data-y={p[1]} data-code={code} className="cursor-pointer">
                <circle r={Math.max(r, 9 * unitPerPx)} fill="transparent" />
                {isSel && <circle className="pulse-ring" r={r} fill="none" stroke="#000" strokeWidth={1 * unitPerPx} />}
                <circle
                  className="marker-pop"
                  style={{ animationDelay: `${700 + (markers.length - mi) * 45}ms` }}
                  r={r}
                  fill={isSel ? '#000' : '#fff'}
                  stroke="#000"
                  strokeWidth={1.1 * unitPerPx}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hover label (mouse only) */}
      <div
        ref={tip}
        className="glass-dark label pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.625rem] text-paper opacity-0 transition-opacity duration-150"
        aria-hidden="true"
      />
      {/* Scroll hint */}
      <div
        ref={hint}
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-ink/35 opacity-0 transition-opacity duration-300"
        aria-hidden="true"
      >
        <span className="glass-dark label rounded-full px-5 py-3 text-[0.6875rem] text-paper">{IS_MAC ? '⌘' : 'Ctrl'} + scroll to zoom</span>
      </div>

      {/* Legend */}
      <div className="glass glass-thick pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full px-3.5 py-2.5">
        <span className="label text-[0.625rem] text-muted">Fewer</span>
        <span className="flex">
          {HEAT.slice(1).map((c, i) => <span key={c} className={`h-2 w-3.5 sm:w-5 ${i === 0 ? 'rounded-l-full' : ''} ${i === 4 ? 'rounded-r-full' : ''}`} style={{ background: c }} />)}
        </span>
        <span className="label text-[0.625rem] text-muted">More</span>
      </div>

      {/* Zoom controls */}
      <div className="glass glass-thick absolute bottom-3 right-3 z-10 flex rounded-full p-1 md:bottom-auto md:left-3 md:right-auto md:top-3 md:flex-col">
        <button className="flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/5 active:scale-90" onClick={() => zoomAround(1.8, W / 2, vhRef.current / 2)} aria-label="Zoom in">
          <Plus size={16} strokeWidth={1.5} />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/5 active:scale-90" onClick={() => zoomAround(1 / 1.8, W / 2, vhRef.current / 2)} aria-label="Zoom out">
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/5 active:scale-90" onClick={() => animateTo(1, 0, 0)} aria-label="Reset view">
          <RotateCcw size={14} strokeWidth={1.5} />
        </button>
      </div>

      {children}
    </div>
  );
});
