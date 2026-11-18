import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Orbit, Plus } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader, Select } from '../components/ui';
import { GroupEditor } from '../components/GroupEditor';
import { hash, rng } from '../lib/layout';
import { fmtNumber, fmtPercent } from '../lib/format';
import type { Analysis, Group } from '../lib/types';

const TEMPLATES = ['School', 'Sports', 'Family', 'Friends', 'Work', 'Interests'];

function stats(g: Group, a: Analysis) {
  const mutual = new Set(a.mutual.map((x) => x.username));
  const nfb = new Set([...a.notFollowingBack, ...a.needsReview].map((x) => x.username));
  const fans = new Set(a.fans.map((x) => x.username));
  const m = g.members;
  const youFollow = m.filter((u) => mutual.has(u) || nfb.has(u)).length;
  return {
    members: m.length,
    mutual: m.filter((u) => mutual.has(u)).length,
    nfb: m.filter((u) => nfb.has(u)).length,
    fans: m.filter((u) => fans.has(u)).length,
    rate: youFollow ? (m.filter((u) => mutual.has(u)).length / youFollow) * 100 : null,
  };
}

/** Social Constellations: your own circles of accounts, each drawn as its own constellation. */
export default function Constellations() {
  const { analysis, groups, createGroup } = useStore();
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const circles = groups.filter((g) => g.kind === 'circle');
  const pool = useMemo(
    () => (analysis ? [...new Set([...analysis.snapshot.followers, ...analysis.snapshot.following].map((e) => e.u))].sort() : []),
    [analysis],
  );
  if (!analysis) return <Container><EmptyData /></Container>;

  const create = (n: string) => { const id = createGroup(n, 'circle'); setName(''); setEditing({ id, name: n, kind: 'circle', members: [], createdAt: Date.now() }); };
  const A = circles.find((c) => c.id === cmpA), B = circles.find((c) => c.id === cmpB);

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Constellations">Group accounts into circles. Each one becomes a constellation.</PageHeader>

      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create(name.trim()); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New circle" className="field max-w-xs" />
        <button className="btn btn-primary" disabled={!name.trim()}><Plus size={15} strokeWidth={1.5} /> Create</button>
        <span className="ml-2 flex flex-wrap gap-2">
          {TEMPLATES.filter((t) => !circles.some((c) => c.name === t)).map((t) => (
            <button key={t} type="button" onClick={() => create(t)} className="rounded-full border border-dashed border-stone/60 px-3 py-1.5 text-xs text-muted hover:border-ink hover:text-ink">+ {t}</button>
          ))}
        </span>
      </form>

      {circles.length === 0 ? (
        <p className="mt-16 text-sm text-muted">No circles yet. Create one, then add accounts to it.</p>
      ) : (
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {circles.map((c, i) => {
            const s = stats(c, analysis);
            return (
              <li key={c.id} className="group rounded-[32px] bg-ink p-6 text-paper transition-transform duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-1" style={{ animation: `rise 650ms var(--ease-spring) ${i * 60}ms backwards` }}>
                <Sky members={c.members} seed={c.id} />
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="headline text-xl">{c.name}</p>
                    <p className="mt-1 text-xs text-paper/55">{fmtNumber(s.members)} accounts · {fmtNumber(s.mutual)} mutual · {fmtNumber(s.nfb)} not following back</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="btn btn-inverse btn-sm" onClick={() => setEditing(c)}>Edit</button>
                  <Link to={`/universe?circle=${c.id}`} className="btn glass-dark btn-sm text-paper"><Orbit size={13} /> Universe</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {circles.length >= 2 && (
        <section className="mt-16 rounded-[32px] bg-mist p-7 sm:p-9">
          <h2 className="headline text-xl">Compare circles</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Select label="First circle" value={cmpA || ''} onChange={setCmpA} options={[{ value: '', label: 'Choose' }, ...circles.map((c) => ({ value: c.id, label: c.name }))]} />
            <span className="text-muted">vs</span>
            <Select label="Second circle" value={cmpB || ''} onChange={setCmpB} options={[{ value: '', label: 'Choose' }, ...circles.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          {A && B && (
            <table className="mt-6 w-full text-sm">
              <thead><tr className="text-left"><th className="py-2 font-light text-muted" /><th className="py-2 text-right font-medium">{A.name}</th><th className="py-2 text-right font-medium">{B.name}</th></tr></thead>
              <tbody>
                {(() => {
                  const a = stats(A, analysis), b = stats(B, analysis);
                  return ([
                    ['Accounts', a.members, b.members],
                    ['Mutual', a.mutual, b.mutual],
                    ['Not following back', a.nfb, b.nfb],
                    ['Follow you only', a.fans, b.fans],
                    ['Follow-back rate', a.rate, b.rate],
                  ] as const).map(([k, x, y]) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-3 font-light">{k}</td>
                      <td className="py-3 text-right tabular-nums">{k === 'Follow-back rate' ? fmtPercent(x as number | null) : fmtNumber(x as number)}</td>
                      <td className="py-3 text-right tabular-nums">{k === 'Follow-back rate' ? fmtPercent(y as number | null) : fmtNumber(y as number)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          )}
        </section>
      )}

      <GroupEditor key={editing?.id ?? 'none'} group={editing} pool={pool} onClose={() => setEditing(null)} />
    </Container>
  );
}

/** A circle drawn as a little sky: members as stars linked to the circle's centre. */
function Sky({ members, seed }: { members: string[]; seed: string }) {
  const W = 300, H = 150;
  const stars = members.slice(0, 60).map((u) => {
    const r = rng(hash(u + seed));
    return { u, x: 20 + r() * (W - 40), y: 16 + r() * (H - 32), s: 1 + r() * 1.8 };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
      {stars.map((s) => <line key={`l${s.u}`} x1={W / 2} y1={H / 2} x2={s.x} y2={s.y} stroke="#fff" strokeOpacity="0.12" strokeWidth="0.8" />)}
      {stars.map((s, i) => (
        <circle key={s.u} cx={s.x} cy={s.y} r={s.s} fill="#fff" className="marker-pop" style={{ animationDelay: `${i * 25}ms` }} />
      ))}
      <circle cx={W / 2} cy={H / 2} r={4} fill="#fff" />
      {!stars.length && <text x={W / 2} y={H / 2 + 22} textAnchor="middle" fill="#fff" fillOpacity="0.4" fontSize="10" letterSpacing="2">EMPTY</text>}
    </svg>
  );
}
