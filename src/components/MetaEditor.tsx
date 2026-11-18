import { useEffect, useState } from 'react';
import { ArrowUpRight, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Account } from '../lib/types';
import { useStore } from '../store';
import { Modal, Segmented } from './ui';
import { FOLLOWER_THRESHOLD } from '../lib/analysis';
import { fmtNumber } from '../lib/format';
import { COUNTRY_LIST } from '../lib/geo';

type V = 'unknown' | 'no' | 'yes';

export function MetaEditor({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { setAccountMeta, setVerdict, toast, settings } = useStore();
  const [verified, setVerified] = useState<V>('unknown');
  const [count, setCount] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [initial, setInitial] = useState<{ verified: V; count: string }>({ verified: 'unknown', count: '' });
  // Keep the last account while the sheet animates closed.
  const [shownAccount, setShownAccount] = useState<Account | null>(account);

  useEffect(() => {
    if (!account) return;
    setShownAccount(account);
    const m = account.meta;
    const v: V = m?.verified === undefined ? 'unknown' : m.verified ? 'yes' : 'no';
    const c = m?.followerCount !== undefined ? String(m.followerCount) : '';
    setVerified(v);
    setCount(c);
    setInitial({ verified: v, count: c });
    setName(m?.displayName ?? '');
    setCountry(m?.country ?? '');
  }, [account]);

  const a = shownAccount;
  const parsed = count.trim() === '' ? undefined : Number(count.replace(/[,\s]/g, ''));
  const invalid = parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed));

  const save = () => {
    if (!a || invalid) return;
    const classificationChanged = verified !== initial.verified || count.trim() !== initial.count.trim();
    setAccountMeta(
      a.username,
      {
        verified: verified === 'unknown' ? undefined : verified === 'yes',
        followerCount: parsed,
        displayName: name.trim() || undefined,
        country: settings.geoEnabled ? country || undefined : a.meta?.country,
      },
      { keepConfirmations: !classificationChanged },
    );
    toast(`Saved @${a.username}`);
    onClose();
  };

  const quick = (v: 'regular' | 'verified' | 'over-threshold') => {
    if (!a) return;
    setVerdict([a.username], v);
    toast(v === 'regular' ? 'Marked as regular account' : v === 'verified' ? 'Marked as verified' : 'Marked as over 100K');
    onClose();
  };

  const m = a?.meta;
  let outcome = 'Needs review';
  if (verified === 'yes') outcome = 'Excluded · verified';
  else if (parsed !== undefined && !invalid && parsed > FOLLOWER_THRESHOLD) outcome = 'Excluded · over 100,000 followers';
  else if (verified === 'no' && parsed !== undefined && !invalid) outcome = 'Not following back';
  else if (verified === initial.verified && count === initial.count && (m?.confirmedRegular || m?.confirmedOverThreshold)) {
    outcome = m.confirmedRegular ? 'Not following back · confirmed by you' : 'Excluded · over 100K, confirmed by you';
  }
  const isMutualOrFan = a?.category === 'mutual' || a?.category === 'fans';

  return (
    <Modal open={!!account} onClose={onClose} title="Account details">
      {a && (
        <>
          <a href={a.href} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-start gap-2">
            <span className="headline break-all text-2xl link-underline">@{a.username}</span>
            <ArrowUpRight size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-muted transition-colors group-hover:text-ink" />
          </a>
          <p className="mt-3 text-sm font-light text-muted">
            Only add what you can see on their profile.
          </p>
          <Link to={`/watchlist?u=${encodeURIComponent(a.username)}`} onClick={onClose} className="label mt-4 inline-flex items-center gap-1.5 text-[0.625rem] link-underline">
            <History size={13} strokeWidth={1.5} /> Relationship history
          </Link>

          {!isMutualOrFan && (
            <div className="mt-8 grid grid-cols-3 gap-2">
              {(['regular', 'verified', 'over-threshold'] as const).map((v, i) => (
                <button
                  key={v}
                  onClick={() => quick(v)}
                  className={`label min-h-12 rounded-full text-[0.625rem] transition-[background-color,color,transform] duration-500 [transition-timing-function:var(--ease-spring)] active:scale-90 ${i === 0 ? 'bg-ink text-paper' : 'glass hover:bg-ink hover:text-paper'}`}
                >
                  {v === 'regular' ? 'Regular' : v === 'verified' ? 'Verified' : 'Over 100K'}
                </button>
              ))}
            </div>
          )}

          <div className="mt-10 space-y-8">
            <fieldset>
              <legend className="eyebrow mb-3 text-muted">Verified badge</legend>
              <Segmented
                label="Verified badge"
                stretch
                value={verified}
                onChange={setVerified}
                options={[{ value: 'unknown', label: 'Unknown' }, { value: 'no', label: 'No' }, { value: 'yes', label: 'Verified' }]}
              />
            </fieldset>
            <label className="block">
              <span className="eyebrow text-muted">Follower count</span>
              <input
                inputMode="numeric"
                className="field mt-1"
                placeholder="Unknown"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                aria-invalid={invalid}
              />
              {invalid && <span className="mt-2 block text-xs text-ink">Enter a whole number, e.g. 12400.</span>}
            </label>
            <label className="block">
              <span className="eyebrow text-muted">Display name</span>
              <input className="field mt-1" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {settings.geoEnabled && (
              <label className="block">
                <span className="eyebrow text-muted">Country</span>
                <select
                  className="field mt-1 cursor-pointer appearance-none bg-[length:10px_6px] bg-[right_0.25rem_center] bg-no-repeat"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath stroke='%23000' stroke-width='1.2' d='m1 1 4 4 4-4'/%3E%3C/svg%3E\")" }}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">Not set</option>
                  {COUNTRY_LIST.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                <span className="mt-2 block text-xs font-light text-muted">
                  Only if they shared it.
                </span>
              </label>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6">
            <p className="text-xs text-muted">
              {isMutualOrFan ? 'Follows you' : <>Result: <span className="text-ink">{outcome}</span></>}
              {parsed !== undefined && !invalid && <span className="block">{fmtNumber(parsed)} followers</span>}
            </p>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={invalid}>Save</button>
          </div>
        </>
      )}
    </Modal>
  );
}
