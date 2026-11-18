import { AlertTriangle, Check, Info, X } from 'lucide-react';
import type { HealthReport as Report, HealthLevel } from '../lib/health';

const ICON: Record<HealthLevel, typeof Check> = { ok: Check, info: Info, warn: AlertTriangle, error: X };

/** Data health check results: one line each, icon first. */
export function HealthReport({ report, compact = false }: { report: Report; compact?: boolean }) {
  const checks = compact ? report.checks.filter((c) => c.level !== 'ok') : report.checks;
  if (compact && !checks.length) {
    return <p className="flex items-center gap-2 text-sm text-graphite"><Check size={15} strokeWidth={1.75} /> All checks passed</p>;
  }
  return (
    <ul className="space-y-2">
      {checks.map((c, i) => {
        const Icon = ICON[c.level];
        return (
          <li key={c.id} className="flex gap-3" style={{ animation: `rise 500ms var(--ease-spring) ${i * 50}ms backwards` }}>
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                c.level === 'ok' ? 'bg-ink text-paper' : c.level === 'error' ? 'bg-ink text-paper' : 'bg-black/[0.07] text-ink'
              }`}
            >
              <Icon size={11} strokeWidth={2.2} />
            </span>
            <span className="text-sm">
              {c.title}
              {c.detail && <span className="block text-xs font-light text-muted">{c.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
