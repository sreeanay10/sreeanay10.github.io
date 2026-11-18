/**
 * A celebratory burst of little circles and rings — the brand mark, exploded.
 * Drawn on a throwaway canvas with simple physics (launch, drag, gravity, fade).
 * Skipped entirely when the user prefers reduced motion.
 */
export function burst(x: number, y: number, { count = 46, spread = Math.PI * 2, angle = -Math.PI / 2, power = 1, color = '#000' } = {}) {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147482000' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = (380 + Math.random() * 720) * power;
    return {
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: 2 + Math.random() * 6,
      ring: Math.random() < 0.45,
      life: 0.9 + Math.random() * 0.7,
      spin: (Math.random() - 0.5) * 8,
    };
  });

  let last = performance.now();
  let t = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const p of parts) {
      if (t > p.life) continue;
      alive = true;
      p.vx *= Math.pow(0.08, dt); // air drag
      p.vy = p.vy * Math.pow(0.08, dt) + 1900 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const fade = Math.min(1, (p.life - t) / 0.35);
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * fade), 0, Math.PI * 2);
      if (p.ring) {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Burst from the centre of an element. */
export function burstFrom(el: Element | null, opts?: Parameters<typeof burst>[2]) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}
