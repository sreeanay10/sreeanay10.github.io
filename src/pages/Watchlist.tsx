import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search, Star } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Container, EmptyData, PageHeader } from '../components/ui';
import { accountTimeline, eventWindow, knownUsernames, REL_LABEL } from '../lib/history';
import { fmtDate } from '../lib/format';
import { normalizeUsername, profileUrl } from '../lib/username';

/** Watchlist + Relationship Detective: follow any account's history across your snapshots. */
export default function Watchlist() {
  const { snapshots, watchlist, toggleWatch } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const known = useMemo(() => knownUsernames(snapshots), [snapshots]);
  const u = params.get('u');
  const term = normalizeUsername(q) ?? q.trim().toLowerCase().replace(/^@/, '');
  const matches = useMemo(() => (term ? known.filter((x) => x.includes(term)).slice(0, 8) : []), [known, term]);

  if (!snapshots.length) return <Container><EmptyData /></Container>;
  const investigate = (name: string) => { setParams({ u: name }); setQ(''); };

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Watchlist" aside={
        <div className="relative w-full lg:w-80">
          <label className="glass relative flex items-center rounded-full">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) investigate(matches[0]); }}
              placeholder="Investigate any account"
              aria-label="Investigate any account"
              className="h-12 w-full rounded-full bg-transparent pl-11 pr-4 text-base font-light placeholder:text-muted focus:outline-none"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          {matches.length > 0 && (
            <ul className="glass glass-thick absolute inset-x-0 top-full z-40 mt-2 rounded-[22px] p-1.5" style={{ animation: 'rise 400ms var(--ease-spring) backwards' }}>
              {matches.map((m) => (
                <li key={m}>
                  <button className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sm hover:bg-black/5" onClick={() => investigate(m)}>
                    <Avatar name={m} size={26} /> @{m}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      }>
        Star accounts to track them. Investigate anyone’s history.
      </PageHeader>

      {u && <Detective username={u} starred={watchlist.includes(u)} onStar={() => toggleWatch(u)} snapshotsCount={snapshots.length} />}

      <section className="mt-14">
        <h2 className="headline text-xl">Starred</h2>
        {watchlist.length === 0 ? (
          <p className="mt-3 text-sm font-light text-muted">No accounts yet — tap the star on any account.</p>
        ) : (
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {watchlist.map((w, i) => {
              const t = accountTimeline(w, snapshots);
              return (
                <li key={w} className="flex items-center gap-4 rounded-[24px] bg-mist p-4 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-0.5" style={{ animation: `rise 600ms var(--ease-spring) ${i * 40}ms backwards` }}>
                  <Avatar name={w} size={44} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => investigate(w)}>
                    <span className="block truncate font-medium">@{w}</span>
                    <span className="block text-xs font-light text-muted">{REL_LABEL[t.current]}</span>
                  </button>
                  <Dots t={t} />
                  <button className="icon-btn" onClick={() => toggleWatch(w)} aria-label={`Unstar ${w}`}><Star size={17} strokeWidth={1.5} fill="#000" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Container>
  );
}

function Dots({ t }: { t: ReturnType<typeof accountTimeline> }) {
  return (
    <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
      {t.points.slice(-8).map((p, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${p.rel === 'mutual' ? 'bg-ink' : p.rel === 'none' ? 'bg-black/10' : 'bg-transparent ring-[1.5px] ring-ink'}`} />
      ))}
    </span>
  );
}

function Detective({ username, starred, onStar, snapshotsCount }: { username: string; starred: boolean; onStar: () => void; snapshotsCount: number }) {
  const { snapshots } = useStore();
  const t = useMemo(() => accountTimeline(username, snapshots), [username, snapshots]);
  const facts: [string, number | null][] = [
    ['First in your following', t.firstInFollowing],
    ['Last in your following', t.lastInFollowing],
    ['First in your followers', t.firstInFollowers],
    ['Last in your followers', t.lastInFollowers],
  ];
  return (
    <section key={username} className="rounded-[32px] bg-ink p-7 text-paper sm:p-10" style={{ animation: 'rise 650ms var(--ease-spring) backwards' }} data-header-theme="dark">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-paper/50">Relationship detective</p>
          <h2 className="display mt-3 break-all text-4xl sm:text-5xl">@{username}</h2>
          <p className="mt-3 text-sm text-paper/70">Now: {REL_LABEL[t.current]}</p>
        </div>
        <div className="flex gap-2">
          <a href={profileUrl(username)} target="_blank" rel="noopener noreferrer" className="btn glass-dark btn-sm text-paper">Profile <ArrowUpRight size={14} strokeWidth={1.5} /></a>
          <button className={`btn btn-sm ${starred ? 'btn-inverse' : 'glass-dark text-paper'}`} onClick={onStar}>
            <Star size={14} strokeWidth={1.5} fill={starred ? '#000' : 'none'} /> {starred ? 'Starred' : 'Star'}
          </button>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-[20px] bg-white/[0.07] p-4">
            <dt className="eyebrow text-[0.625rem] text-paper/50">{k}</dt>
            <dd className="mt-2 text-lg">{v ? fmtDate(v) : '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs font-light text-paper/50">Dates are when your exports were taken, not the exact moment something happened.</p>

      {/* Timeline track */}
      <div className="mt-8 overflow-x-auto [scrollbar-width:none]">
        <div className="min-w-max">
          {(['youFollow', 'followsYou'] as const).map((k) => (
            <div key={k} className="flex items-center gap-4 py-2">
              <span className="label w-24 shrink-0 text-[0.625rem] text-paper/50">{k === 'youFollow' ? 'You follow' : 'Follows you'}</span>
              <div className="flex items-center gap-6">
                {t.points.map((p, i) => (
                  <span key={i} className="relative flex w-16 justify-center">
                    <span className={`h-3.5 w-3.5 rounded-full transition-transform ${p[k] ? 'bg-paper' : 'ring-1 ring-paper/30'}`} style={{ animation: `marker-pop 600ms cubic-bezier(0.3,1.5,0.5,1) ${i * 60}ms backwards` }} />
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4 pt-1">
            <span className="w-24 shrink-0" />
            <div className="flex gap-6">
              {t.points.map((p, i) => <span key={i} className="w-16 text-center text-[0.625rem] text-paper/50">{fmtDate(p.date, { month: 'short', day: 'numeric' })}</span>)}
            </div>
          </div>
        </div>
      </div>

      {t.events.length > 0 && (
        <ul className="mt-8 space-y-2 border-t border-white/10 pt-6">
          {t.events.map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-6 text-sm">
              <span>{e.text}</span>
              <span className="font-light text-paper/50">{eventWindow(e)}</span>
            </li>
          ))}
        </ul>
      )}
      {snapshotsCount < 2 && <p className="mt-6 text-xs text-paper/50">Upload more exports over time to build a history.</p>}
    </section>
  );
}
