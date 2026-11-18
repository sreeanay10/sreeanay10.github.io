import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Container, Modal, PageHeader } from '../components/ui';
import { importMetadataFile } from '../lib/metadata';
import { fmtNumber } from '../lib/format';

function Row({ title, body, children }: { title: string; body: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-line py-10 md:grid-cols-12">
      <div className="md:col-span-5">
        <h2 className="headline text-lg">{title}</h2>
        <div className="lede mt-3 text-sm text-graphite">{body}</div>
      </div>
      <div className="flex flex-wrap items-start gap-3 md:col-span-7 md:justify-end">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings, snapshots, meta, importMeta, resetMeta, clearAll, clearCountries, toast } = useStore();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'all' | 'meta' | 'geo' | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const metaCount = Object.keys(meta).length;
  const locatedCount = Object.values(meta).filter((m) => m.country).length;

  const onImport = async (f: File) => {
    try {
      const r = importMetadataFile(await f.text(), f.name, { includeCountry: settings.geoEnabled });
      importMeta(r.meta);
      const parts = [`Imported ${fmtNumber(r.imported)} ${r.imported === 1 ? 'account' : 'accounts'}`];
      if (r.countries) parts.push(`${fmtNumber(r.countries)} with a country`);
      if (r.unrecognizedCountries) parts.push(`${fmtNumber(r.unrecognizedCountries)} countries not recognised`);
      if (r.skipped) parts.push(`${fmtNumber(r.skipped)} rows skipped`);
      setImportMsg(`${parts.join(' · ')}.`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'That file could not be read.');
    }
  };

  const exportMeta = () => {
    const rows = ['username,followers,verified,display_name,country'];
    const cell = (v: string | number) => {
      const t = String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    for (const [u, m] of Object.entries(meta)) {
      const verified = m.verified === undefined ? '' : m.verified ? 'yes' : 'no';
      rows.push([u, m.followerCount ?? '', verified, m.displayName ?? '', m.country ?? ''].map(cell).join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'followly-metadata.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Settings" />
      <div className="border-t border-ink">
        <Row
          title="Historical tracking"
          body="Keep each upload so you can compare them."
        >
          <Toggle on={settings.historyEnabled} onChange={(v) => updateSettings({ historyEnabled: v })} label="Historical tracking" />
        </Row>

        <Row
          title="Account metadata"
          body={
            <>
              Import a CSV with <code className="text-ink">username</code> plus <code className="text-ink">followers</code>, <code className="text-ink">verified</code>
              {settings.geoEnabled && <> or <code className="text-ink">country</code></>}.
              <span className="mt-2 block text-muted">{fmtNumber(metaCount)} accounts have details.</span>
              {importMsg && <span className="mt-3 block text-ink" role="status">{importMsg}</span>}
            </>
          }
        >
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>Import file</button>
          <button className="btn btn-outline btn-sm" onClick={exportMeta} disabled={!metaCount}>Export</button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirm('meta')} disabled={!metaCount}>Reset</button>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
        </Row>

        <Row
          title="Follower world map"
          body={
            <>
              Countries you add, shown as totals.
              <span className="mt-2 block text-muted">{fmtNumber(locatedCount)} {locatedCount === 1 ? 'account has' : 'accounts have'} a country.</span>
            </>
          }
        >
          <Toggle on={settings.geoEnabled} onChange={(v) => updateSettings({ geoEnabled: v })} label="Follower world map" />
          <button className="btn btn-outline btn-sm" onClick={() => setConfirm('geo')} disabled={!locatedCount}>Delete location data</button>
        </Row>

        <Row
          title="Saved snapshots"
          body={<>{fmtNumber(snapshots.length)} saved on this device.</>}
        >
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/activity')} disabled={!snapshots.length}>Manage snapshots</button>
        </Row>

        <Row
          title="How it works"
          body={
            <ul className="space-y-1.5">
              <li>Files are read in your browser — never uploaded.</li>
              <li>No password, no login, no tracking.</li>
              <li>Only usernames and dates are saved, on this device.</li>
              <li>Locations and counts are never guessed.</li>
              <li>FOLLOWLY never follows or unfollows anyone.</li>
            </ul>
          }
        />

        <Row title="Clear all data" body="Erase everything from this device.">
          <button className="btn btn-primary" onClick={() => setConfirm('all')}>Clear all data</button>
        </Row>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'all' ? 'Clear all data' : confirm === 'geo' ? 'Delete location data' : 'Reset metadata'}
      >
        <p className="headline text-xl">
          {confirm === 'all' ? 'Erase everything?' : confirm === 'geo' ? 'Delete every country?' : 'Reset all confirmed details?'}
        </p>
        <p className="lede mt-3 text-sm text-graphite">
          {confirm === 'all'
            ? `This permanently deletes ${fmtNumber(snapshots.length)} snapshots and ${fmtNumber(metaCount)} confirmed account details from this device.`
            : confirm === 'geo'
              ? `Countries will be removed from ${fmtNumber(locatedCount)} accounts. Follower counts and other details stay. This can't be undone.`
              : `Accounts you confirmed will return to Needs Review. ${fmtNumber(metaCount)} entries will be removed.`}
        </p>
        <div className="mt-8 flex gap-3">
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (confirm === 'all') { await clearAll(); toast('All data cleared'); navigate('/'); }
              else if (confirm === 'geo') { clearCountries(); toast('Location data deleted'); }
              else { resetMeta(); toast('Metadata reset'); }
              setConfirm(null);
            }}
          >
            {confirm === 'all' ? 'Erase everything' : confirm === 'geo' ? 'Delete' : 'Reset'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      </Modal>
    </Container>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="flex h-10 items-center gap-4">
      <span className="label w-6 text-right text-[0.625rem]">{on ? 'On' : 'Off'}</span>
      <span className={`relative h-[30px] w-[50px] rounded-full transition-colors duration-300 ${on ? 'bg-ink' : 'bg-line'}`}>
        <span
          className="knob absolute top-[2px] h-[26px] w-[26px] rounded-full bg-paper shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
          style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)', right: on ? undefined : undefined }}
        />
      </span>
    </button>
  );
}
