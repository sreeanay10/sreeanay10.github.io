import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader, useReveal } from '../components/ui';
import { Odometer } from '../components/motion';
import { LineChart, type Point } from '../components/LineChart';
import { eligibleNonFollowBacks, mutualSet, snapshotDate } from '../lib/analysis';
import { fmtNumber, fmtPercent } from '../lib/format';
import { countryName, summarizeGeo } from '../lib/geo';

export default function Analytics() {
  const { analysis, snapshots, meta, settings } = useStore();
  const ref = useReveal<HTMLDivElement>();

  const series = useMemo(() => {
    const f: Point[] = [], g: Point[] = [], m: Point[] = [], n: Point[] = [];
    for (const s of snapshots) {
      const x = snapshotDate(s);
      f.push({ x, y: s.followers.length });
      g.push({ x, y: s.following.length });
      m.push({ x, y: mutualSet(s).size });
      n.push({ x, y: eligibleNonFollowBacks(s, meta).size });
    }
    return { f, g, m, n };
  }, [snapshots, meta]);

  if (!analysis) return <Container><EmptyData /></Container>;

  const a = analysis;
  const total = a.followingCount || 1;
  const parts = [
    { label: 'Mutual', n: a.mutual.length, color: '#000000' },
    { label: 'Not following back', n: a.notFollowingBack.length, color: '#333333' },
    { label: 'Needs review', n: a.needsReview.length, color: '#888888' },
    { label: 'Excluded', n: a.excluded.length, color: '#D4D4D4' },
  ];

  return (
    <Container className="page-enter pb-28">
      <div ref={ref}>
        <PageHeader eyebrow="Analytics" title="Follower analytics" />

        {/* Follow-back rate hero */}
        <section className="grid gap-12 border-t border-ink pt-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow text-muted">Follow-back rate</p>
            <p className="numeral mt-6 text-[6rem] leading-none sm:text-[9rem]">
              {a.followBackRate === null ? '—' : <Odometer id={`an-rate-${a.followBackRate.toFixed(1)}`} value={`${a.followBackRate.toFixed(a.followBackRate >= 10 ? 0 : 1)}%`} />}
            </p>
            <p className="lede mt-6 max-w-sm text-graphite">
              {fmtNumber(a.mutual.length)} of the {fmtNumber(a.followingCount)} accounts you follow follow you back.
            </p>
          </div>
          <div className="lg:col-span-7 lg:pl-8">
            <p className="eyebrow text-muted">Who you follow</p>
            <div className="mt-6 flex h-3 w-full overflow-hidden bg-line" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
              {parts.map((p, i) => (
                <div
                  key={p.label}
                  className="h-full origin-left"
                  style={{ width: `${(p.n / total) * 100}%`, background: p.color, animation: `line-grow 1200ms var(--ease-sheet) ${i * 90}ms both` }}
                />
              ))}
            </div>
            <ul className="mt-8">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-4 border-b border-line py-4">
                  <span className="h-2.5 w-2.5 shrink-0 border border-ink/10" style={{ background: p.color }} />
                  <span className="flex-1 text-[0.9375rem]">{p.label}</span>
                  <span className="text-sm font-light tabular-nums text-muted">{fmtPercent((p.n / total) * 100)}</span>
                  <span className="w-16 text-right text-[0.9375rem] tabular-nums">{fmtNumber(p.n)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Key figures */}
        <section className="mt-20 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
          {[
            ['Followers', a.followersCount],
            ['Following', a.followingCount],
            ['Mutual', a.mutual.length],
            ['Not following back', a.notFollowingBack.length],
            ['Excluded', a.excluded.length],
          ].map(([l, n], i) => (
            <div key={l as string} className={`bg-paper py-8 ${i % 2 ? 'pl-5' : 'pr-5'} ${i % 3 === 0 ? 'sm:pl-0' : 'sm:pl-6'} ${i === 0 ? 'lg:pl-0' : 'lg:pl-6'}`}>
              <div data-reveal style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}>
                <p className="numeral text-4xl sm:text-5xl"><Odometer id={`an-${l}-${n}`} value={fmtNumber(n as number)} /></p>
                <p className="eyebrow mt-3 text-muted">{l}</p>
              </div>
            </div>
          ))}
        </section>
        <p className="mt-4 text-xs font-light text-muted">
          {fmtNumber(a.fans.length)} follow you that you don't follow · {fmtNumber(a.needsReview.length)} to review
        </p>

        {settings.geoEnabled && <WorldPreview />}

        {/* History */}
        <section className="mt-24">
          <div className="flex items-end justify-between gap-4 pb-8">
            <div>
              <p className="eyebrow text-muted">Over time · {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}</p>
              <h2 className="headline mt-3 text-2xl sm:text-3xl">History</h2>
            </div>
          </div>
          {snapshots.length < 2 ? (
            <div className="border-t border-ink py-14">
              <p className="lede max-w-lg text-graphite">Upload a second export to see trends.</p>
              <Link to="/analyze" className="btn btn-outline mt-8">Upload another export</Link>
            </div>
          ) : (
            <div className="grid gap-x-12 gap-y-16 md:grid-cols-2">
              <LineChart title="Followers" data={series.f} />
              <LineChart title="Following" data={series.g} />
              <LineChart title="Mutual followers" data={series.m} />
              <LineChart title="Not following back" data={series.n} />
            </div>
          )}
        </section>
      </div>
    </Container>
  );
}

function WorldPreview() {
  const { analysis, meta } = useStore();
  const geo = useMemo(() => (analysis ? summarizeGeo(analysis, meta, 'followers', 'all') : null), [analysis, meta]);
  if (!analysis || !geo) return null;
  const top = geo.ranked.slice(0, 5);
  return (
    <section className="mt-24">
      <div className="flex items-end justify-between gap-4 border-b border-ink pb-5">
        <div>
          <p className="eyebrow text-muted">Global audience</p>
          <h2 className="headline mt-3 text-2xl sm:text-3xl">Follower world map</h2>
        </div>
        <Link to="/world" className="label link-underline shrink-0 text-[0.625rem]">Open map</Link>
      </div>
      {top.length === 0 ? (
        <p className="lede max-w-xl py-10 text-graphite">No locations yet — add countries to see your map.</p>
      ) : (
        <>
          <ol>
            {top.map((c, i) => {
              const share = geo.locatedFollowers ? (c.value / geo.locatedFollowers) * 100 : 0;
              return (
                <li key={c.code} className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-line py-4">
                  <span className="text-sm font-light tabular-nums text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] font-medium">{countryName(c.code)}</span>
                    <span className="mt-2 block h-[2px] max-w-xs bg-line"><span className="block h-full bg-ink" style={{ width: `${share}%` }} /></span>
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    {fmtNumber(c.value)} <span className="font-light text-muted">· {fmtPercent(share)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs font-light text-muted">
            {fmtNumber(geo.locatedFollowers)} of {fmtNumber(analysis.followersCount)} followers have a country you added · {fmtNumber(geo.ranked.length)} countries
          </p>
        </>
      )}
    </section>
  );
}
