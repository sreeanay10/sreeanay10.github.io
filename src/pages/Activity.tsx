import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, FileDown, FileText, Minus, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, Modal, PageHeader } from '../components/ui';
import { diffSnapshots, mutualSet, snapshotDate } from '../lib/analysis';
import { countryName, summarizeGeo } from '../lib/geo';
import { analyze } from '../lib/analysis';
import { exportActivityCsv, exportActivityPdf } from '../lib/export';
import { fmtDate, fmtNumber, fmtSigned } from '../lib/format';
import { profileUrl } from '../lib/username';
import type { Snapshot, SnapshotDiff } from '../lib/types';

const SECTIONS: { key: keyof SnapshotDiff; label: string; sign: 1 | -1 | 0; note: string }[] = [
  { key: 'newFollowers', label: 'New followers', sign: 1, note: 'Started following you' },
  { key: 'lostFollowers', label: 'Lost followers', sign: -1, note: 'Stopped following you' },
  { key: 'newlyFollowed', label: 'New accounts followed', sign: 1, note: 'You followed them' },
  { key: 'unfollowedByYou', label: 'Accounts you unfollowed', sign: 0, note: 'You unfollowed them' },
  { key: 'mutualGained', label: 'New mutual followers', sign: 1, note: 'Now follow each other' },
  { key: 'mutualLost', label: 'Mutual followers lost', sign: -1, note: 'No longer mutual' },
  { key: 'newNonFollowBacks', label: 'New non-follow-backs', sign: 1, note: "Don't follow you back" },
  { key: 'resolvedNonFollowBacks', label: 'No longer non-follow-backs', sign: 0, note: 'Resolved' },
];

