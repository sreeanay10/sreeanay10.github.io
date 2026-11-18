import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react';
import { useStore } from '../store';
import { smartSearch, SUGGESTIONS, type SearchResult } from '../lib/smartSearch';
import { fmtNumber } from '../lib/format';
import { profileUrl } from '../lib/username';

/** ⌘K Smart Search: ask in plain English, answered only from your own data. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { analysis, snapshots, latestDiff, meta, settings } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const query = useDeferredValue(q);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => { setShown(true); input.current?.focus(); });
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => { setMounted(false); setQ(''); }, 380);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const result: SearchResult | null = useMemo(() => {
    if (!analysis || !query.trim()) return null;
    return smartSearch(query, { analysis, snapshots, latestDiff, meta, geoEnabled: settings.geoEnabled });
  }, [analysis, query, snapshots, latestDiff, meta, settings.geoEnabled]);

  const go = (to: string) => { onClose(); navigate(to); };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Smart search">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
        style={{ opacity: shown ? 1 : 0, transition: 'opacity 300ms var(--ease-out)' }}
        onClick={onClose}
      />
      <div
        className="relative h-fit w-[min(100%,40rem)]"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? 'none' : 'translateY(-12px) scale(0.94)',
          transition: `opacity 220ms var(--ease-out), transform ${shown ? 600 : 260}ms ${shown ? 'var(--ease-spring)' : 'var(--ease-sheet)'}`,
        }}
      >
        <div aria-hidden="true" className="glass glass-thick pointer-events-none absolute inset-0 rounded-[30px]" />
        <div className="relative p-2">
          <label className="flex items-center gap-3 rounded-[22px] bg-paper/80 px-5">
            <Search size={20} strokeWidth={1.5} className="shrink-0 text-muted" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={analysis ? 'Ask about your network…' : 'Upload your export first'}
              disabled={!analysis}
              className="h-16 w-full bg-transparent text-lg font-light placeholder:text-muted focus:outline-none"
              aria-label="Ask a question"
              autoComplete="off"
              spellCheck={false}
            />
            {q ? (
              <button className="icon-btn h-9 w-9 shrink-0 text-muted" onClick={() => setQ('')} aria-label="Clear"><X size={16} strokeWidth={1.5} /></button>
            ) : (
              <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 font-sans text-[0.625rem] text-muted sm:block">esc</kbd>
            )}
          </label>

          <div className="max-h-[58vh] overflow-y-auto overscroll-contain px-3 pb-2 pt-4">
            {!analysis ? (
              <div className="px-2 pb-4">
                <button className="btn btn-primary btn-sm" onClick={() => go('/analyze')}>Analyze my account</button>
              </div>
            ) : !result || result.kind === 'help' ? (
              <>
                {result && (
                  <div className="px-2 pb-4">
                    <p className="headline text-base">{result.title}</p>
                    {result.detail && <p className="mt-1 text-sm font-light text-muted">{result.detail}</p>}
                  </div>
                )}
                <p className="eyebrow px-2 text-muted">Try</p>
                <div className="mt-3 flex flex-wrap gap-2 px-1 pb-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setQ(s)}
                      className="rounded-full bg-black/[0.05] px-4 py-2 text-left text-sm transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] hover:bg-black/[0.09] active:scale-95"
                      style={{ animation: `rise 500ms var(--ease-spring) ${i * 30}ms backwards` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <Answer result={result} onOpen={go} />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Answer({ result, onOpen }: { result: Exclude<SearchResult, { kind: 'help' }>; onOpen: (to: string) => void }) {
  return (
    <div className="px-2 pb-2" style={{ animation: 'rise 420ms var(--ease-sheet) backwards' }}>
      <div className="flex items-end justify-between gap-4">
        <p className="headline text-base leading-tight">{result.title}</p>
        {result.link && (
          <button className="label flex shrink-0 items-center gap-1.5 text-[0.625rem] hover:opacity-60" onClick={() => onOpen(result.link!)}>
            Open <ArrowRight size={13} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {result.kind === 'stat' && (
        <>
          <p className="numeral mt-4 text-6xl">{result.value}</p>
          {result.detail && <p className="mt-2 text-sm font-light text-muted">{result.detail}</p>}
        </>
      )}
      {result.kind === 'list' && (
        <>
          <p className="mt-1 text-sm font-light text-muted">
            {fmtNumber(result.total)} {result.total === 1 ? 'account' : 'accounts'}
            {result.note ? ` · ${result.note}` : ''}
          </p>
          {result.usernames.length > 0 ? (
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {result.usernames.map((u) => (
                <li key={u}>
                  <a href={profileUrl(u)} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-[14px] px-3 py-2 text-sm transition-colors hover:bg-black/5">
                    <span className="truncate">@{u}</span>
                    <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-graphite">None.</p>
          )}
          {result.total > result.usernames.length && result.link && (
            <button className="label mt-3 px-3 text-[0.625rem] text-muted hover:text-ink" onClick={() => onOpen(result.link!)}>
              + {fmtNumber(result.total - result.usernames.length)} more
            </button>
          )}
        </>
      )}
      {result.kind === 'countries' && (
        <>
          <ul className="mt-4 space-y-3">
            {result.rows.map((r) => (
              <li key={r.name}>
                <div className="flex justify-between text-sm"><span>{r.name}</span><span className="tabular-nums text-muted">{fmtNumber(r.value)} · {r.share.toFixed(0)}%</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-ink" style={{ width: `${r.share}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-light text-muted">{result.detail}</p>
        </>
      )}
    </div>
  );
}
