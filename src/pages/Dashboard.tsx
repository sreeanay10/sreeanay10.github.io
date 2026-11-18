import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { AccountExplorer } from '../components/AccountExplorer';
import { ReviewQueue } from '../components/ReviewQueue';
import { snapshotDate } from '../lib/analysis';
import { fmtDate, fmtNumber, fmtSigned } from '../lib/format';

export default function Dashboard() {
  const { analysis, latestDiff, snapshots } = useStore();
  const [reviewing, setReviewing] = useState(false);
  if (!analysis) return <Container><EmptyData /></Container>;

  const s = analysis.snapshot;
  const title = s.owner ? `@${s.owner}` : 'Overview';
  const stats: { label: string; value: number; pct?: boolean; to?: string; note?: string }[] = [
    { label: 'Total followers', value: analysis.followersCount },
    { label: 'Total following', value: analysis.followingCount },
    { label: 'Mutual followers', value: analysis.mutual.length, to: '/mutual' },
    { label: 'Not following back', value: analysis.notFollowingBack.length, to: '/not-following-back', note: analysis.needsReview.length ? `+${fmtNumber(analysis.needsReview.length)} to review` : undefined },
    { label: 'Excluded accounts', value: analysis.excluded.length, to: '/excluded', note: 'Verified or 100K+' },
    { label: 'Follow-back rate', value: analysis.followBackRate ?? 0, pct: true },
    { label: 'You don’t follow back', value: analysis.fans.length, to: '/followers-only', note: 'They follow you' },
  ];

  return (
    <Container className="page-enter pb-28">
      <header className="flex flex-col gap-6 pb-12 pt-12 sm:pt-16 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-5 text-muted">
            Overview · Snapshot {fmtDate(snapshotDate(s))}
            {snapshots.length > 1 && ` · ${snapshots.length} saved`}
          </p>
          {/* The account handle, set as an editorial headline; sized to its length so it never overflows. */}
          <h1
            className="display break-words [overflow-wrap:anywhere]"
            style={{ fontSize: `clamp(2.25rem, ${Math.min(9, 112 / Math.max(8, title.length))}vw, 4.5rem)` }}
          >
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 md:justify-end">
          <Link to="/accounts" className="label link-underline text-[0.6875rem]">All accounts</Link>
          <Link to="/analyze" className="label link-underline text-[0.6875rem]">Upload a newer export</Link>
        </div>
      </header>

      {/* ── Statistics: no cards, just type and hairlines ─────────── */}
      <section aria-label="Statistics" className="grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4" style={{ borderTopColor: '#000' }}>
        {stats.map((st, i) => {
          const body = (
            <>
              <p className="eyebrow flex items-center gap-1.5 text-muted transition-colors group-hover:text-ink">
                {st.label}
                {st.to && <ArrowUpRight size={12} strokeWidth={1.5} className="-translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />}
              </p>
              <p className="numeral mt-5 text-[2.75rem] sm:text-6xl lg:text-7xl">
                {st.pct && analysis.followBackRate === null ? '—' : (
                  <Odometer
                    id={`dash-${st.label}`}
                    value={st.pct ? `${st.value.toFixed(st.value >= 10 ? 0 : 1)}%` : fmtNumber(st.value)}
                  />
                )}
              </p>
              <p className="mt-3 min-h-[1rem] text-xs font-light text-muted">{st.note ?? ' '}</p>
            </>
          );
          const cls = `group block bg-paper py-8 sm:py-10 ${i % 2 === 1 ? 'pl-5 sm:pl-8' : 'pr-5'} ${i % 4 === 0 ? 'lg:pl-0 lg:pr-8' : 'lg:px-8'}`;
          return st.to ? (
            <Link key={st.label} to={st.to} className={cls}>{body}</Link>
          ) : (
            <div key={st.label} className={cls}>{body}</div>
          );
        })}
        <Link to="/audit" className="group flex flex-col justify-between bg-ink p-6 text-paper sm:p-8">
          <p className="eyebrow text-paper/50">Full report</p>
          <p className="headline mt-6 text-xl leading-tight sm:text-2xl">Run my Instagram audit</p>
          <span className="mt-6 flex items-center gap-2 text-xs text-paper/70 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:translate-x-1">PDF · CSV <ArrowRight size={13} /></span>
        </Link>
      </section>

      {/* ── Review callout ───────────────────────────────────────── */}
      {analysis.needsReview.length > 0 && (
        <section className="relative mt-12 flex flex-col gap-6 overflow-hidden rounded-[32px] bg-ink p-8 text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:mt-16 sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="headline text-2xl sm:text-3xl">
              <Odometer id={`dash-review-${analysis.needsReview.length}`} value={fmtNumber(analysis.needsReview.length)} /> to review
            </p>
            <p className="mt-2 text-sm font-light text-paper/60">Swipe through them in seconds.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-inverse" onClick={() => setReviewing(true)}><Roll>Start review</Roll></button>
            <Link to="/review" className="btn glass-dark text-paper"><Roll>See list</Roll></Link>
          </div>
        </section>
      )}

      {/* ── Activity summary ─────────────────────────────────────── */}
      {latestDiff && (
        <section className="mt-20 sm:mt-28">
          <div className="flex items-end justify-between gap-4 border-b border-ink pb-5">
            <div>
              <p className="eyebrow text-muted">Since {fmtDate(snapshotDate(latestDiff.from))}</p>
              <h2 className="headline mt-3 text-2xl sm:text-3xl">Account activity</h2>
            </div>
            <Link to="/activity" className="label link-underline text-[0.625rem]">Full report</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[
              ['New followers', latestDiff.newFollowers.length, 1],
              ['Lost followers', latestDiff.lostFollowers.length, -1],
              ['New accounts followed', latestDiff.newlyFollowed.length, 1],
              ['New non-follow-backs', latestDiff.newNonFollowBacks.length, 1],
            ].map(([l, n, sign], i) => (
              <div key={l as string} className={`border-b border-line py-7 ${i ? 'sm:border-l sm:pl-8' : ''} ${i % 2 ? 'border-l pl-5' : ''}`}>
                <p className="numeral text-4xl sm:text-5xl"><Odometer id={`dash-act-${l}`} value={fmtSigned((n as number) * (sign as number))} /></p>
                <p className="eyebrow mt-3 text-muted">{l}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Main results ─────────────────────────────────────────── */}
      <section className="mt-20 sm:mt-28">
        <div className="flex items-end justify-between gap-4 pb-6">
          <h2 className="display text-[2rem] sm:text-5xl">Not following<br className="sm:hidden" /> you back</h2>
          {analysis.notFollowingBack.length > 8 && (
            <Link to="/not-following-back" className="label link-underline hidden shrink-0 text-[0.625rem] sm:inline">
              All {fmtNumber(analysis.notFollowingBack.length)}
            </Link>
          )}
        </div>
        <AccountExplorer
          accounts={analysis.notFollowingBack}
          title="Not following back"
          emptyTitle={analysis.needsReview.length ? 'Nothing confirmed yet' : 'Everyone follows you back'}
          emptyBody={analysis.needsReview.length ? 'Review accounts to fill this list.' : undefined}
          limit={8}
        />
        {analysis.notFollowingBack.length > 8 && (
          <Link to="/not-following-back" className="btn btn-outline mt-10 w-full sm:w-auto">
            <Roll>{`View all ${fmtNumber(analysis.notFollowingBack.length)}`}</Roll> <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        )}
      </section>

      {reviewing && <ReviewQueue accounts={analysis.needsReview} onClose={() => setReviewing(false)} />}
    </Container>
  );
}
