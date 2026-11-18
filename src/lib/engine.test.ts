import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { analyze, classifyNonFollowBack, diffSnapshots } from './analysis';
import { parseRelationshipHtml, parseRelationshipJson, parseZip, dedupe } from './parse';
import { importMetadataFile } from './metadata';
import type { Snapshot } from './types';

const snap = (followers: string[], following: string[], date = 1): Snapshot => ({
  id: String(date), uploadedAt: date, exportDate: date, owner: null, source: 'files', fileName: 'x',
  followers: followers.map((u) => ({ u })), following: following.map((u) => ({ u })),
});

const confirmed = (u: string[]) => Object.fromEntries(u.map((x) => [x, { confirmedRegular: true, source: 't', updatedAt: 0 }]));

describe('analysis', () => {
  it('computes FOLLOWING − FOLLOWERS', () => {
    const s = snap(['james', 'sarah', 'nike'], ['alex', 'james', 'sarah', 'instagram', 'nike']);
    const a = analyze(s, confirmed(['alex', 'instagram']));
    expect(a.notFollowingBack.map((x) => x.username).sort()).toEqual(['alex', 'instagram']);
    expect(a.mutual.length).toBe(3);
    expect(a.followBackRate).toBeCloseTo(60);
  });

  it('puts unconfirmed accounts in needs review, never assumes ordinary', () => {
    const a = analyze(snap([], ['alex']), {});
    expect(a.notFollowingBack).toHaveLength(0);
    expect(a.needsReview.map((x) => x.username)).toEqual(['alex']);
  });

  it('applies the follower threshold strictly above 100,000', () => {
    const m = (followerCount: number) => ({ followerCount, verified: false, source: 't', updatedAt: 0 });
    expect(classifyNonFollowBack(m(100_001)).category).toBe('excluded');
    expect(classifyNonFollowBack(m(500_000)).category).toBe('excluded');
    expect(classifyNonFollowBack(m(1_000_000)).category).toBe('excluded');
    expect(classifyNonFollowBack(m(100_000)).category).toBe('not-following-back');
    expect(classifyNonFollowBack(m(50_000)).category).toBe('not-following-back');
  });

  it('excludes every verified account regardless of size', () => {
    for (const n of [2_000, 50_000, 1_000_000]) {
      expect(classifyNonFollowBack({ verified: true, followerCount: n, source: 't', updatedAt: 0 }).category).toBe('excluded');
    }
    expect(classifyNonFollowBack({ verified: true, source: 't', updatedAt: 0 }).category).toBe('excluded');
  });

  it('a count alone without verification status still needs review', () => {
    expect(classifyNonFollowBack({ followerCount: 300, source: 't', updatedAt: 0 }).category).toBe('needs-review');
  });

  it('diffs snapshots', () => {
    const d = diffSnapshots(snap(['a', 'b'], ['a', 'c']), snap(['b', 'd'], ['c', 'd', 'e'], 2), {});
    expect(d.newFollowers).toEqual(['d']);
    expect(d.lostFollowers).toEqual(['a']);
    expect(d.newlyFollowed).toEqual(['d', 'e']);
    expect(d.unfollowedByYou).toEqual(['a']);
    expect(d.mutualGained).toEqual(['d']);
    expect(d.mutualLost).toEqual(['a']);
    expect(d.newNonFollowBacks).toEqual(['e']);
  });
});

