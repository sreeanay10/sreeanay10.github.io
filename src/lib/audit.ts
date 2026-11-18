import type { Analysis, MetaMap, Snapshot } from './types';
import { diffSnapshots, snapshotDate, sortSnapshots } from './analysis';
import { countryName, summarizeGeo } from './geo';
import { addFooters, csvCell, download, pdfBase, stamp, tableStyle } from './export';
import { fmtDate, fmtNumber, fmtPercent } from './format';
import { profileUrl } from './username';
import { REL_LABEL, relOf } from './history';

/** “Run my Instagram audit”: one complete report, built only from your data. */

export interface AuditData {
  analysis: Analysis;
  snapshots: Snapshot[];
  meta: MetaMap;
  geoEnabled: boolean;
}

export function auditSummary({ analysis: a, snapshots, meta, geoEnabled }: AuditData) {
  const sorted = sortSnapshots(snapshots);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const history = sorted.length >= 2 ? diffSnapshots(first, last, meta) : null;
  const geo = geoEnabled ? summarizeGeo(a, meta, 'followers', 'all') : null;
  return {
    rows: [
      ['Followers', fmtNumber(a.followersCount)],
      ['Following', fmtNumber(a.followingCount)],
      ['Mutual followers', fmtNumber(a.mutual.length)],
      ['Not following back', fmtNumber(a.notFollowingBack.length)],
      ['Needs review', fmtNumber(a.needsReview.length)],
      ['Excluded (verified / 100K+)', fmtNumber(a.excluded.length)],
      ['Followers you don’t follow', fmtNumber(a.fans.length)],
      ['Follow-back rate', fmtPercent(a.followBackRate)],
    ] as [string, string][],
    history: history && {
      range: `${fmtDate(snapshotDate(first))} → ${fmtDate(snapshotDate(last))}`,
      rows: [
        ['New followers', history.newFollowers.length],
        ['Lost followers', history.lostFollowers.length],
        ['Accounts you followed', history.newlyFollowed.length],
        ['Accounts you unfollowed', history.unfollowedByYou.length],
        ['New mutual followers', history.mutualGained.length],
        ['New non-follow-backs', history.newNonFollowBacks.length],
      ] as [string, number][],
    },
    countries: geo && geo.ranked.length
      ? geo.ranked.slice(0, 10).map((r) => [countryName(r.code), r.value, geo.locatedFollowers ? (r.value / geo.locatedFollowers) * 100 : 0] as [string, number, number])
      : null,
    located: geo?.locatedFollowers ?? 0,
  };
}

export function exportAuditCsv(d: AuditData) {
  const s = auditSummary(d);
  const lines = ['Section,Item,Value'];
  for (const [k, v] of s.rows) lines.push(['Summary', k, v].map(csvCell).join(','));
  if (s.history) for (const [k, v] of s.history.rows) lines.push([`History ${s.history.range}`, k, v].map(csvCell).join(','));
  if (s.countries) for (const [k, v] of s.countries) lines.push(['Followers by country', k, v].map(csvCell).join(','));
  lines.push('');
  lines.push(['Username', 'Profile URL', 'Relationship', 'Category', 'Followers', 'Verified', 'Country'].map(csvCell).join(','));
  const a = d.analysis;
  const all = [...a.notFollowingBack, ...a.needsReview, ...a.excluded, ...a.mutual, ...a.fans];
  const followers = new Set(a.snapshot.followers.map((e) => e.u)), following = new Set(a.snapshot.following.map((e) => e.u));
  for (const acc of all) {
    const m = acc.meta;
    lines.push([
      acc.username, profileUrl(acc.username), REL_LABEL[relOf(followers.has(acc.username), following.has(acc.username))], acc.category,
      m?.followerCount ?? '', m?.verified === undefined ? '' : m.verified ? 'yes' : 'no', m?.country ? countryName(m.country) : '',
    ].map(csvCell).join(','));
  }
  download(`followly-audit-${stamp()}.csv`, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

export async function exportAuditPdf(d: AuditData) {
  const s = auditSummary(d);
  const owner = d.analysis.snapshot.owner;
  const { doc, autoTable } = await pdfBase('Instagram audit', `${owner ? `@${owner} · ` : ''}Snapshot ${fmtDate(snapshotDate(d.analysis.snapshot))}`);
  autoTable(doc, { ...tableStyle, startY: 156, head: [['SUMMARY', '']], body: s.rows });
  if (s.history) {
    autoTable(doc, { ...tableStyle, startY: (doc as any).lastAutoTable.finalY + 28, head: [[`CHANGES · ${s.history.range}`, '']], body: s.history.rows.map(([k, v]) => [k, fmtNumber(v)]) });
  }
  if (s.countries) {
    autoTable(doc, {
      ...tableStyle,
      startY: (doc as any).lastAutoTable.finalY + 28,
      head: [['FOLLOWERS BY COUNTRY (USER-PROVIDED)', 'FOLLOWERS', 'SHARE']],
      body: s.countries.map(([n, v, p]) => [n, fmtNumber(v), fmtPercent(p)]),
    });
  }
  const a = d.analysis;
  const section = (title: string, list: { username: string }[]) => {
    if (!list.length) return;
    autoTable(doc, {
      ...tableStyle,
      startY: (doc as any).lastAutoTable.finalY + 28,
      head: [[`${title.toUpperCase()} (${fmtNumber(list.length)})`, 'PROFILE']],
      body: list.map((x) => [`@${x.username}`, profileUrl(x.username)]),
    });
  };
  section('Not following back', a.notFollowingBack);
  section('Needs review', a.needsReview);
  section('Excluded', a.excluded);
  addFooters(doc);
  doc.save(`followly-audit-${stamp()}.pdf`);
}
