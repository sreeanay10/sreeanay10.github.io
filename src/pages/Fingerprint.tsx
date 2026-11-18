import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Share2, Smartphone, Monitor } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader, Segmented } from '../components/ui';
import { Roll } from '../components/motion';
import { drawFingerprint, type FingerprintStats } from '../lib/fingerprint';
import { summarizeGeo } from '../lib/geo';
import { fmtNumber } from '../lib/format';
import { sortSnapshots } from '../lib/analysis';

type Style = 'ink' | 'paper';

async function render(stats: FingerprintStats, variant: number, ink: boolean, W: number, H: number, caption?: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  drawFingerprint(c.getContext('2d')!, W, H, stats, variant, { ink, caption });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/png'));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Network Fingerprint: artwork generated from your real numbers. */
export default function Fingerprint() {
  const { analysis, snapshots, meta, settings, toast } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [variant, setVariant] = useState(0);
  const [style, setStyle] = useState<Style>('ink');
  const [busy, setBusy] = useState(false);

  const stats = useMemo<FingerprintStats | null>(() => {
    if (!analysis) return null;
    const geo = settings.geoEnabled ? summarizeGeo(analysis, meta, 'followers', 'all') : null;
    return {
      followers: analysis.followersCount,
      following: analysis.followingCount,
      mutual: analysis.mutual.length,
      notFollowingBack: analysis.notFollowingBack.length,
      needsReview: analysis.needsReview.length,
      excluded: analysis.excluded.length,
      fans: analysis.fans.length,
      series: sortSnapshots(snapshots).map((s) => s.followers.length),
      countries: geo?.ranked.length ?? 0,
    };
  }, [analysis, snapshots, meta, settings.geoEnabled]);

  // Draw with a short "growing" animation each time the art changes.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !stats) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = c.clientWidth;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / 1100);
      const e = 1 - Math.pow(1 - p, 3);
      drawFingerprint(ctx, c.width, c.height, stats, variant, { ink: style === 'ink', progress: e });
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [stats, variant, style]);

  if (!analysis || !stats) return <Container><EmptyData /></Container>;
  const ink = style === 'ink';
  const name = (kind: string) => `followly-fingerprint-${kind}-${variant + 1}.png`;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch { toast('Couldn’t create the image'); } setBusy(false); };

  const share = () => run(async () => {
    const blob = await render(stats, variant, ink, 2048, 2048);
    const file = new File([blob], name('square'), { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My FOLLOWLY fingerprint' });
    else if ('ClipboardItem' in window) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Image copied — paste it anywhere'); }
    else { save(blob, name('square')); }
  });

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Network Fingerprint">Artwork made from your real numbers. No two look alike.</PageHeader>
      <div className="grid items-start gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className={`relative aspect-square overflow-hidden rounded-[36px] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.45)] ${ink ? 'bg-ink' : 'bg-paper ring-1 ring-line'}`}>
            <canvas ref={canvas} className="h-full w-full" aria-label="Your network fingerprint artwork" />
          </div>
        </div>
        <div className="space-y-8 lg:col-span-5 lg:pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Style" value={style} onChange={setStyle} options={[{ value: 'ink', label: 'Ink' }, { value: 'paper', label: 'Paper' }]} />
            <button className="btn btn-outline" onClick={() => setVariant((v) => v + 1)}>
              <RefreshCw size={15} strokeWidth={1.5} /> <Roll>Regenerate</Roll>
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => save(await render(stats, variant, ink, 2048, 2048), name('square')))}>
              <Download size={15} strokeWidth={1.5} /> <Roll>Download</Roll>
            </button>
            <button className="btn btn-outline" disabled={busy} onClick={share}><Share2 size={15} strokeWidth={1.5} /> <Roll>Share</Roll></button>
          </div>
          <div>
            <p className="eyebrow text-muted">Wallpaper</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => save(await render(stats, variant, ink, 1290, 2796), name('phone')))}>
                <Smartphone size={14} strokeWidth={1.5} /> Phone
              </button>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => save(await render(stats, variant, ink, 3840, 2160), name('desktop')))}>
                <Monitor size={14} strokeWidth={1.5} /> Desktop
              </button>
            </div>
          </div>
          <div className="rounded-[24px] bg-mist p-5 text-sm">
            <p className="eyebrow text-muted">Made from</p>
            <p className="mt-3 leading-relaxed text-graphite">
              {fmtNumber(stats.followers)} followers · {fmtNumber(stats.following)} following · {fmtNumber(stats.mutual)} mutual · {fmtNumber(stats.fans)} you don’t follow · {stats.series.length} {stats.series.length === 1 ? 'snapshot' : 'snapshots'}
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
