import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, FileText, Pause, Play, Share2 } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader, Select } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { buildWrapped, wrappedYears, type WrappedData } from '../lib/history';
import { countryName, summarizeGeo } from '../lib/geo';
import { fmtDate, fmtNumber, fmtPercent, fmtSigned } from '../lib/format';
import { burstFrom } from '../lib/burst';

interface Slide {
  id: string;
  kicker: string;
  big: string;
  caption: string;
  kind?: 'chart' | 'list';
  list?: [string, string][];
}

function slidesFor(d: WrappedData, countries: [string, number][]): Slide[] {
  const s: Slide[] = [
    { id: 'intro', kicker: 'Your Followly Wrapped', big: String(d.year), caption: `${d.snapshots.length} snapshots · ${fmtDate(d.series[0].x, { month: 'short', day: 'numeric' })} – ${fmtDate(d.series[d.series.length - 1].x, { month: 'short', day: 'numeric' })}` },
    { id: 'gained', kicker: 'New followers', big: fmtSigned(d.gained), caption: 'People who started following you.' },
    { id: 'lost', kicker: 'Followers lost', big: d.lost ? fmtSigned(-d.lost) : '0', caption: 'People who stopped following you.' },
    { id: 'moves', kicker: 'Your moves', big: `${fmtNumber(d.followed)} / ${fmtNumber(d.unfollowed)}`, caption: 'Accounts you followed / unfollowed.' },
    { id: 'mutual', kicker: 'Mutual followers', big: fmtNumber(d.mutualEnd), caption: `${fmtSigned(d.mutualEnd - d.mutualStart)} since your first snapshot.` },
    { id: 'rate', kicker: 'Follow-back rate', big: fmtPercent(d.rateEnd), caption: d.rateStart !== null && d.rateEnd !== null ? `${d.rateEnd >= d.rateStart ? 'Up' : 'Down'} from ${fmtPercent(d.rateStart)}.` : '' },
    { id: 'growth', kicker: 'Network growth', big: fmtSigned(d.followersEnd - d.followersStart), caption: `${fmtNumber(d.followersStart)} → ${fmtNumber(d.followersEnd)} followers`, kind: 'chart' },
  ];
  if (d.busiest && d.busiest.changes > 0) {
    s.push({ id: 'busiest', kicker: 'Most active stretch', big: fmtDate(d.busiest.to, { month: 'long' }), caption: `${fmtNumber(d.busiest.changes)} changes between ${fmtDate(d.busiest.from, { month: 'short', day: 'numeric' })} and ${fmtDate(d.busiest.to, { month: 'short', day: 'numeric' })}.` });
  }
  if (countries.length) s.push({ id: 'countries', kicker: 'Where they are', big: countries[0][0], caption: 'From countries you added.', kind: 'list', list: countries.slice(0, 4).map(([n, v]) => [n, fmtNumber(v)]) });
  s.push({ id: 'outro', kicker: 'See you next year', big: fmtNumber(d.followersEnd), caption: 'followers and counting.' });
  return s;
}