export default function Activity() {
  const { snapshots, analysis, meta, active, setActive, removeSnapshot, toast } = useStore();
  const [params] = useSearchParams();
  const [fromId, setFromId] = useState<string>(params.get('from') ?? '');
  const [toId, setToId] = useState<string>(params.get('to') ?? '');
  const [confirmDelete, setConfirmDelete] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ids = snapshots.map((s) => s.id);
    if (!ids.includes(toId)) setToId(snapshots[snapshots.length - 1]?.id ?? '');
    if (!ids.includes(fromId)) setFromId(snapshots[snapshots.length - 2]?.id ?? '');
  }, [snapshots, fromId, toId]);

  const diff = useMemo(() => {
    const a = snapshots.find((s) => s.id === fromId), b = snapshots.find((s) => s.id === toId);
    if (!a || !b || a.id === b.id) return null;
    // Always compare older → newer.
    return snapshotDate(a) <= snapshotDate(b) ? diffSnapshots(a, b, meta) : diffSnapshots(b, a, meta);
  }, [snapshots, fromId, toId, meta]);

  if (!analysis) return <Container><EmptyData /></Container>;

  const label = (s: Snapshot) => `${fmtDate(snapshotDate(s))} · ${fmtNumber(s.followers.length)} followers`;

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Account activity">What changed between two of your uploads.</PageHeader>

      {snapshots.length < 2 ? (
        <div className="border-t border-ink py-16">
          <p className="headline text-2xl">One snapshot saved.</p>
          <p className="lede mt-4 max-w-lg text-graphite">Upload a newer export to see what changed.</p>
          <Link to="/analyze" className="btn btn-primary mt-8">Upload a newer export</Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-6 border-t border-ink pt-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
              <label className="block">
                <span className="eyebrow text-muted">From</span>
                <select className="select mt-1 block" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
                </select>
              </label>
              <span className="hidden pb-3 text-muted sm:block">→</span>
              <label className="block">
                <span className="eyebrow text-muted">To</span>
                <select className="select mt-1 block" value={toId} onChange={(e) => setToId(e.target.value)}>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
                </select>
              </label>
            </div>
            {diff && (
              <div className="flex gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => exportActivityCsv(diff)}><FileDown size={14} strokeWidth={1.5} /> CSV</button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={async () => { setBusy(true); try { await exportActivityPdf(diff); } catch { toast('PDF export failed'); } setBusy(false); }}
                >
                  {busy ? <span className="spinner" /> : <FileText size={14} strokeWidth={1.5} />} PDF
                </button>
              </div>
            )}
          </div>

          {!diff ? (
            <p className="py-16 text-graphite">Choose two different snapshots to compare.</p>
          ) : (
            <>
              <p className="mt-8 text-xs font-light text-muted">
                Between {fmtDate(snapshotDate(diff.from))} and {fmtDate(snapshotDate(diff.to))}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
                {SECTIONS.map((s, i) => {
                  const n = (diff[s.key] as string[]).length;
                  return (
                    <a
                      key={s.key}
                      href={`#${s.key}`}
                      className={`group bg-paper py-7 sm:py-9 ${i % 2 ? 'pl-5' : 'pr-5'} ${i % 4 === 0 ? 'sm:pl-0' : 'sm:pl-6'}`}
                    >
                      <p className="numeral text-4xl sm:text-5xl">{s.sign === 0 ? fmtNumber(n) : fmtSigned(n * s.sign)}</p>
                      <p className="eyebrow mt-3 text-muted transition-colors group-hover:text-ink">{s.label}</p>
                    </a>
                  );
                })}
              </div>

              <BeforeAfter from={diff.from} to={diff.to} />

              <div className="mt-16 space-y-0 border-t border-ink">
                {SECTIONS.map((s) => <ChangeList key={s.key} id={s.key} title={s.label} note={s.note} users={diff[s.key] as string[]} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Snapshot history ───────────────────────────────────── */}
      <section className="mt-24">
        <div className="flex items-end justify-between border-b border-ink pb-5">
          <h2 className="headline text-2xl sm:text-3xl">Saved snapshots</h2>
          <Link to="/analyze" className="label link-underline text-[0.625rem]">Add snapshot</Link>
        </div>
        <ul>
          {[...snapshots].reverse().map((s) => {
            const isActive = active?.id === s.id;
            return (
              <li key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-5 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <div>
                  <p className="text-[0.9375rem] font-medium">
                    {fmtDate(snapshotDate(s))}
                    {isActive && <span className="eyebrow ml-3 text-[0.625rem] text-muted">Viewing</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-light text-muted">
                    {s.exportDate ? 'Export date' : 'Uploaded'} · {s.source === 'zip' ? 'ZIP' : 'Files'}{s.owner ? ` · @${s.owner}` : ''}
                  </p>
                </div>
                <p className="hidden text-sm font-light tabular-nums sm:block">{fmtNumber(s.followers.length)} followers</p>
                <p className="hidden text-sm font-light tabular-nums sm:block">{fmtNumber(s.following.length)} following</p>
                <div className="flex items-center gap-1">
                  {!isActive && (
                    <button className="label link-underline mr-3 text-[0.625rem]" onClick={() => { setActive(s.id); toast(`Viewing ${fmtDate(snapshotDate(s))}`); }}>
                      View
                    </button>
                  )}
                  <button className="icon-btn text-muted hover:text-ink" onClick={() => setConfirmDelete(s)} aria-label={`Delete snapshot from ${fmtDate(snapshotDate(s))}`}>
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete snapshot">
        <p className="headline text-xl">Delete the {confirmDelete ? fmtDate(snapshotDate(confirmDelete)) : ''} snapshot?</p>
        <p className="lede mt-3 text-sm text-graphite">Its usernames will be erased from this device. This can't be undone.</p>
        <div className="mt-8 flex gap-3">
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => { if (confirmDelete) await removeSnapshot(confirmDelete.id); setConfirmDelete(null); toast('Snapshot deleted'); }}
          >
            Delete
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
        </div>
      </Modal>
    </Container>
  );
}

function ChangeList({ id, title, note, users }: { id: string; title: string; note: string; users: string[] }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(60);
  return (
    <div id={id} className="scroll-mt-28 border-b border-line">
      <button
        className="flex w-full items-center justify-between gap-4 py-6 text-left disabled:cursor-default"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!users.length}
      >
        <span>
          <span className="headline block text-base sm:text-lg">{title}</span>
          <span className="mt-1 block text-xs font-light text-muted">{note}</span>
        </span>
        <span className="flex items-center gap-5">
          <span className="numeral text-2xl tabular-nums">{fmtNumber(users.length)}</span>
          {users.length > 0 && (open ? <Minus size={16} strokeWidth={1.5} /> : <Plus size={16} strokeWidth={1.5} />)}
        </span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-500 ease-sheet" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <ul className="grid grid-cols-1 gap-x-8 pb-8 sm:grid-cols-2 lg:grid-cols-3">
            {users.slice(0, limit).map((u) => (
              <li key={u}>
                <a href={profileUrl(u)} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between border-b border-line py-3 text-sm">
                  <span className="truncate">@{u}</span>
                  <ArrowUpRight size={13} strokeWidth={1.5} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
          {users.length > limit && (
            <button className="label link-underline mb-8 text-[0.625rem]" onClick={() => setLimit((l) => l + 120)}>
              Show more ({fmtNumber(users.length - limit)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Before → after: the two networks side by side, with areas sized by the real counts. */
function BeforeAfter({ from, to }: { from: Snapshot; to: Snapshot }) {
  const { meta, settings } = useStore();
  const geo = (s: Snapshot) => (settings.geoEnabled ? summarizeGeo(analyze(s, meta), meta, 'followers', 'all') : null);
  const ga = useMemo(() => geo(from), [from, meta, settings.geoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const gb = useMemo(() => geo(to), [to, meta, settings.geoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(from.following.length, from.followers.length, to.following.length, to.followers.length, 1);
  const card = (s: Snapshot, label: string) => {
    const m = mutualSet(s).size;
    const r = (n: number) => 22 + 58 * Math.sqrt(n / max);
    const rf = r(s.following.length), rr = r(s.followers.length);
    return (
      <div className="rounded-[28px] bg-mist p-6">
        <p className="eyebrow text-muted">{label} · {fmtDate(snapshotDate(s))}</p>
        <svg viewBox="0 0 260 170" className="mt-3 w-full" aria-hidden="true">
          <circle cx={130 - rf * 0.45} cy="85" r={rf} fill="#000" fillOpacity="0.85" style={{ transition: 'all 800ms var(--ease-spring)' }} />
          <circle cx={130 + rr * 0.45} cy="85" r={rr} fill="none" stroke="#000" strokeWidth="1.5" style={{ transition: 'all 800ms var(--ease-spring)' }} />
        </svg>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <span><span className="block tabular-nums">{fmtNumber(s.following.length)}</span><span className="text-xs font-light text-muted">following</span></span>
          <span><span className="block tabular-nums">{fmtNumber(s.followers.length)}</span><span className="text-xs font-light text-muted">followers</span></span>
          <span><span className="block tabular-nums">{fmtNumber(m)}</span><span className="text-xs font-light text-muted">mutual</span></span>
        </div>
      </div>
    );
  };
  const geoChange = ga && gb && (ga.ranked.length || gb.ranked.length)
    ? { countries: gb.ranked.length - ga.ranked.length, top: gb.ranked[0] ? countryName(gb.ranked[0].code) : null, topWas: ga.ranked[0] ? countryName(ga.ranked[0].code) : null }
    : null;
  return (
    <section className="mt-10">
      <div className="grid gap-3 md:grid-cols-2">
        {card(from, 'Before')}
        {card(to, 'After')}
      </div>
      {geoChange && (
        <p className="mt-4 text-sm font-light text-graphite">
          Countries represented: {fmtSigned(geoChange.countries)}
          {geoChange.top && ` · Top country: ${geoChange.top}${geoChange.topWas && geoChange.topWas !== geoChange.top ? ` (was ${geoChange.topWas})` : ''}`}
        </p>
      )}
    </section>
  );
}
