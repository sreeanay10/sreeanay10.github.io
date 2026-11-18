import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, Modal, PageHeader } from '../components/ui';
import { GroupEditor } from '../components/GroupEditor';
import { hash } from '../lib/layout';
import { profileUrl } from '../lib/username';
import type { Account, Group } from '../lib/types';

const SUGGESTED = ['Friends', 'Family', 'Creators', 'Brands', 'Public Figures'];
const TAG: Record<Account['category'], string> = {
  mutual: 'Mutual', 'not-following-back': 'Not following back', 'needs-review': 'Unconfirmed', excluded: 'Excluded', fans: 'Follows you',
};
const PAGE = 60;

/** Account Museum: the accounts you follow as an editorial gallery, sorted into your own collections. */
export default function Museum() {
  const { analysis, groups, createGroup, setMembership } = useStore();
  const [active, setActive] = useState<string>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Group | null>(null);
  const [placing, setPlacing] = useState<Account | null>(null);
  const [newName, setNewName] = useState('');
  const collections = groups.filter((g) => g.kind === 'collection');

  const following = useMemo(() => (analysis ? [...analysis.mutual, ...analysis.notFollowingBack, ...analysis.needsReview, ...analysis.excluded] : []), [analysis]);
  const pool = useMemo(() => following.map((a) => a.username).sort(), [following]);
  const shown = useMemo(() => {
    const col = collections.find((c) => c.id === active);
    const set = col ? new Set(col.members) : null;
    const term = q.trim().toLowerCase().replace(/^@/, '');
    return following
      .filter((a) => (!set || set.has(a.username)) && (!term || a.username.includes(term) || a.meta?.displayName?.toLowerCase().includes(term)))
      .sort((x, y) => x.username.localeCompare(y.username));
  }, [following, collections, active, q]);

  if (!analysis) return <Container><EmptyData /></Container>;
  const add = (name: string) => { const id = createGroup(name, 'collection'); setActive(id); setNewName(''); };
  const current = collections.find((c) => c.id === active);

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Account Museum">Everyone you follow, on display. Sort them into collections.</PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Chip on={active === 'all'} onClick={() => setActive('all')}>All <span className="opacity-50">{following.length}</span></Chip>
        {collections.map((c) => (
          <Chip key={c.id} on={active === c.id} onClick={() => setActive(c.id)}>{c.name} <span className="opacity-50">{c.members.length}</span></Chip>
        ))}
        <form className="flex items-center" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add(newName); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New collection" className="h-10 w-36 rounded-full bg-black/[0.045] px-4 text-sm focus:bg-paper focus:outline-none focus:ring-[1.5px] focus:ring-ink" />
          <button className="icon-btn ml-1" aria-label="Create collection" disabled={!newName.trim()}><Plus size={17} strokeWidth={1.5} /></button>
        </form>
      </div>
      {!collections.length && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          Suggestions:
          {SUGGESTED.map((s) => <button key={s} className="rounded-full border border-dashed border-stone/60 px-3 py-1.5 hover:border-ink hover:text-ink" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the museum" className="field max-w-sm" autoCapitalize="none" spellCheck={false} />
        {current && <button className="btn btn-outline btn-sm" onClick={() => setEditing(current)}>Edit “{current.name}”</button>}
      </div>

      {shown.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">{current ? 'This collection is empty — tap an account in All to add it.' : 'No accounts match.'}</p>
      ) : (
        <ul className="mt-8 grid auto-rows-[11rem] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:grid-cols-3 lg:grid-cols-4">
          {shown.slice(0, limit).map((a, i) => {
            const h = hash(a.username);
            const tall = h % 5 === 0;
            return (
              <li key={a.username} className={tall ? 'row-span-2' : ''} style={{ animation: i < 24 ? `rise 650ms var(--ease-spring) ${i * 30}ms backwards` : undefined }}>
                <button
                  onClick={() => setPlacing(a)}
                  className={`group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[28px] p-5 text-left transition-[transform,box-shadow] duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)] ${
                    h % 3 === 0 ? 'bg-ink text-paper' : 'bg-mist'
                  }`}
                >
                  <span className={`display block leading-none transition-transform duration-700 [transition-timing-function:var(--ease-spring)] group-hover:scale-110 ${tall ? 'text-[7rem]' : 'text-6xl'} ${h % 3 === 0 ? 'text-paper/90' : 'text-ink/85'}`} style={{ transformOrigin: 'left top' }}>
                    {(a.username.replace(/[^a-z0-9]/gi, '')[0] ?? '·').toUpperCase()}
                  </span>
                  <span>
                    <span className="block truncate text-sm font-medium">@{a.username}</span>
                    <span className={`label mt-1 block text-[0.625rem] ${h % 3 === 0 ? 'text-paper/50' : 'text-muted'}`}>{TAG[a.category]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <div className="mt-10 flex justify-center"><button className="btn btn-outline" onClick={() => setLimit((l) => l + PAGE)}>Show more</button></div>
      )}

      {/* Place an account into collections */}
      <Modal open={!!placing} onClose={() => setPlacing(null)} title="Collections">
        {placing && (
          <>
            <a href={profileUrl(placing.username)} target="_blank" rel="noopener noreferrer" className="headline inline-flex items-center gap-2 break-all text-2xl">@{placing.username} <ArrowUpRight size={18} strokeWidth={1.5} /></a>
            <p className="mt-1 text-xs text-muted">{TAG[placing.category]}</p>
            {collections.length ? (
              <ul className="mt-6 space-y-2">
                {collections.map((c) => {
                  const on = c.members.includes(placing.username);
                  return (
                    <li key={c.id}>
                      <button onClick={() => setMembership(c.id, [placing.username], !on)} className={`flex w-full items-center justify-between rounded-full px-5 py-3 text-sm transition-colors ${on ? 'bg-ink text-paper' : 'bg-black/[0.05] hover:bg-black/[0.08]'}`} aria-pressed={on}>
                        {c.name} <span className="text-xs opacity-60">{on ? 'Added' : 'Add'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-6 text-sm text-muted">Create a collection first.</p>
            )}
          </>
        )}
      </Modal>
      <GroupEditor key={editing?.id ?? 'none'} group={editing} pool={pool} onClose={() => setEditing(null)} />
    </Container>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-[background-color,color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-95 ${on ? 'bg-ink text-paper' : 'bg-black/[0.05] hover:bg-black/[0.08]'}`}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}
