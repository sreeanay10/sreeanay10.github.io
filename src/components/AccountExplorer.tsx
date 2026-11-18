import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Search, X } from 'lucide-react';
import type { Account, Category } from '../lib/types';
import { useStore, type ManualVerdict } from '../store';
import { Avatar, Select, VerifiedBadge, useCoarsePointer } from './ui';
import { HEADER_APP } from './Header';
import { copyUsernames, exportAccountsCsv, exportAccountsPdf, reasonLabel } from '../lib/export';
import { fmtCompact, fmtNumber, fmtUnixDate } from '../lib/format';

type Sort = 'az' | 'za' | 'followers-desc' | 'followers-asc' | 'recent' | 'oldest';
type Range = 'any' | 'lt1k' | '1k-10k' | '10k-100k' | 'gt100k' | 'unknown';
type CategoryFilter = 'all' | Category;

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'az', label: 'A – Z' },
  { value: 'za', label: 'Z – A' },
  { value: 'followers-desc', label: 'Most followers' },
  { value: 'followers-asc', label: 'Fewest followers' },
  { value: 'recent', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const RANGE_TESTS: Record<Range, (n: number | undefined) => boolean> = {
  any: () => true,
  lt1k: (n) => n !== undefined && n < 1000,
  '1k-10k': (n) => n !== undefined && n >= 1000 && n <= 10_000,
  '10k-100k': (n) => n !== undefined && n > 10_000 && n <= 100_000,
  gt100k: (n) => n !== undefined && n > 100_000,
  unknown: (n) => n === undefined,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  'not-following-back': 'Not following back',
  mutual: 'Mutual',
  excluded: 'Excluded',
  'needs-review': 'Needs review',
  fans: 'Follows you',
};
const CATEGORIES: readonly { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'not-following-back', label: 'Not following back' },
  { value: 'mutual', label: 'Mutual' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'fans', label: 'Follows you only' },
];

const PAGE = 80;

