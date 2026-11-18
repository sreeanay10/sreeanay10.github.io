const nf = new Intl.NumberFormat('en-US');

export const fmtNumber = (n: number) => nf.format(n);

export function fmtCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return nf.format(n);
}

export function fmtDate(ms: number | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', opts);
}

export const fmtUnixDate = (s?: number) => (s ? fmtDate(s * 1000) : '—');

export function fmtPercent(p: number | null): string {
  if (p === null) return '—';
  return `${p.toFixed(p >= 10 || p === 0 ? 0 : 1)}%`;
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(-n)}` : '0';
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}
