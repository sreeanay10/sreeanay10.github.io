import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader, Segmented } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { WorldMap, type WorldMapHandle } from '../components/WorldMap';
import { getMapData } from '../lib/geoShapes';
import {
  countryName, filterLabel, searchCountries, summarizeGeo,
  type CountryStat, type GeoFilter, type GeoMode, type GeoSummary,
} from '../lib/geo';
import { fmtNumber, fmtPercent } from '../lib/format';
import { profileUrl } from '../lib/username';

const MODES: { value: GeoMode; label: string }[] = [
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
];
const FILTERS: { value: GeoFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mutual', label: 'Mutual' },
  { value: 'one-way', label: 'One-way' },
];

function filterCaption(mode: GeoMode, filter: GeoFilter) {
  if (filter === 'mutual') return 'You follow each other.';
  if (filter === 'one-way') return mode === 'followers' ? 'You don’t follow them back.' : 'They don’t follow you back.';
  return mode === 'followers' ? 'Everyone who follows you.' : 'Everyone you follow.';
}

function unitLabel(mode: GeoMode, n: number) {
  return mode === 'followers' ? (n === 1 ? 'follower' : 'followers') : 'following';
}

export default function World() {
  const { analysis, meta, settings } = useStore();
  const [mode, setMode] = useState<GeoMode>('followers');
  const [filter, setFilter] = useState<GeoFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const mapRef = useRef<WorldMapHandle>(null);
  const mapSection = useRef<HTMLDivElement>(null);
  const data = useMemo(() => getMapData(), []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const summary = useMemo(
    () => (analysis ? summarizeGeo(analysis, meta, mode, filter) : null),
    [analysis, meta, mode, filter],
  );
  const values = useMemo(() => new Map(summary ? [...summary.byCountry.values()].map((s) => [s.code, s.value]) : []), [summary]);
  const anyLocation = useMemo(() => Object.values(meta).some((m) => m.country), [meta]);

  if (!settings.geoEnabled) {
    return (
      <Container className="page-enter pb-28">
        <PageHeader title="World map is off">
          Turn it on in Settings.
        </PageHeader>
        <Link to="/settings" className="btn btn-primary">Open settings</Link>
      </Container>
    );
  }
  if (!analysis || !summary) return <Container><EmptyData /></Container>;

  const pick = (code: string) => {
    setSelected(code);
    mapRef.current?.focus(code);
    if (!wide) mapSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const stat = selected ? summary.byCountry.get(selected) : undefined;
  const rank = selected ? summary.ranked.findIndex((s) => s.code === selected) + 1 : 0;
  const coverage = summary.total ? (summary.located / summary.total) * 100 : null;
  const view = filterLabel(mode, filter);

  return (
    <Container className="page-enter pb-28">
      <PageHeader
        title="World map"
        aside={<CountrySearch onPick={pick} />}
      >
        Where your audience is, from countries you add.
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between lg:border-t lg:border-ink lg:pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Map" value={mode} onChange={(m) => { setMode(m); }} options={MODES} />
          <Segmented label="Filter" value={filter} onChange={setFilter} options={FILTERS} />
        </div>
        <p className="text-xs font-light text-muted sm:max-w-xs sm:text-right">{filterCaption(mode, filter)}</p>
      </div>

      {/* Map */}
      <div ref={mapSection} className="relative mt-6 scroll-mt-36">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[28px] shadow-[inset_0_0_0_1px_#EAEAEA] sm:aspect-[16/9] lg:aspect-[2/1] lg:rounded-[32px]">
          <WorldMap
            ref={mapRef}
            data={data}
            values={values}
            max={summary.max}
            selected={selected}
            onSelect={setSelected}
            valueLabel={(n) => `${fmtNumber(n)} ${unitLabel(mode, n)}`}
            focusX={wide ? 0.4 : 0.5}
          >
            {wide && (
              <CountryPanel
                code={selected}
                stat={stat}
                rank={rank}
                summary={summary}
                mode={mode}
                view={view}
                onClose={() => setSelected(null)}
                floating
              />
            )}
            {!anyLocation && <EmptyOverlay />}
            {anyLocation && summary.located === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
                <p className="glass label rounded-full px-4 py-2.5 text-[0.625rem]">Nothing located in this view</p>
              </div>
            )}
          </WorldMap>
        </div>
      </div>
      {!wide && selected && (
        <div className="mt-6">
          <CountryPanel code={selected} stat={stat} rank={rank} summary={summary} mode={mode} view={view} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Key figures */}
      <section className="mt-12 grid grid-cols-2 gap-px border-y border-line bg-line lg:grid-cols-4" aria-label="Location summary">
        <Figure i={0} label="Countries represented" value={<Odometer id={`geo-c-${mode}-${filter}-${summary.ranked.length}`} value={fmtNumber(summary.ranked.length)} />} />
        <Figure
          i={1}
          label={`Located · ${view}`}
          value={<Odometer id={`geo-l-${mode}-${filter}-${summary.located}`} value={fmtNumber(summary.located)} />}
          note={summary.total ? `of ${fmtNumber(summary.total)} · ${fmtPercent(coverage)} have a country` : undefined}
        />
        <Figure
          i={2}
          label="Top country"
          value={<span className="text-[1.75rem] sm:text-4xl">{summary.ranked[0] ? countryName(summary.ranked[0].code) : '—'}</span>}
          note={summary.ranked[0] ? `${fmtPercent((summary.ranked[0].value / Math.max(1, summary.located)) * 100)} of located` : undefined}
        />
        <Figure
          i={3}
          label="Located followers"
          value={<Odometer id={`geo-lf-${summary.locatedFollowers}`} value={fmtNumber(summary.locatedFollowers)} />}
          note={`of ${fmtNumber(analysis.followersCount)} followers`}
        />
      </section>

      {/* Ranking */}
      <TopCountries summary={summary} mode={mode} view={view} selected={selected} onPick={pick} />

      {/* How locations work */}
      <section className="mt-20 flex flex-col gap-6 rounded-[32px] bg-mist p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <p className="headline text-xl">Shared, never guessed.</p>
          <p className="mt-2 text-sm font-light text-muted">Only countries you add. No cities, no tracking.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/settings" className="btn btn-primary btn-sm"><Roll>Import locations</Roll></Link>
          <Link to="/settings" className="btn btn-outline btn-sm"><Roll>Turn off</Roll></Link>
        </div>
      </section>
    </Container>
  );
}

function Figure({ i, label, value, note }: { i: number; label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className={`min-w-0 bg-paper py-7 sm:py-9 ${i % 2 ? 'pl-5' : 'pr-5'} ${i === 0 ? 'lg:pl-0' : 'lg:pl-8'}`}>
      <p className="eyebrow text-muted">{label}</p>
      <p className="numeral mt-4 truncate text-4xl sm:text-5xl">{value}</p>
      <p className="mt-2 min-h-[1rem] text-xs font-light text-muted">{note ?? ' '}</p>
    </div>
  );
}

/* ── Country search (combobox) ───────────────────────────────────────────── */
function CountrySearch({ onPick }: { onPick: (code: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchCountries(q, 7), [q]);
  useEffect(() => setActive(0), [q]);
  const choose = (code: string) => {
    onPick(code);
    setQ('');
    setOpen(false);
    input.current?.blur();
  };
  return (
    <div className="relative w-full lg:w-80">
      <label className="glass relative flex items-center rounded-full">
        <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-muted" />
        <input
          ref={input}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="country-results"
          aria-activedescendant={open && results[active] ? `country-${results[active].code}` : undefined}
          aria-label="Search for a country"
          placeholder="Search for a country"
          className="h-12 w-full rounded-full bg-transparent pl-11 pr-10 text-base font-light placeholder:text-muted focus:outline-none"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active].code); }
            else if (e.key === 'Escape') { setOpen(false); }
          }}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {q && (
          <button className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-ink" onClick={() => setQ('')} aria-label="Clear">
            <X size={15} strokeWidth={1.5} />
          </button>
        )}
      </label>
      <ul
        id="country-results"
        role="listbox"
        className="glass glass-thick absolute inset-x-0 top-full z-40 mt-2 origin-top rounded-[22px] p-1.5"
        style={{
          opacity: open && results.length ? 1 : 0,
          transform: open && results.length ? 'none' : 'scale(0.85) translateY(-8px)',
          pointerEvents: open && results.length ? 'auto' : 'none',
          transition: `opacity 160ms var(--ease-out), transform ${open ? 560 : 260}ms ${open ? 'var(--ease-spring)' : 'var(--ease-sheet)'}`,
        }}
      >
        {results.map((r, i) => (
          <li
            key={r.code}
            id={`country-${r.code}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => { e.preventDefault(); choose(r.code); }}
            onMouseEnter={() => setActive(i)}
            className={`flex cursor-pointer items-center justify-between rounded-[14px] px-3.5 py-2.5 text-sm transition-colors ${i === active ? 'bg-black/[0.06]' : ''}`}
          >
            {r.name}
            <span className="label text-[0.625rem] text-muted">{r.code}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Country panel ───────────────────────────────────────────────────────── */
function CountryPanel({ code, stat, rank, summary, mode, view, onClose, floating = false }: {
  code: string | null;
  stat?: CountryStat;
  rank: number;
  summary: GeoSummary;
  mode: GeoMode;
  view: string;
  onClose: () => void;
  floating?: boolean;
}) {
  // Keep the last country while the floating panel slides away.
  const [shown, setShown] = useState(code);
  const [showAccounts, setShowAccounts] = useState(false);
  useEffect(() => {
    if (code) { setShown(code); setShowAccounts(false); return; }
    const t = setTimeout(() => setShown(null), 450);
    return () => clearTimeout(t);
  }, [code]);
  if (!shown) return null;
  const s = code ? stat : summary.byCountry.get(shown);
  const value = s?.value ?? 0;
  const accounts = s?.accounts ?? [];
  const share = summary.located ? (value / summary.located) * 100 : null;
  const followerShare = summary.locatedFollowers && s ? (s.followers / summary.locatedFollowers) * 100 : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className="eyebrow pt-1 text-muted">{rank > 0 ? `No. ${rank} · ${view}` : view}</p>
        <button className="icon-btn -mr-2 -mt-2 h-9 w-9" onClick={onClose} aria-label="Close country details">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      <h3 className="headline mt-2 text-2xl leading-tight">{countryName(shown)}</h3>
      <div className="mt-6 flex items-end gap-3">
        <span className="numeral text-6xl">{fmtNumber(value)}</span>
        <span className="pb-1.5 text-sm font-light text-muted">{unitLabel(mode, value)}</span>
      </div>
      <p className="mt-2 text-xs font-light text-muted">
        {value ? `${fmtPercent(share)} of located accounts in this view` : 'No located accounts here yet.'}
        {followerShare !== null && s && s.followers > 0 && ` · ${fmtPercent(followerShare)} of located followers`}
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-2">
        {([
          ['Followers', s?.followers ?? 0],
          ['Following', s?.following ?? 0],
          ['Mutual', s?.mutual ?? 0],
          ['Not following back', s?.nonFollowBack ?? 0],
        ] as const).map(([l, n], i) => (
          <div key={l} className="rounded-[16px] bg-black/[0.04] px-3.5 py-3" data-i={i}>
            <dt className="eyebrow text-[0.625rem] text-muted">{l}</dt>
            <dd className="mt-2 text-2xl font-light tabular-nums">{fmtNumber(n)}</dd>
          </div>
        ))}
      </dl>
      {accounts.length > 0 && (
        <div className="mt-5">
          <button
            className="label flex h-10 w-full items-center justify-between rounded-full bg-black/[0.05] px-4 text-[0.625rem] transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/[0.08] active:scale-[0.97]"
            onClick={() => setShowAccounts((v) => !v)}
            aria-expanded={showAccounts}
          >
            {showAccounts ? 'Hide accounts' : `Show ${fmtNumber(accounts.length)} ${accounts.length === 1 ? 'account' : 'accounts'}`}
            <span className="text-muted">{showAccounts ? '−' : '+'}</span>
          </button>
          <div className="grid transition-[grid-template-rows] duration-500 ease-sheet" style={{ gridTemplateRows: showAccounts ? '1fr' : '0fr' }}>
            <div className="overflow-hidden">
              <ul className="max-h-56 overflow-y-auto overscroll-contain border-t border-line">
                {accounts.map((u) => (
                  <li key={u}>
                    <a href={profileUrl(u)} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between border-b border-line py-2.5 text-sm">
                      <span className="truncate">@{u}</span>
                      <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.6875rem] font-light text-muted">Only visible to you.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!floating) return <section className="page-enter rounded-[28px] bg-mist p-6" aria-label={`${countryName(shown)} details`}>{body}</section>;
  return (
    <aside
      className="geo-panel glass glass-thick absolute right-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-1.5rem))] origin-top-right overflow-y-auto overscroll-contain rounded-[24px] p-5"
      style={{
        opacity: code ? 1 : 0,
        transform: code ? 'none' : 'scale(0.7) translate3d(20px, -10px, 0)',
        pointerEvents: code ? 'auto' : 'none',
        transition: `transform ${code ? 700 : 350}ms ${code ? 'var(--ease-spring)' : 'var(--ease-sheet)'}, opacity 300ms var(--ease-out)`,
      }}
      aria-label={`${countryName(shown)} details`}
      aria-hidden={!code}
    >
      {body}
    </aside>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="glass glass-thick pointer-events-auto max-w-xs rounded-[28px] p-6 text-left sm:p-7">
        <p className="headline text-xl leading-tight">No locations yet.</p>
        <p className="mt-2 text-sm font-light leading-relaxed text-graphite">
          Instagram doesn't share them. Add countries per account, or import a CSV.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/settings" className="btn btn-primary btn-sm">Import locations</Link>
          <Link to="/mutual" className="btn btn-outline btn-sm">Add per account</Link>
        </div>
      </div>
    </div>
  );
}

/* ── Ranking ─────────────────────────────────────────────────────────────── */
function TopCountries({ summary, mode, view, selected, onPick }: {
  summary: GeoSummary;
  mode: GeoMode;
  view: string;
  selected: string | null;
  onPick: (code: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = all ? summary.ranked : summary.ranked.slice(0, 10);
  if (!summary.ranked.length) return null;
  return (
    <section className="mt-20">
      <div className="flex items-end justify-between gap-4 border-b border-ink pb-5">
        <div>
          <p className="eyebrow text-muted">{view}</p>
          <h2 className="headline mt-3 text-2xl sm:text-3xl">Top countries</h2>
        </div>
        <p className="text-xs font-light text-muted">{fmtNumber(summary.ranked.length)} {summary.ranked.length === 1 ? 'country' : 'countries'}</p>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="eyebrow w-10 py-3 text-[0.625rem] font-medium text-muted">#</th>
            <th className="eyebrow py-3 text-[0.625rem] font-medium text-muted">Country</th>
            <th className="eyebrow py-3 text-right text-[0.625rem] font-medium text-ink">{mode === 'followers' ? 'Followers' : 'Following'}</th>
            <th className="eyebrow hidden py-3 pl-6 text-right text-[0.625rem] font-medium text-muted sm:table-cell">Share</th>
            <th className="eyebrow hidden py-3 pl-6 text-right text-[0.625rem] font-medium text-muted md:table-cell">{mode === 'followers' ? 'Following' : 'Followers'}</th>
            <th className="eyebrow hidden py-3 pl-6 text-right text-[0.625rem] font-medium text-muted md:table-cell">Mutual</th>
            <th className="eyebrow hidden py-3 pl-6 text-right text-[0.625rem] font-medium text-muted lg:table-cell">Not following back</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const share = summary.located ? (s.value / summary.located) * 100 : 0;
            return (
              <tr
                key={s.code}
                className={`group cursor-pointer border-b border-line transition-colors hover:bg-mist ${selected === s.code ? 'bg-mist' : ''}`}
                onClick={() => onPick(s.code)}
              >
                <td className="py-4 align-top text-sm font-light tabular-nums text-muted">{i + 1}</td>
                <td className="py-4 pr-4">
                  <button className="text-left text-[0.9375rem] font-medium focus-visible:outline-none group-focus-within:underline" onClick={(e) => { e.stopPropagation(); onPick(s.code); }}>
                    {countryName(s.code)}
                  </button>
                  <span className="mt-2 block h-[2px] w-full max-w-[14rem] bg-line">
                    <span className="block h-full origin-left bg-ink" style={{ width: `${share}%`, animation: `line-grow 1000ms var(--ease-sheet) ${i * 40}ms backwards` }} />
                  </span>
                </td>
                <td className="py-4 text-right align-top text-[0.9375rem] tabular-nums">{fmtNumber(s.value)}</td>
                <td className="hidden py-4 pl-6 text-right align-top text-sm font-light tabular-nums text-muted sm:table-cell">{fmtPercent(share)}</td>
                <td className="hidden py-4 pl-6 text-right align-top text-sm font-light tabular-nums md:table-cell">{fmtNumber(mode === 'followers' ? s.following : s.followers)}</td>
                <td className="hidden py-4 pl-6 text-right align-top text-sm font-light tabular-nums md:table-cell">{fmtNumber(s.mutual)}</td>
                <td className="hidden py-4 pl-6 text-right align-top text-sm font-light tabular-nums lg:table-cell">{fmtNumber(s.nonFollowBack)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {summary.ranked.length > 10 && (
        <button className="label link-underline mt-6 text-[0.625rem]" onClick={() => setAll((v) => !v)}>
          {all ? 'Show top 10' : `Show all ${fmtNumber(summary.ranked.length)} countries`}
        </button>
      )}
    </section>
  );
}