export function AccountExplorer({
  accounts, title, emptyTitle, emptyBody, reviewMode = false, showReason = false, categoryFilter = false, limit, dateLabel = 'Followed',
}: {
  accounts: Account[];
  title: string;
  emptyTitle: string;
  emptyBody?: string;
  reviewMode?: boolean;
  showReason?: boolean;
  /** Adds an in-page category filter and shows each row's category (used by “All accounts”). */
  categoryFilter?: boolean;
  limit?: number;
  dateLabel?: string;
}) {
  const { analysis, setVerdict, toast } = useStore();
  const coarse = useCoarsePointer();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('az');
  const range: Range = 'any';
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [intro, setIntro] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const q = useDeferredValue(query.trim().toLowerCase().replace(/^@/, ''));

  // Rows stagger in once, when the page opens — not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const test = RANGE_TESTS[range];
    let list = accounts.filter((a) => {
      if (categoryFilter && category !== 'all' && a.category !== category) return false;
      if (!test(a.meta?.followerCount)) return false;
      if (!q) return true;
      return a.username.includes(q) || (a.meta?.displayName?.toLowerCase().includes(q) ?? false);
    });
    const fc = (a: Account) => a.meta?.followerCount;
    const t = (a: Account) => a.followedAt ?? a.followerSince;
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'za': return b.username.localeCompare(a.username);
        case 'followers-desc': return (fc(b) ?? -1) - (fc(a) ?? -1) || a.username.localeCompare(b.username);
        case 'followers-asc': return (fc(a) ?? Infinity) - (fc(b) ?? Infinity) || a.username.localeCompare(b.username);
        case 'recent': return (t(b) ?? 0) - (t(a) ?? 0) || a.username.localeCompare(b.username);
        case 'oldest': return (t(a) ?? Infinity) - (t(b) ?? Infinity) || a.username.localeCompare(b.username);
        default: return a.username.localeCompare(b.username);
      }
    });
    return list;
  }, [accounts, q, sort, range, category, categoryFilter]);

  useEffect(() => setVisible(PAGE), [q, sort, range, category]);
  useEffect(() => {
    // Drop selections that left this list (e.g. after a verdict moved them).
    setSelected((s) => {
      const present = new Set(accounts.map((a) => a.username));
      const next = new Set([...s].filter((u) => present.has(u)));
      return next.size === s.size ? s : next;
    });
  }, [accounts]);

  useEffect(() => {
    if (limit) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible((v) => v + PAGE), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, filtered.length]);

  useEffect(() => {
    if (limit) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [limit]);

  const shown = filtered.slice(0, limit ?? visible);
  const context = analysis?.snapshot.owner ? `@${analysis.snapshot.owner}` : 'Your Instagram export';
  const filteredBy = Boolean(q) || range !== 'any' || (categoryFilter && category !== 'all');

  const onCopy = async () => {
    const ok = await copyUsernames(filtered);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast(`Copied ${fmtNumber(filtered.length)} ${filtered.length === 1 ? 'username' : 'usernames'}`);
    } else toast('Copy failed — your browser blocked clipboard access');
  };
  const bulk = (v: Exclude<ManualVerdict, 'unknown'>) => {
    const list = [...selected];
    setVerdict(list, v);
    setSelected(new Set());
    toast(`${fmtNumber(list.length)} ${list.length === 1 ? 'account' : 'accounts'} updated`);
  };
  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.username));

  return (
    <section>
      {!limit && (
        <>
          {/* Toolbar: a floating glass bar */}
          <div className="sticky z-30 -mx-2 sm:mx-0" style={{ top: HEADER_APP + 4 }}>
            {/* The glass is a background layer, so the export menu isn't nested inside it
                (nested backdrop-filters can't see through to the page). */}
            <div className="relative flex flex-col gap-1 p-1.5 lg:flex-row lg:items-center lg:gap-3">
              <div aria-hidden="true" className="glass glass-thick pointer-events-none absolute inset-0 rounded-[26px] lg:rounded-full" />
              <label className="relative flex flex-1 items-center rounded-full bg-black/[0.045] transition-colors focus-within:bg-paper focus-within:shadow-[0_0_0_1.5px_#000]">
                <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search accounts"
                  className="h-10 w-full rounded-full bg-transparent pl-10 pr-10 text-[0.9375rem] font-light placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                {query ? (
                  <button className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={15} strokeWidth={1.5} />
                  </button>
                ) : (
                  !coarse && <kbd className="absolute right-3 hidden rounded-md border border-line px-1.5 font-sans text-[0.625rem] text-muted lg:block">/</kbd>
                )}
              </label>
              <div className="relative flex flex-wrap items-center gap-1.5 px-0.5 lg:px-0">
                {categoryFilter && <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />}
                <Select label="Sort" value={sort} onChange={setSort} options={SORTS} />
                <div className="ml-auto flex items-center gap-1">
                  <button
                    className="label flex h-9 items-center gap-2 rounded-full px-3 text-[0.625rem] transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/5 active:scale-90 disabled:opacity-30"
                    onClick={onCopy}
                    disabled={!filtered.length}
                    aria-label="Copy usernames"
                  >
                    {copied ? <Check size={15} strokeWidth={1.5} /> : <Copy size={15} strokeWidth={1.5} />}
                    <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <ExportMenu
                    disabled={!filtered.length}
                    onCsv={() => exportAccountsCsv(title, filtered)}
                    onPdf={() => exportAccountsPdf(title, filtered, context)}
                    onError={() => toast('Export failed — please try again')}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[3.5rem] items-center justify-between gap-4 py-3">
            <p className="eyebrow tabular-nums text-muted" aria-live="polite">
              {filteredBy ? `${fmtNumber(filtered.length)} of ${fmtNumber(accounts.length)}` : `${fmtNumber(accounts.length)} ${accounts.length === 1 ? 'account' : 'accounts'}`}
            </p>
            {reviewMode && filtered.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 text-xs text-graphite">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-black"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((a) => a.username)))}
                />
                Select all
              </label>
            )}
          </div>
        </>
      )}

      {filtered.length === 0 ? (
        <div className="border-t border-line py-20 text-center">
          <p className="headline text-xl">{accounts.length && filteredBy ? 'No matches' : emptyTitle}</p>
          {(emptyBody || q) && (
            <p className="lede mx-auto mt-3 max-w-md text-sm text-muted">{q ? `Nothing matches “${query}”.` : emptyBody}</p>
          )}
        </div>
      ) : (
        <ul className="border-t border-line">
          {shown.map((a, idx) => (
            <AccountRow
              key={a.username}
              a={a}
              animateDelay={intro && idx < 20 ? idx * 22 : null}
              reviewMode={reviewMode}
              showReason={showReason}
              showCategory={categoryFilter}
              dateLabel={dateLabel}
              selected={selected.has(a.username)}
              onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(a.username)) n.delete(a.username); else n.add(a.username); return n; })}
              onEdit={() => undefined}
              onVerdict={(v) => { setVerdict([a.username], v); toast(`@${a.username} → ${v === 'regular' ? 'Not following back' : 'Excluded'}`); }}
            />
          ))}
        </ul>
      )}
      {!limit && shown.length < filtered.length && (
        <div ref={sentinel} className="flex justify-center py-10"><span className="spinner text-muted" /></div>
      )}

      {/* Bulk actions for selected accounts */}
      {reviewMode && createPortal(
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{
            bottom: 'max(1rem, env(safe-area-inset-bottom))',
            transform: selected.size ? 'none' : 'translateY(140%) scale(0.8)',
            opacity: selected.size ? 1 : 0,
            pointerEvents: selected.size ? 'auto' : 'none',
            transition: 'transform 650ms var(--ease-spring), opacity 300ms var(--ease-out)',
          }}
          aria-hidden={!selected.size}
        >
          <div className="glass-dark flex w-full max-w-2xl items-center gap-1 rounded-full py-1.5 pl-5 pr-1.5 text-paper sm:gap-2">
            <span className="label mr-auto pl-1 text-[0.625rem] tabular-nums">{fmtNumber(selected.size)} selected</span>
            {([['regular', 'Regular'], ['verified', 'Verified'], ['over-threshold', '50K+']] as const).map(([v, l]) => (
              <button key={v} tabIndex={selected.size ? 0 : -1} className="label h-10 rounded-full px-3 text-[0.625rem] transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-white/10 active:scale-90 sm:px-4" onClick={() => bulk(v)}>{l}</button>
            ))}
            <button tabIndex={selected.size ? 0 : -1} className="icon-btn text-paper hover:bg-paper/10" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X size={16} /></button>
          </div>
        </div>,
        document.body,
      )}

    </section>
  );
}

