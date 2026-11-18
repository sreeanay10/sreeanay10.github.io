import { useMemo } from 'react';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader } from '../components/ui';
import { AccountExplorer } from '../components/AccountExplorer';
import { Link } from 'react-router-dom';
import type { Analysis } from '../lib/types';
import { followersCutoff } from '../lib/health';
import { fmtDate } from '../lib/format';

/** Shown when the export's followers file only covers a recent date range. */
export function PartialNotice({ a }: { a: Analysis }) {
  const cut = followersCutoff(a.snapshot.followers, a.snapshot.following);
  if (!cut) return null;
  return (
    <div className="mb-8 flex flex-col gap-3 rounded-[24px] bg-mist p-5 sm:flex-row sm:items-center sm:justify-between" style={{ animation: 'rise 600ms var(--ease-spring) backwards' }}>
      <p className="text-sm">
        <span className="font-medium">Your export only has followers since {fmtDate(cut * 1000)}.</span>{' '}
        <span className="font-light text-muted">Older followers show up here by mistake. Download again from Instagram with Date range: All time.</span>
      </p>
      <Link to="/analyze" className="btn btn-primary btn-sm shrink-0">Upload new export</Link>
    </div>
  );
}

/** The three lists FOLLOWLY is about. */
export function useLists(a: Analysis | null) {
  return useMemo(() => {
    if (!a) return null;
    const byName = (x: { username: string }, y: { username: string }) => x.username.localeCompare(y.username);
    return {
      following: [...a.mutual, ...a.notFollowingBack, ...a.needsReview, ...a.excluded].sort(byName),
      followers: [...a.mutual, ...a.fans].sort(byName),
      // following − followers
      notBack: [...a.notFollowingBack, ...a.needsReview, ...a.excluded].sort(byName),
      // followers − following
      fans: [...a.fans].sort(byName),
      // following ∩ followers
      mutual: [...a.mutual].sort(byName),
    };
  }, [a]);
}

function ListPage({ which }: { which: 'following' | 'followers' | 'notBack' | 'fans' | 'mutual' }) {
  const { analysis } = useStore();
  const lists = useLists(analysis);
  if (!lists) return <Container><EmptyData /></Container>;
  const cfg = {
    following: { title: 'People you follow', date: 'Followed', empty: 'You don’t follow anyone' },
    followers: { title: 'People who follow you', date: 'Followed you', empty: 'No followers yet' },
    notBack: { title: 'Don’t follow you back', date: 'Followed', empty: 'Everyone follows you back' },
    fans: { title: 'You don’t follow back', date: 'Followed you', empty: 'You follow everyone back' },
    mutual: { title: 'Mutual', date: 'Followed', empty: 'No mutual followers yet' },
  }[which];
  return (
    <Container className="page-enter pb-28">
      <PageHeader title={cfg.title} />
      {which !== 'following' && which !== 'fans' && analysis && <PartialNotice a={analysis} />}
      <AccountExplorer
        accounts={lists[which]}
        title={cfg.title}
        dateLabel={cfg.date}
        emptyTitle={cfg.empty}
      />
    </Container>
  );
}

export const Following = () => <ListPage which="following" />;
export const Followers = () => <ListPage which="followers" />;
export const NotFollowingBack = () => <ListPage which="notBack" />;
export const YouDontFollowBack = () => <ListPage which="fans" />;
export const Mutual = () => <ListPage which="mutual" />;