describe('parsing', () => {
  it('parses the classic followers JSON and normalizes case', () => {
    const json = JSON.stringify([
      { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/James', value: 'James', timestamp: 1700000000 }] },
      { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/james', value: 'james', timestamp: 1690000000 }] },
    ]);
    const out = dedupe(parseRelationshipJson(json));
    expect(out).toEqual([{ u: 'james', t: 1690000000 }]);
  });

  it('parses the newer following JSON where the username is in title', () => {
    const json = JSON.stringify({
      relationships_following: [
        { title: 'sarah', string_list_data: [{ href: 'https://www.instagram.com/_u/sarah', timestamp: 1700000000 }] },
        { title: '', string_list_data: [{ href: 'https://www.instagram.com/_u/nike' }] },
      ],
    });
    expect(parseRelationshipJson(json).map((e) => e.u)).toEqual(['sarah', 'nike']);
  });

  it('throws a friendly error on malformed JSON', () => {
    expect(() => parseRelationshipJson('{oops', 'followers_1.json')).toThrow(/isn't valid JSON/);
  });

  it('parses HTML exports with dates', () => {
    const html = `<html><head><title>Followers</title></head><body>
      <div class="pam"><div><div><a target="_blank" href="https://www.instagram.com/alex.k">alex.k</a></div><div>Jan 05, 2024 3:12 pm</div></div></div>
      <div class="pam"><div><div><a target="_blank" href="https://www.instagram.com/_u/Bea_">Bea_</a></div></div></div>
      <a href="https://www.instagram.com/accounts/login">Log in</a>
    </body></html>`;
    const out = parseRelationshipHtml(html);
    expect(out.map((e) => e.u)).toEqual(['alex.k', 'bea_']);
    expect(out[0].t).toBeGreaterThan(1704000000);
  });

  it('finds split followers files inside a ZIP and ignores other relationship files', async () => {
    const zip = new JSZip();
    const f = (u: string) => ({ title: '', string_list_data: [{ value: u, href: `https://www.instagram.com/${u}`, timestamp: 1 }] });
    zip.file('connections/followers_and_following/followers_1.json', JSON.stringify([f('a'), f('b')]));
    zip.file('connections/followers_and_following/followers_2.json', JSON.stringify([f('c')]));
    zip.file('connections/followers_and_following/following.json', JSON.stringify({ relationships_following: [f('a'), f('z')] }));
    zip.file('connections/followers_and_following/close_friends.json', JSON.stringify({ relationships_close_friends: [f('q')] }));
    zip.file('connections/followers_and_following/followers_1.html', '<a href="https://www.instagram.com/htmlonly">htmlonly</a>');
    zip.file('__MACOSX/connections/followers_and_following/._followers_1.json', 'junk');
    zip.file('personal_information/personal_information/personal_information.json', JSON.stringify({ profile_user: [{ string_map_data: { Username: { value: 'Me' } } }] }));
    const buf = await zip.generateAsync({ type: 'uint8array' });
    const file = new File([buf], 'instagram-me-2024-11-01-abc.zip');
    const res = await parseZip(file);
    expect(res.followers.map((e) => e.u).sort()).toEqual(['a', 'b', 'c']);
    expect(res.following.map((e) => e.u).sort()).toEqual(['a', 'z']);
    expect(res.owner).toBe('me');
    expect(new Date(res.exportDate!).getFullYear()).toBe(2024);
  });

  it('rejects a ZIP with no relationship data', async () => {
    const zip = new JSZip();
    zip.file('media/posts.json', '[]');
    const file = new File([await zip.generateAsync({ type: 'uint8array' })], 'x.zip');
    await expect(parseZip(file)).rejects.toThrow(/couldn't find followers/);
  });
});

describe('metadata import', () => {
  it('reads CSV with compact counts and booleans', () => {
    const { meta, imported } = importMetadataFile('username,followers,verified\n@Nike,"306M",yes\nalex,1.2k,no\n,5,no', 'm.csv');
    expect(imported).toBe(2);
    expect(meta.nike).toMatchObject({ followerCount: 306_000_000, verified: true });
    expect(meta.alex).toMatchObject({ followerCount: 1200, verified: false });
  });
});

import { normalizeCountry, summarizeGeo, heatLevel } from './geo';

describe('geography', () => {
  it('normalizes country codes and names, never guessing', () => {
    expect(normalizeCountry('jp')).toBe('JP');
    expect(normalizeCountry('JPN')).toBe('JP');
    expect(normalizeCountry('Japan')).toBe('JP');
    expect(normalizeCountry('UK')).toBe('GB');
    expect(normalizeCountry('usa')).toBe('US');
    expect(normalizeCountry('Türkiye')).toBe('TR');
    expect(normalizeCountry('840')).toBe('US');
    expect(normalizeCountry('Atlantis')).toBeNull();
    expect(normalizeCountry('')).toBeNull();
  });

  it('imports country column at country level only', () => {
    const { meta, countries, unrecognizedCountries } = importMetadataFile(
      'username,country\nalex,"Paris, France"\nbea,JP\ncal,Narnia',
      'loc.csv',
    );
    expect(meta.alex.country).toBe('FR');
    expect(meta.bea.country).toBe('JP');
    expect(meta.cal).toBeUndefined();
    expect(countries).toBe(2);
    expect(unrecognizedCountries).toBe(1);
  });

  it('ignores countries when geographic analytics are off', () => {
    const { meta } = importMetadataFile('username,followers,country\nalex,10,JP', 'x.csv', { includeCountry: false });
    expect(meta.alex.country).toBeUndefined();
    expect(meta.alex.followerCount).toBe(10);
  });

  it('aggregates by country from user-provided data only', () => {
    const s = snap(['a', 'b', 'c'], ['a', 'b', 'x', 'y']);
    const m = {
      a: { country: 'JP', source: 't', updatedAt: 0 },
      b: { country: 'JP', source: 't', updatedAt: 0 },
      c: { country: 'FR', source: 't', updatedAt: 0 },
      x: { country: 'FR', source: 't', updatedAt: 0, confirmedRegular: true },
    };
    const a = analyze(s, m);
    const followers = summarizeGeo(a, m, 'followers', 'all');
    expect(followers.located).toBe(3);
    expect(followers.total).toBe(3);
    expect(followers.byCountry.get('JP')).toMatchObject({ followers: 2, mutual: 2, value: 2 });
    expect(followers.byCountry.get('FR')).toMatchObject({ followers: 1, fans: 1, nonFollowBack: 1 });
    const oneWay = summarizeGeo(a, m, 'following', 'one-way');
    expect(oneWay.ranked.map((r) => [r.code, r.value])).toEqual([['FR', 1]]);
    expect(oneWay.total).toBe(2); // x and y; y has no country
    expect(oneWay.located).toBe(1);
    expect(heatLevel(0, 5)).toBe(0);
    expect(heatLevel(5, 5)).toBe(5);
  });
});