/** Export popover, scaling out of the button that opened it. */
function ExportMenu({ disabled, onCsv, onPdf, onError }: { disabled: boolean; onCsv: () => void; onPdf: () => Promise<void>; onError: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const item = 'flex w-full items-center justify-between gap-6 rounded-[14px] px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10';
  return (
    <div ref={ref} className="relative">
      <button
        className="label flex h-9 items-center gap-2 rounded-full px-3 text-[0.625rem] transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/5 active:scale-90 disabled:opacity-30"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export"
      >
        {busy ? <span className="spinner" /> : <Download size={15} strokeWidth={1.5} />}
        <span className="hidden sm:inline">Export</span>
      </button>
      <div
        role="menu"
        aria-hidden={!open}
        className="glass glass-thick absolute right-0 top-full z-40 mt-2 w-56 origin-top-right rounded-[20px] p-1.5"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'none' : 'scale(0.6)',
          pointerEvents: open ? 'auto' : 'none',
          transition: `opacity ${open ? 140 : 200}ms var(--ease-out), transform ${open ? 560 : 300}ms ${open ? 'var(--ease-spring)' : 'var(--ease-sheet)'}`,
        }}
      >
        <button role="menuitem" tabIndex={open ? 0 : -1} className={item} onClick={() => { setOpen(false); onCsv(); }}>
          Spreadsheet <span className="label text-[0.625rem] text-muted">CSV</span>
        </button>
        <button
          role="menuitem"
          tabIndex={open ? 0 : -1}
          className={item}
          onClick={async () => {
            setOpen(false);
            setBusy(true);
            try { await onPdf(); } catch { onError(); } finally { setBusy(false); }
          }}
        >
          Report <span className="label text-[0.625rem] text-muted">PDF</span>
        </button>
      </div>
    </div>
  );
}

