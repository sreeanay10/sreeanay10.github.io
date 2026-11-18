import { useMemo, useState } from 'react';
import { Check, Search, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Modal } from './ui';
import type { Group } from '../lib/types';

/** Edit a group: rename it and add or remove accounts by searching. */
export function GroupEditor({ group, pool, onClose }: { group: Group | null; pool: string[]; onClose: () => void }) {
  const { groups, renameGroup, deleteGroup, setMembership } = useStore();
  const live = group ? groups.find((g) => g.id === group.id) ?? null : null;
  const [q, setQ] = useState('');
  const [name, setName] = useState(group?.name ?? '');
  const members = useMemo(() => new Set(live?.members ?? []), [live]);
  const term = q.trim().toLowerCase().replace(/^@/, '');
  const list = useMemo(() => {
    const base = term ? pool.filter((u) => u.includes(term)) : [...members, ...pool.filter((u) => !members.has(u))];
    return base.slice(0, 80);
  }, [pool, term, members]);

  return (
    <Modal open={!!group} onClose={onClose} title={live?.kind === 'circle' ? 'Edit circle' : 'Edit collection'}>
      {live && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => renameGroup(live.id, name)}
            className="headline w-full bg-transparent text-2xl focus:outline-none"
            aria-label="Name"
            maxLength={40}
          />
          <p className="mt-1 text-xs text-muted">{live.members.length} {live.members.length === 1 ? 'account' : 'accounts'}</p>
          <label className="relative mt-6 flex items-center">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts" className="field pl-10" autoCapitalize="none" spellCheck={false} />
          </label>
          <ul className="mt-4 max-h-[42vh] space-y-1 overflow-y-auto overscroll-contain">
            {list.map((u) => {
              const on = members.has(u);
              return (
                <li key={u}>
                  <button
                    onClick={() => setMembership(live.id, [u], !on)}
                    className="flex w-full items-center gap-3 rounded-[16px] px-2 py-2 text-left text-sm transition-colors hover:bg-black/5"
                    aria-pressed={on}
                  >
                    <Avatar name={u} size={32} />
                    <span className="flex-1 truncate">@{u}</span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] ${on ? 'scale-100 bg-ink text-paper' : 'scale-90 bg-black/[0.06] text-transparent'}`}>
                      <Check size={13} strokeWidth={2.2} />
                    </span>
                  </button>
                </li>
              );
            })}
            {!list.length && <li className="px-2 py-6 text-sm text-muted">No matches.</li>}
          </ul>
          <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
            <button className="label flex items-center gap-2 text-[0.625rem] text-muted hover:text-ink" onClick={() => { deleteGroup(live.id); onClose(); }}>
              <Trash2 size={14} strokeWidth={1.5} /> Delete
            </button>
            <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}