/** Draws a slide to a 1080×1920 canvas for export (same content as the screen). */
function drawSlide(slide: Slide, d: WrappedData, W = 1080, H = 1920): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = '700 34px "Helvetica Neue", Helvetica, Arial';
  ctx.fillText('F O L L O W L Y', 90, 150);
  ctx.globalAlpha = 0.55;
  ctx.font = '500 30px "Helvetica Neue", Helvetica, Arial';
  ctx.fillText(`WRAPPED ${d.year}`, 90, 200);
  ctx.globalAlpha = 0.6;
  ctx.font = '500 34px "Helvetica Neue", Helvetica, Arial';
  ctx.fillText(slide.kicker.toUpperCase(), 90, 760);
  ctx.globalAlpha = 1;
  let size = 260;
  ctx.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial`;
  while (ctx.measureText(slide.big).width > W - 180 && size > 80) { size -= 10; ctx.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial`; }
  ctx.fillText(slide.big.toUpperCase(), 84, 760 + size * 0.95);
  ctx.globalAlpha = 0.7;
  ctx.font = '300 40px "Helvetica Neue", Helvetica, Arial';
  ctx.fillText(slide.caption, 90, 760 + size * 0.95 + 90);
  ctx.globalAlpha = 1;
  if (slide.kind === 'chart' && d.series.length > 1) {
    const ys = d.series.map((p) => p.y), min = Math.min(...ys), span = Math.max(...ys) - min || 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    d.series.forEach((p, i) => {
      const x = 90 + (i / (d.series.length - 1)) * (W - 180), y = 1650 - ((p.y - min) / span) * 380;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  if (slide.kind === 'list' && slide.list) {
    ctx.font = '400 44px "Helvetica Neue", Helvetica, Arial';
    slide.list.forEach(([n, v], i) => { ctx.fillText(n, 90, 1420 + i * 80); ctx.textAlign = 'right'; ctx.fillText(v, W - 90, 1420 + i * 80); ctx.textAlign = 'left'; });
  }
  return c;
}

/** Followly Wrapped: a cinematic year in review, made only from recorded snapshots. */
export default function Wrapped() {
  const { snapshots, meta, analysis, settings, toast } = useStore();
  const years = useMemo(() => wrappedYears(snapshots), [snapshots]);
  const [year, setYear] = useState(() => String(years[0] ?? new Date().getFullYear()));
  const data = useMemo(() => buildWrapped(Number(year), snapshots, meta), [year, snapshots, meta]);
  const countries = useMemo<[string, number][]>(() => {
    if (!analysis || !settings.geoEnabled) return [];
    return summarizeGeo(analysis, meta, 'followers', 'all').ranked.map((r) => [countryName(r.code), r.value]);
  }, [analysis, meta, settings.geoEnabled]);
  const slides = useMemo(() => (data ? slidesFor(data, countries) : []), [data, countries]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { setI(0); setStarted(false); }, [year]);
  const next = useCallback(() => setI((x) => Math.min(slides.length - 1, x + 1)), [slides.length]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  // Auto-advance like a story
  useEffect(() => {
    if (!started || paused || i >= slides.length - 1) return;
    const t = setTimeout(next, 5200);
    return () => clearTimeout(t);
  }, [i, started, paused, slides.length, next]);
  useEffect(() => {
    if (started && slides[i]?.id === 'outro') burstFrom(stage.current, { count: 80, power: 1.2, color: '#fff' });
  }, [i, started, slides]);

  if (!snapshots.length) return <Container><EmptyData /></Container>;

  const exportPdf = async () => {
    if (!data) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'px', format: [1080, 1920], orientation: 'portrait' });
      slides.forEach((s, k) => {
        if (k) doc.addPage([1080, 1920], 'portrait');
        doc.addImage(drawSlide(s, data).toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 1080, 1920);
      });
      doc.save(`followly-wrapped-${data.year}.pdf`);
    } catch { toast('PDF export failed'); }
  };
  const slideBlob = () => new Promise<Blob>((res, rej) => drawSlide(slides[i], data!).toBlob((b) => (b ? res(b) : rej()), 'image/png'));
  const saveSlide = async () => {
    const url = URL.createObjectURL(await slideBlob());
    const a = document.createElement('a');
    a.href = url; a.download = `followly-wrapped-${data!.year}-${slides[i].id}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shareSlide = async () => {
    const file = new File([await slideBlob()], `wrapped-${slides[i].id}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My Followly Wrapped' }).catch(() => undefined);
    else saveSlide();
  };

  const s = slides[i];
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Followly Wrapped" aside={years.length > 1 ? <Select label="Year" value={year} onChange={setYear} options={years.map((y) => ({ value: String(y), label: String(y) }))} /> : undefined}>
        Your year in followers.
      </PageHeader>

      {!data ? (
        <div className="rounded-[32px] bg-mist p-8 sm:p-10">
          <p className="headline text-xl">Not enough history for {year} yet.</p>
          <p className="mt-2 text-sm font-light text-muted">Wrapped compares your exports — upload at least two.</p>
          <Link to="/analyze" className="btn btn-primary btn-sm mt-6">Upload another export</Link>
        </div>
      ) : (
        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="flex justify-center lg:col-span-7">
            <div
              ref={stage}
              className="relative aspect-[9/16] w-full max-w-[24rem] select-none overflow-hidden rounded-[36px] bg-ink text-paper shadow-[0_50px_100px_-40px_rgba(0,0,0,0.6)]"
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onPointerLeave={() => setPaused(false)}
            >
              {!started ? (
                <button className="absolute inset-0 flex flex-col items-center justify-center text-center" onClick={() => setStarted(true)}>
                  <p className="eyebrow text-paper/50">Your Followly</p>
                  <p className="display mt-4 text-6xl">Wrapped</p>
                  <p className="display mt-1 text-6xl text-transparent [-webkit-text-stroke:1.5px_#fff]">{data.year}</p>
                  <span className="btn btn-inverse mt-10"><Play size={14} fill="#000" /> Play</span>
                </button>
              ) : (
                <>
                  <div className="absolute inset-x-4 top-4 z-10 flex gap-1">
                    {slides.map((sl, k) => (
                      <span key={sl.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                        <span
                          className="block h-full bg-paper"
                          style={{
                            width: k < i ? '100%' : k > i ? '0%' : undefined,
                            animationName: k === i ? 'story' : 'none',
                            animationDuration: '5200ms',
                            animationTimingFunction: 'linear',
                            animationFillMode: 'forwards',
                            animationPlayState: paused ? 'paused' : 'running',
                          }}
                        />
                      </span>
                    ))}
                  </div>
                  <div key={s.id} className="absolute inset-0 flex flex-col justify-end p-7 pb-16">
                    <p className="eyebrow text-paper/60" style={{ animation: 'rise 600ms var(--ease-spring) 100ms backwards' }}>{s.kicker}</p>
                    <p className="display mt-4 break-words text-6xl leading-[0.9]" style={{ animation: 'rise 800ms var(--ease-spring) 200ms backwards' }}>
                      {/^[+−\-\d.,% /]+$/.test(s.big) ? <Odometer id={`wrap-${data.year}-${s.id}-${s.big}`} value={s.big} /> : s.big}
                    </p>
                    <p className="mt-4 text-sm font-light text-paper/70" style={{ animation: 'rise 800ms var(--ease-spring) 380ms backwards' }}>{s.caption}</p>
                    {s.kind === 'chart' && data.series.length > 1 && <MiniChart data={data} />}
                    {s.kind === 'list' && s.list && (
                      <ul className="mt-6 space-y-2 text-sm">
                        {s.list.map(([n, v], k) => (
                          <li key={n} className="flex justify-between border-b border-white/15 pb-2" style={{ animation: `rise 600ms var(--ease-spring) ${450 + k * 80}ms backwards` }}><span>{n}</span><span className="tabular-nums">{v}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="absolute inset-y-0 left-0 w-1/3" onClick={prev} aria-label="Previous slide" />
                  <button className="absolute inset-y-0 right-0 w-2/3" onClick={next} aria-label="Next slide" />
                </>
              )}
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5">
            {started && (
              <div className="flex items-center gap-2">
                <button className="icon-btn" onClick={prev} aria-label="Previous"><ChevronLeft size={18} /></button>
                <button className="icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
                <button className="icon-btn" onClick={next} aria-label="Next"><ChevronRight size={18} /></button>
                <span className="label ml-2 text-[0.625rem] text-muted">{i + 1} / {slides.length}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={exportPdf}><FileText size={15} strokeWidth={1.5} /> <Roll>Download PDF</Roll></button>
              <button className="btn btn-outline" onClick={saveSlide}><Download size={15} strokeWidth={1.5} /> <Roll>Save slide</Roll></button>
              <button className="btn btn-outline" onClick={shareSlide}><Share2 size={15} strokeWidth={1.5} /> <Roll>Share</Roll></button>
            </div>
            <p className="text-xs font-light text-muted">Built only from your {data.snapshots.length} snapshots — changes are counted between upload dates.</p>
          </div>
        </div>
      )}
    </Container>
  );
}

function MiniChart({ data }: { data: WrappedData }) {
  const ys = data.series.map((p) => p.y);
  const min = Math.min(...ys), span = Math.max(...ys) - min || 1;
  const d = data.series.map((p, i) => `${i ? 'L' : 'M'}${(i / (data.series.length - 1)) * 300},${110 - ((p.y - min) / span) * 100}`).join(' ');
  return (
    <svg viewBox="0 0 300 120" className="mt-8 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ animation: 'draw 1600ms var(--ease-sheet) 400ms backwards' }} />
    </svg>
  );
}