function AccountRow({ a, animateDelay, reviewMode, showReason, showCategory, dateLabel, selected, onToggle, onEdit, onVerdict }: {
  a: Account;
  animateDelay: number | null;
  reviewMode: boolean;
  showReason: boolean;
  showCategory: boolean;
  dateLabel: string;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onVerdict: (v: Exclude<ManualVerdict, 'unknown'>) => void;
}) {
  const m = a.meta;
  const date = a.followedAt ?? a.followerSince;
  const followers = m?.followerCount !== undefined ? fmtCompact(m.followerCount) : m?.confirmedOverThreshold ? '50K+' : null;
  const note = showCategory
    ? [CATEGORY_LABEL[a.category], a.reasons.length ? reasonLabel(a) : ''].filter(Boolean).join(' · ')
    : showReason && a.reasons.length
      ? reasonLabel(a)
      : '';
  const subline = [m?.displayName, note].filter(Boolean).join(' · ');
  return (
    <li
      className={`group relative isolate grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-3.5 sm:grid-cols-[auto_minmax(0,2.2fr)_1fr_auto] sm:gap-6 sm:py-4
        before:absolute before:inset-y-1 before:-inset-x-3 before:-z-10 before:rounded-[18px] before:bg-mist before:opacity-0 before:transition-[opacity,transform] before:duration-300
        hover:before:opacity-100 active:before:scale-[0.98] active:before:bg-line has-[a:focus-visible]:before:opacity-100 has-[a:focus-visible]:before:ring-1 has-[a:focus-visible]:before:ring-ink ${animateDelay !== null ? 'row-in' : ''}`}
      style={animateDelay !== null ? { animationDelay: `${animateDelay}ms` } : undefined}
    >
      <div className="flex items-center gap-3">
        {reviewMode && (
          <input type="checkbox" className="relative z-10 h-4 w-4 accent-black" checked={selected} onChange={onToggle} aria-label={`Select ${a.username}`} />
        )}
        <Avatar name={a.username} flip />
      </div>
      {/* The whole row opens the profile; controls sit above the stretched link. */}
      <a
        href={a.href}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 focus-visible:outline-none after:absolute after:inset-0"
        aria-label={`Open @${a.username} on Instagram`}
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.9375rem] font-medium">{a.username}</span>
          {m?.verified && <VerifiedBadge />}

        </span>
        <span className="mt-0.5 block truncate text-[0.8125rem] font-light text-muted">
          {subline || ' '}
          {followers && <span className="sm:hidden">{subline ? ' · ' : ''}{followers}</span>}
        </span>
      </a>
      <div className="hidden text-sm sm:block">
        <span className="eyebrow block text-[0.625rem] text-muted">{dateLabel}</span>
        <span className="font-light tabular-nums">{fmtUnixDate(date)}</span>
      </div>
      <div className="relative z-10 flex items-center gap-1">
        {reviewMode && (
          <div className="mr-3 hidden items-center gap-5 lg:flex">
            {([['regular', 'Regular'], ['verified', 'Verified'], ['over-threshold', '50K+']] as const).map(([v, l]) => (
              <button key={v} className="label text-[0.625rem] text-muted transition-colors hover:text-ink" onClick={() => onVerdict(v)}>{l}</button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

