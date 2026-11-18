import { useEffect, useId, useRef, useState } from 'react';
import { fmtDate, fmtNumber, fmtSigned } from '../lib/format';

export interface Point { x: number; y: number }

const W = 600, H = 220, PAD = { t: 20, r: 12, b: 28, l: 12 };

/** Minimal monochrome line chart. Plots only the points it is given — nothing is interpolated or invented. */
export function LineChart({ title, data }: { title: string; data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  const id = useId();

  const last = data[data.length - 1];
  const first = data[0];

  const xs = data.map((d) => d.x), ys = data.map((d) => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const padY = (maxY - minY) * 0.15;
  minY -= padY; maxY += padY;
  const sx = (x: number) => PAD.l + (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - (y - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
    const el = pathRef.current?.ownerSVGElement;
    if (!el || !('IntersectionObserver' in window)) { setDrawn(true); return; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setDrawn(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [d]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    data.forEach((p, i) => { if (Math.abs(sx(p.x) - x) < Math.abs(sx(data[best].x) - x)) best = i; });
    setHover(best);
  };

  const h = hover !== null ? data[hover] : null;
  const delta = last && first ? last.y - first.y : 0;

  return (
    <figure className="border-t border-ink pt-5">
      <figcaption className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted">{title}</p>
          <p className="numeral mt-3 text-4xl tabular-nums">{fmtNumber(h ? h.y : last.y)}</p>
          <p className="mt-2 text-xs font-light text-muted">{h ? fmtDate(h.x) : `${fmtSigned(delta)} since ${fmtDate(first.x)}`}</p>
        </div>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full touch-none select-none"
        role="img"
        aria-labelledby={`${id}-desc`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <desc id={`${id}-desc`}>{`${title}: ${data.map((p) => `${fmtDate(p.x)} ${p.y}`).join(', ')}`}</desc>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="#EAEAEA" strokeWidth="1" />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#000" strokeWidth="1" />
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            strokeDasharray: len || undefined,
            strokeDashoffset: drawn ? 0 : len,
            transition: 'stroke-dashoffset 1400ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
        {data.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={hover === i ? 4.5 : 2.75}
            fill={hover === i ? '#000' : '#fff'}
            stroke="#000"
            strokeWidth="1.5"
            style={{ opacity: drawn ? 1 : 0, transition: `opacity 400ms ${400 + i * 60}ms, r 150ms` }}
          />
        ))}
        {h && <line x1={sx(h.x)} x2={sx(h.x)} y1={PAD.t} y2={H - PAD.b} stroke="#000" strokeWidth="0.75" strokeDasharray="2 3" />}
        <text x={PAD.l} y={H - 8} fontSize="10" fill="#767676" letterSpacing="1">{fmtDate(first.x, { month: 'short', day: 'numeric' }).toUpperCase()}</text>
        <text x={W - PAD.r} y={H - 8} fontSize="10" fill="#767676" textAnchor="end" letterSpacing="1">{fmtDate(last.x, { month: 'short', day: 'numeric' }).toUpperCase()}</text>
      </svg>
    </figure>
  );
}
