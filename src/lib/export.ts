import type { Account, SnapshotDiff } from './types';
import { snapshotDate } from './analysis';
import { fmtDate, fmtNumber, fmtUnixDate } from './format';
import { profileUrl } from './username';

const CATEGORY_LABEL: Record<Account['category'], string> = {
  'not-following-back': 'Not following back',
  mutual: 'Mutual',
  excluded: 'Excluded',
  'needs-review': 'Needs review',
  fans: 'Follows you',
};

export function reasonLabel(a: Account): string {
  return a.reasons.map((r) => (r === 'verified' ? 'Verified account' : 'More than 50,000 followers')).join(' · ');
}

export function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function accountRow(a: Account) {
  return {
    username: a.username,
    profile: a.href,
    displayName: a.meta?.displayName ?? '',
    followers: a.meta?.followerCount,
    verified: a.meta?.verified === undefined ? 'Unknown' : a.meta.verified ? 'Yes' : 'No',
    category: CATEGORY_LABEL[a.category],
    reason: reasonLabel(a),
    followed: a.followedAt ? new Date(a.followedAt * 1000).toISOString().slice(0, 10) : '',
  };
}

export function exportAccountsCsv(title: string, accounts: Account[]) {
  const header = ['Username', 'Profile URL', 'Display name', 'Followers', 'Verified', 'Category', 'Exclusion reason', 'Date you followed'];
  const lines = [header.map(csvCell).join(',')];
  for (const a of accounts) {
    const r = accountRow(a);
    lines.push([r.username, r.profile, r.displayName, r.followers, r.verified, r.category, r.reason, r.followed].map(csvCell).join(','));
  }
  download(`followly-${slug(title)}-${stamp()}.csv`, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

export async function pdfBase(title: string, subtitle: string) {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setCharSpace(4);
  doc.text('FOLLOWLY', 48, 56);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136);
  doc.text(`Generated ${fmtDate(Date.now())}`, W - 48, 56, { align: 'right' });
  doc.setDrawColor(234);
  doc.line(48, 70, W - 48, 70);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(title.toUpperCase(), 48, 112);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(136);
  doc.text(subtitle, 48, 132);
  doc.setTextColor(0);
  return { doc, autoTable: autoTable.default, W };
}

export const tableStyle = {
  theme: 'plain' as const,
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 6, bottom: 6, left: 0, right: 8 }, textColor: 0 },
  headStyles: { fontStyle: 'bold' as const, fontSize: 7, textColor: 136 },
  margin: { left: 48, right: 48 },
  didDrawCell: (d: any) => {
    if (d.section === 'body' || d.section === 'head') {
      d.doc.setDrawColor(234);
      d.doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
    }
  },
};

export function addFooters(doc: import('jspdf').jsPDF) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(136);
    doc.text('Processed privately in your browser. Counts reflect your uploaded Instagram export.', 48, H - 32);
    doc.text(`${i} / ${pages}`, W - 48, H - 32, { align: 'right' });
  }
}

export async function exportAccountsPdf(title: string, accounts: Account[], context: string) {
  const { doc, autoTable } = await pdfBase(title, `${fmtNumber(accounts.length)} accounts · ${context}`);
  autoTable(doc, {
    ...tableStyle,
    startY: 156,
    head: [['USERNAME', 'DISPLAY NAME', 'FOLLOWERS', 'VERIFIED', 'NOTE', 'FOLLOWED']],
    body: accounts.map((a) => {
      const r = accountRow(a);
      return [`@${r.username}`, r.displayName || '—', r.followers !== undefined ? fmtNumber(r.followers) : '—', r.verified, r.reason || (a.category === 'needs-review' ? 'Unconfirmed' : ''), fmtUnixDate(a.followedAt)];
    }),
  });
  addFooters(doc);
  doc.save(`followly-${slug(title)}-${stamp()}.pdf`);
}

const DIFF_SECTIONS: [keyof SnapshotDiff, string][] = [
  ['newFollowers', 'New followers'],
  ['lostFollowers', 'Lost followers'],
  ['newlyFollowed', 'New accounts you followed'],
  ['unfollowedByYou', 'Accounts you unfollowed'],
  ['mutualGained', 'New mutual followers'],
  ['mutualLost', 'Mutual followers lost'],
  ['newNonFollowBacks', 'New non-follow-backs'],
  ['resolvedNonFollowBacks', 'No longer non-follow-backs'],
];

function diffRange(d: SnapshotDiff) {
  return `${fmtDate(snapshotDate(d.from))} → ${fmtDate(snapshotDate(d.to))}`;
}

export function exportActivityCsv(d: SnapshotDiff) {
  const lines = ['Change,Username,Profile URL,From snapshot,To snapshot'];
  const from = fmtDate(snapshotDate(d.from)), to = fmtDate(snapshotDate(d.to));
  for (const [key, label] of DIFF_SECTIONS) {
    for (const u of d[key] as string[]) lines.push([label, u, profileUrl(u), from, to].map(csvCell).join(','));
  }
  download(`followly-activity-${stamp()}.csv`, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

export async function exportActivityPdf(d: SnapshotDiff) {
  const { doc, autoTable } = await pdfBase('Account activity', `Comparing snapshots ${diffRange(d)}`);
  autoTable(doc, {
    ...tableStyle,
    startY: 156,
    head: [['CHANGE', 'COUNT']],
    body: DIFF_SECTIONS.map(([k, label]) => [label, fmtNumber((d[k] as string[]).length)]),
  });
  for (const [key, label] of DIFF_SECTIONS) {
    const list = d[key] as string[];
    if (!list.length) continue;
    autoTable(doc, {
      ...tableStyle,
      startY: (doc as any).lastAutoTable.finalY + 28,
      head: [[label.toUpperCase(), 'PROFILE']],
      body: list.map((u) => [`@${u}`, profileUrl(u)]),
    });
  }
  addFooters(doc);
  doc.save(`followly-activity-${stamp()}.pdf`);
}

export async function copyUsernames(accounts: Account[]): Promise<boolean> {
  const text = accounts.map((a) => a.username).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
