import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { AccountExplorer } from '../components/AccountExplorer';
import { PartialNotice, useLists } from './Categories';
import { snapshotDate } from '../lib/analysis';
import { fmtDate, fmtNumber } from '../lib/format';

export default function Dashboard() {
  const { analysis } = useStore();
  const lists = useLists(analysis);
  if (!analysis || !lists) return <Container><EmptyData /></Container>;

  const s = analysis.snapshot;
  const title = s.owner ? `@${s.owner}` : 'Overview';
  const totals: Stat[] = [
    { label: 'Followers', value: lists.followers.length, to: '/followers' },
    { label: 'Following', value: lists.following.length, to: '/following' },
  ];
  const groups: Stat[] = [
    { label: 'Don’t follow you back', value: lists.notBack.length, to: '/not-following-back' },
    { label: 'You don’t follow back', value: lists.fans.length, to: '/you-dont-follow-back' },
    { label: 'Mutual', value: lists.mutual.length, to: '/mutual' },
  ];

  return (
    <Container className="page-enter pb-28">
      <header className="flex flex-col gap-6 pb-12 pt-12 sm:pt-16 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-5 text-muted">
            Snapshot {fmtDate(snapshotDate(s))}
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
          <Link to="/analyze" className="label link-underline text-[0.6875rem]">Upload a newer export</Link>
        </div>
      </header>
      <PartialNotice a={analysis} />

      <StatRow label="Totals" stats={totals} cols="grid-cols-2 [&>*:nth-child(2)]:pl-5" />
      <StatRow label="Lists" stats={groups} cols="grid-cols-1 sm:grid-cols-3" />

      <section className="mt-20 sm:mt-28">
        <div className="flex items-end justify-between gap-4 pb-6">
          <h2 className="display text-[2rem] sm:text-5xl">Don’t follow<br className="sm:hidden" /> you back</h2>
        </div>
        <AccountExplorer accounts={lists.notBack} title="Don't follow you back" emptyTitle="Everyone follows you back" limit={8} />
        {lists.notBack.length > 8 && (
          <Link to="/not-following-back" className="btn btn-outline mt-10 w-full sm:w-auto">
            <Roll>{`View all ${fmtNumber(lists.notBack.length)}`}</Roll> <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        )}
      </section>
    </Container>
  );
}

interface Stat { label: string; value: number; to: string }

/** A row of linked numbers, divided by hairlines. */
function StatRow({ label, stats, cols }: { label: string; stats: Stat[]; cols: string }) {
  return (
    <section aria-label={label} className={`grid ${cols} gap-px border-b border-line bg-line first-of-type:border-t first-of-type:border-t-ink`}>
      {stats.map((st) => (
        <Link key={st.label} to={st.to} className="group block bg-paper py-8 pr-5 sm:py-10 sm:pr-8 [&:not(:first-child)]:sm:pl-8">
          <p className="eyebrow flex items-center gap-1.5 text-muted transition-colors group-hover:text-ink">
            {st.label}
            <ArrowUpRight size={12} strokeWidth={1.5} className="-translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
          </p>
          <p className="numeral mt-5 text-[2.75rem] sm:text-6xl lg:text-7xl">
            <Odometer id={`dash-${st.label}`} value={fmtNumber(st.value)} />
          </p>
        </Link>
      ))}
    </section>
  );
}
