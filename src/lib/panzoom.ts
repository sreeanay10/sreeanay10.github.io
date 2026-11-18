import { project, Spring, VelocityTracker } from './spring';

/**
 * Pan & zoom for full-screen canvases: 1:1 dragging, release momentum handed to
 * springs, pinch and wheel zoom around the fingers / cursor, catchable mid-glide.
 * Calls onTap for short taps so the canvas can select things.
 */
export interface View { x: number; y: number; k: number }

export function attachPanZoom(canvas: HTMLCanvasElement, opts: { onTap?: (x: number, y: number) => void; onChange?: () => void; min?: number; max?: number }) {
  const min = opts.min ?? 0.3, max = opts.max ?? 8;
  const view: View = { x: 0, y: 0, k: 1 };
  const changed = () => opts.onChange?.();
  const sx = new Spring(0, (v) => { view.x = v; changed(); });
  const sy = new Spring(0, (v) => { view.y = v; changed(); });
  const sk = new Spring(1, (v) => { view.k = v; changed(); });
  const vx = new VelocityTracker(), vy = new VelocityTracker();
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; bx: number; by: number; moved: boolean } | null = null;
  let pinch: { d0: number; k0: number; mx: number; my: number; x0: number; y0: number } | null = null;

  const local = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 };
  };
  const zoomAt = (factor: number, px: number, py: number, animate: boolean) => {
    const k1 = Math.min(max, Math.max(min, view.k * factor));
    const x1 = px - (px - view.x) * (k1 / view.k), y1 = py - (py - view.y) * (k1 / view.k);
    if (animate) {
      const c = { response: 0.4, dampingRatio: 1 };
      sk.to(k1, c); sx.to(x1, c); sy.to(y1, c);
    } else { sk.set(k1, false); sx.set(x1, false); sy.set(y1); }
  };

  const down = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    sx.stop(); sy.stop(); sk.stop();
    if (pointers.size === 1) {
      drag = { sx: e.clientX, sy: e.clientY, bx: view.x, by: view.y, moved: false };
      vx.reset(); vy.reset(); vx.add(view.x); vy.add(view.y);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: view.k, mx: m.x, my: m.y, x0: view.x, y0: view.y };
      drag = null;
    }
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const k = Math.min(max, Math.max(min, (pinch.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0));
      const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const wx = (pinch.mx - pinch.x0) / pinch.k0, wy = (pinch.my - pinch.y0) / pinch.k0;
      sk.set(k, false); sx.set(m.x - wx * k, false); sy.set(m.y - wy * k);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    sx.set(drag.bx + dx, false); sy.set(drag.by + dy);
    vx.add(view.x); vy.add(view.y);
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { if (e.type === 'pointerup') opts.onTap?.(e.clientX, e.clientY); return; }
    const velX = vx.velocity(), velY = vy.velocity();
    sx.to(view.x + project(velX, 0.997), { response: 0.6, dampingRatio: 1, velocity: velX });
    sy.to(view.y + project(velY, 0.997), { response: 0.6, dampingRatio: 1, velocity: velY });
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    const unit = e.deltaMode === 1 ? 0.05 : Math.abs(e.deltaY) < 40 ? 0.012 : 0.0025;
    zoomAt(Math.min(2, Math.max(0.5, Math.exp(-e.deltaY * unit))), p.x, p.y, false);
  };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.style.touchAction = 'none';

  return {
    view,
    zoomBy: (f: number) => zoomAt(f, 0, 0, true),
    /** Set the zoom immediately (e.g. an initial fit), without animating. */
    fit: (k: number) => zoomAt(k / view.k, 0, 0, false),
    reset: () => { const c = { response: 0.5, dampingRatio: 1 }; sx.to(0, c); sy.to(0, c); sk.to(1, c); },
    focus: (wx: number, wy: number, k = 2.4) => { const c = { response: 0.6, dampingRatio: 1 }; sk.to(k, c); sx.to(-wx * k, c); sy.to(-wy * k, c); },
    destroy: () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      [sx, sy, sk].forEach((s) => s.stop());
    },
  };
}
