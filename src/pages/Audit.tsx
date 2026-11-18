import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileText } from 'lucide-react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { HealthReport } from '../components/Health';
import { auditSummary, exportAuditCsv, exportAuditPdf } from '../lib/audit';
import { fmtNumber, fmtSigned } from '../lib/format';

export default function Audit() {
  const { analysis, snapshots, meta, settings, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const data = useMemo(() => (analysis ? { analysis, snapshots, meta, geoEnabled: settings.geoEnabled } : null), [analysis, snapshots, meta, settings.geoEnabled]);
  const s = useMemo(() => (data ? auditSummary(data) : null), [data]);
  if (!data || !s) return <Container><EmptyData /></Container>;

  return (
    <Container className="page-enter pb-28">
      <PageHeader
        title="Instagram audit"
        aside={
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => { setBusy(true); try { await exportAuditPdf(data); } catch { toast('PDF export failed'); } setBusy(false); }}
            >
              {busy ? <span className="spinner" /> : <FileText size={15} strokeWidth={1.5} />} <Roll>Download PDF</Roll>
            </button>
            <button className="btn btn-outline" onClick={() => exportAuditCsv(data)}><FileDown size={15} strokeWidth={1.5} /> <Roll>CSV</Roll></button>
          </div>
        }
      >
        Everything about your network, in one report.
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {s.rows.map(([label, value], i) => (
          <div key={label} className="rounded-[28px] bg-mist p-6" style={{ animation: `rise 600ms var(--ease-spring) ${i * 50}ms backwards` }}>
            <p className="numeral text-4xl sm:text-5xl"><Odometer id={`audit-${label}-${value}`} value={value} /></p>
            <p className="eyebrow mt-3 text-muted">{label}</p>
          </div>
        ))}
      </section>

      <div className="mt-16 grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="headline text-xl">Changes</h2>
          {s.history ? (
            <>
              <p className="mt-1 text-xs font-light text-muted">{s.history.range}</p>
              <ul className="mt-5">
                {s.history.rows.map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-line py-3 text-sm">
                    <span>{k}</span><span className="tabular-nums">{fmtSigned(v)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm font-light text-muted">Upload another export to track changes.</p>
          )}
        </section>
        <section>
          <h2 className="headline text-xl">Countries</h2>
          {s.countries ? (
            <ul className="mt-5 space-y-3">
              {s.countries.slice(0, 6).map(([n, v, p]) => (
                <li key={n}>
                  <div className="flex justify-between text-sm"><span>{n}</span><span className="tabular-nums text-muted">{fmtNumber(v)}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-ink" style={{ width: `${p}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-light text-muted">No locations added. <Link to="/world" className="link-underline text-ink">World map</Link></p>
          )}
        </section>
      </div>

      {data.analysis.snapshot.health && (
        <section className="mt-16 rounded-[32px] bg-mist p-8">
          <h2 className="headline text-xl">Data health</h2>
          <div className="mt-5"><HealthReport report={data.analysis.snapshot.health} /></div>
        </section>
      )}
    </Container>
  );
}
