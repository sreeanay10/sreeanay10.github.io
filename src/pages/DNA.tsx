import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Container, EmptyData, useReveal } from '../components/ui';
import { Odometer } from '../components/motion';
import { snapshotDate } from '../lib/analysis';
import { countryName, summarizeGeo } from '../lib/geo';
import { fmtDate, fmtNumber, fmtSigned } from '../lib/format';

/** Social DNA: an editorial portrait of how your network is structured. Structure only — no guesses about people. */
export default function DNA() {
  const { analysis: a, snapshots, latestDiff, meta, settings } = useStore();
  const ref = useReveal<HTMLDivElement>();
  const geo = useMemo(() => (a && settings.geoEnabled ? summarizeGeo(a, meta, 'followers', 'all') : null), [a, meta, settings.geoEnabled]);
  if (!a) return <Container><EmptyData /></Container>;

  const everyone = a.mutual.length + a.notFollowingBack.length + a.needsReview.length + a.excluded.length + a.fans.length;
  const parts = [
    { label: 'Mutual', n: a.mutual.length, c: '#000' },
    { label: 'Not following back', n: a.notFollowingBack.length, c: '#383838' },
    { label: 'Needs review', n: a.needsReview.length, c: '#767676' },
    { label: 'Excluded', n: a.excluded.length, c: '#B5B5B5' },
    { label: 'You don’t follow', n: a.fans.length, c: '#DCDCDC' },
  ];
  const ratio = a.followingCount ? a.followersCount / a.followingCount : null;
  const mutualPct = a.followBackRate;
  const first = snapshots[0], last = snapshots[snapshots.length - 1];
  const issue = fmtDate(snapshotDate(a.snapshot), { month: 'long', year: 'numeric' });

  return (
    <div ref={ref}>
      <Container className="page-enter pb-28">
        {/* Cover */}
        <header className="relative overflow-hidden rounded-[36px] bg-ink px-7 pb-10 pt-16 text-paper sm:px-12 sm:pb-14 sm:pt-24" data-header-theme="dark">
          <p className="eyebrow text-paper/50">Issue · {issue}</p>
          <h1 className="display mt-6 text-[3.2rem] leading-[0.88] sm:text-8xl lg:text-[9rem]">Social<br />DNA</h1>
          <p className="mt-8 max-w-sm text-sm font-light text-paper/60">{a.snapshot.owner ? `@${a.snapshot.owner} — ` : ''}how your network is built.</p>
          <Helix />
        </header>

        {/* Feature numbers */}
        <section className="mt-16 grid gap-12 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-7">
            <p className="eyebrow text-muted">01 · Reciprocity</p>
            <p className="numeral mt-6 text-[6rem] leading-none sm:text-[10rem]">
              {mutualPct === null ? '—' : <Odometer id={`dna-mut-${mutualPct.toFixed(0)}`} value={`${mutualPct.toFixed(0)}%`} />}
            </p>
            <p className="mt-4 max-w-md text-lg font-light text-graphite">of the accounts you follow follow you back.</p>
          </div>
          <div data-reveal className="lg:col-span-5 lg:pt-16">
            <p className="eyebrow text-muted">02 · Balance</p>
            <p className="numeral mt-6 text-7xl sm:text-8xl">{ratio === null ? '—' : <Odometer id={`dna-ratio-${ratio.toFixed(2)}`} value={ratio.toFixed(2)} />}</p>
            <p className="mt-4 text-lg font-light text-graphite">followers for every account you follow.</p>
            <p className="mt-2 text-sm font-light text-muted">{fmtNumber(a.followersCount)} followers · {fmtNumber(a.followingCount)} following</p>
          </div>
        </section>

        {/* Composition */}
        <section data-reveal className="mt-20">
          <p className="eyebrow text-muted">03 · Composition</p>
          <div className="mt-6 flex h-4 overflow-hidden rounded-full bg-line">
            {parts.map((p, i) => (
              <div key={p.label} className="h-full origin-left" style={{ width: `${(p.n / Math.max(1, everyone)) * 100}%`, background: p.c, animation: `line-grow 1200ms var(--ease-sheet) ${i * 90}ms backwards` }} />
            ))}
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-5">
            {parts.map((p) => (
              <li key={p.label} className="text-sm">
                <span className="mb-2 block h-2.5 w-2.5 rounded-full" style={{ background: p.c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }} />
                <span className="numeral block text-3xl">{fmtNumber(p.n)}</span>
                <span className="font-light text-muted">{p.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-20 grid gap-12 lg:grid-cols-2">
          {/* Growth */}
          <section data-reveal>
            <p className="eyebrow text-muted">04 · Growth</p>
            {snapshots.length >= 2 ? (
              <>
                <p className="numeral mt-6 text-7xl">{fmtSigned(last.followers.length - first.followers.length)}</p>
                <p className="mt-3 text-sm font-light text-muted">followers since {fmtDate(snapshotDate(first))}</p>
                <Spark points={snapshots.map((s) => s.followers.length)} />
              </>
            ) : (
              <p className="mt-6 text-sm font-light text-muted">Needs two exports. <Link to="/analyze" className="link-underline text-ink">Upload another</Link></p>
            )}
          </section>
          {/* Movement */}
          <section data-reveal>
            <p className="eyebrow text-muted">05 · Movement</p>
            {latestDiff ? (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {([
                  ['New connections', latestDiff.newFollowers.length + latestDiff.newlyFollowed.length],
                  ['Lost connections', latestDiff.lostFollowers.length + latestDiff.unfollowedByYou.length],
                  ['New mutuals', latestDiff.mutualGained.length],
                  ['Mutuals lost', latestDiff.mutualLost.length],
                ] as const).map(([k, v]) => (
                  <div key={k} className="rounded-[24px] bg-mist p-5">
                    <p className="numeral text-4xl">{fmtNumber(v)}</p>
                    <p className="mt-2 text-xs font-light text-muted">{k}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm font-light text-muted">Shows up after your second export.</p>
            )}
          </section>
        </div>

        {/* Geography */}
        <section data-reveal className="mt-20">
          <p className="eyebrow text-muted">06 · Geography</p>
          {geo && geo.ranked.length ? (
            <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-6">
              {geo.ranked.slice(0, 3).map((r, i) => (
                <div key={r.code}>
                  <p className={`headline ${i === 0 ? 'text-5xl sm:text-6xl' : 'text-3xl'}`}>{countryName(r.code)}</p>
                  <p className="mt-2 text-sm font-light text-muted">{fmtNumber(r.value)} followers</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm font-light text-muted">No locations added yet.</p>
          )}
        </section>
      </Container>
    </div>
  );
}

/** A slowly turning double helix of dots — the cover ornament. Decorative only. */
function Helix() {
  const dots = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute right-6 top-1/2 hidden h-[80%] w-40 -translate-y-1/2 sm:block">
      {dots.map((i) => (
        <span key={i} className="absolute left-1/2 block" style={{ top: `${(i / dots.length) * 100}%` }}>
          {[0, 1].map((s) => (
            <span
              key={s}
              className="absolute block h-2 w-2 rounded-full bg-paper"
              style={{ animation: `helix 2.6s ease-in-out ${-(i * 0.18) - s * 2}s infinite` }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const W = 400, H = 90;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, points.length - 1)) * W},${H - 8 - ((p - min) / span) * (H - 16)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} style={{ animation: 'draw 1400ms var(--ease-sheet) backwards' }} />
    </svg>
  );
}
