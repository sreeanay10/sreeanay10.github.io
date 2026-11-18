import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, Modal, PageHeader, Select } from '../components/ui';
import { Roll } from '../components/motion';
import { HealthReport } from '../components/Health';
import { snapshotDate, mutualSet } from '../lib/analysis';
import { healthScore } from '../lib/health';
import { fmtDate, fmtNumber } from '../lib/format';
import type { Snapshot } from '../lib/types';

type Sort = 'new' | 'old' | 'name';

/** Memory Vault: your saved exports — name them, annotate them, revisit and compare. */
export default function Vault() {
  const { snapshots, active, setActive, removeSnapshot, updateSnapshot, toast } = useStore();
  const navigate = useNavigate();
  const [sort, setSort] = useState<Sort>('new');
  const [picked, setPicked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Snapshot | null>(null);

  const list = useMemo(() => {
    const l = [...snapshots];
    if (sort === 'name') l.sort((a, b) => (a.name || '~').localeCompare(b.name || '~'));
    else l.sort((a, b) => (sort === 'new' ? snapshotDate(b) - snapshotDate(a) : snapshotDate(a) - snapshotDate(b)));
    return l;
  }, [snapshots, sort]);

  if (!snapshots.length) return <Container><EmptyData /></Container>;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const compare = () => {
    const [a, b] = picked.map((id) => snapshots.find((s) => s.id === id)!).sort((x, y) => snapshotDate(x) - snapshotDate(y));
    navigate(`/activity?from=${a.id}&to=${b.id}`);
  };

  return (
    <Container className="page-enter pb-32">
      <PageHeader
        title="Memory Vault"
        aside={<Select label="Sort" value={sort} onChange={setSort} options={[{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }, { value: 'name', label: 'Name' }]} />}
      >
        Every export you’ve saved. Name them, add notes, look back.
      </PageHeader>

      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((s, i) => (
          <VaultCard
            key={s.id}
            s={s}
            index={i}
            isActive={active?.id === s.id}
            picked={picked.includes(s.id)}
            onPick={() => toggle(s.id)}
            onView={() => { setActive(s.id); navigate('/dashboard'); }}
            onDelete={() => setDeleting(s)}
            onSave={(patch) => updateSnapshot(s.id, patch)}
          />
        ))}
      </ul>

      {createPortal(
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{
            bottom: 'max(1rem, env(safe-area-inset-bottom))',
            transform: picked.length ? 'none' : 'translateY(140%) scale(0.8)',
            opacity: picked.length ? 1 : 0,
            pointerEvents: picked.length ? 'auto' : 'none',
            transition: 'transform 650ms var(--ease-spring), opacity 300ms var(--ease-out)',
          }}
        >
          <div className="glass-dark flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-paper">
            <span className="label text-[0.625rem]">{picked.length === 2 ? '2 selected' : 'Pick one more'}</span>
            <button className="btn btn-inverse btn-sm h-10" disabled={picked.length < 2} onClick={compare}>
              <Roll>Compare</Roll> <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>,
        document.body,
      )}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete snapshot">
        <p className="headline text-xl">Delete {deleting?.name || (deleting ? fmtDate(snapshotDate(deleting)) : '')}?</p>
        <p className="mt-2 text-sm font-light text-muted">This can’t be undone.</p>
        <div className="mt-8 flex gap-3">
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => { if (deleting) await removeSnapshot(deleting.id); setPicked((p) => p.filter((x) => x !== deleting?.id)); setDeleting(null); toast('Snapshot deleted'); }}
          >
            Delete
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setDeleting(null)}>Cancel</button>
        </div>
      </Modal>
    </Container>
  );
}

function VaultCard({ s, index, isActive, picked, onPick, onView, onDelete, onSave }: {
  s: Snapshot;
  index: number;
  isActive: boolean;
  picked: boolean;
  onPick: () => void;
  onView: () => void;
  onDelete: () => void;
  onSave: (patch: Pick<Snapshot, 'name' | 'note'>) => void;
}) {
  const [name, setName] = useState(s.name ?? '');
  const [note, setNote] = useState(s.note ?? '');
  const [health, setHealth] = useState(false);
  const mutual = useMemo(() => mutualSet(s).size, [s]);
  const score = s.health ? healthScore(s.health) : null;
  const save = () => { if ((name || '') !== (s.name || '') || (note || '') !== (s.note || '')) onSave({ name: name.trim() || undefined, note: note.trim() || undefined }); };

  return (
    <li
      className={`group relative rounded-[32px] p-7 transition-[background-color,box-shadow,transform] duration-500 [transition-timing-function:var(--ease-spring)] ${
        picked ? 'bg-paper shadow-[inset_0_0_0_2px_#000]' : 'bg-mist hover:-translate-y-1'
      }`}
      style={{ animation: `rise 650ms var(--ease-spring) ${index * 60}ms backwards` }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="eyebrow text-muted">
          {fmtDate(snapshotDate(s), { month: 'long', day: 'numeric', year: 'numeric' })}
          {isActive && ' · Viewing'}
        </p>
        <button
          onClick={onPick}
          aria-pressed={picked}
          aria-label="Select to compare"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-90 ${picked ? 'bg-ink text-paper' : 'bg-black/[0.06] text-transparent hover:text-muted'}`}
        >
          <Check size={14} strokeWidth={2} />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="Name this snapshot"
        aria-label="Snapshot name"
        className="headline mt-3 w-full bg-transparent text-2xl placeholder:text-black/25 focus:outline-none sm:text-3xl"
        maxLength={60}
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        placeholder="Add a note"
        aria-label="Note"
        rows={2}
        className="mt-2 w-full resize-none bg-transparent text-sm font-light text-graphite placeholder:text-muted focus:outline-none"
        maxLength={240}
      />
      <div className="mt-4 flex gap-6 text-sm">
        <span><span className="tabular-nums">{fmtNumber(s.followers.length)}</span> <span className="font-light text-muted">followers</span></span>
        <span><span className="tabular-nums">{fmtNumber(s.following.length)}</span> <span className="font-light text-muted">following</span></span>
        <span><span className="tabular-nums">{fmtNumber(mutual)}</span> <span className="font-light text-muted">mutual</span></span>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" onClick={onView}><Roll>View</Roll></button>
        {s.health && (
          <button className="btn btn-outline btn-sm" onClick={() => setHealth((h) => !h)}>
            <span className={`h-2 w-2 rounded-full ${score === 'ok' ? 'bg-ink' : 'bg-transparent ring-1 ring-ink'}`} />
            {score === 'ok' ? 'Healthy' : 'Check data'}
          </button>
        )}
        <button className="icon-btn ml-auto text-muted hover:text-ink" onClick={onDelete} aria-label="Delete snapshot"><Trash2 size={16} strokeWidth={1.5} /></button>
      </div>
      {s.health && (
        <div className="grid transition-[grid-template-rows] duration-500 ease-sheet" style={{ gridTemplateRows: health ? '1fr' : '0fr' }}>
          <div className="overflow-hidden"><div className="pt-5"><HealthReport report={s.health} /></div></div>
        </div>
      )}
    </li>
  );
}
