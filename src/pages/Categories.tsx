import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Roll } from '../components/motion';
import { useStore } from '../store';
import { Container, EmptyData, PageHeader } from '../components/ui';
import { AccountExplorer } from '../components/AccountExplorer';
import { ReviewQueue } from '../components/ReviewQueue';

export function NotFollowingBack() {
  const { analysis } = useStore();
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Not following you back">
        You follow them. They don't follow you.
      </PageHeader>
      <AccountExplorer
        accounts={analysis.notFollowingBack}
        title="Not following back"
        emptyTitle={analysis.needsReview.length ? 'Nothing confirmed yet' : 'Everyone follows you back'}
        emptyBody={analysis.needsReview.length ? 'Review accounts to fill this list.' : undefined}
      />
    </Container>
  );
}

export function Mutual() {
  const { analysis } = useStore();
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Mutual followers">You follow each other.</PageHeader>
      <AccountExplorer accounts={analysis.mutual} title="Mutual followers" emptyTitle="No mutual followers" />
    </Container>
  );
}

export function FollowersOnly() {
  const { analysis } = useStore();
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Followers you don’t follow">They follow you. You don’t follow them back.</PageHeader>
      <AccountExplorer accounts={analysis.fans} title="Followers you don't follow" dateLabel="Followed you" emptyTitle="You follow all your followers" />
    </Container>
  );
}

export function Excluded() {
  const { analysis } = useStore();
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Excluded accounts">Verified or 100K+ accounts, kept out of your list.</PageHeader>
      <AccountExplorer
        accounts={analysis.excluded}
        title="Excluded accounts"
        showReason
        emptyTitle="No excluded accounts yet"
        emptyBody="Mark accounts as verified or 100K+ to see them here."
      />
    </Container>
  );
}

export function NeedsReview() {
  const { analysis } = useStore();
  const [reviewing, setReviewing] = useState(false);
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Needs review">Tell us which accounts are regular.</PageHeader>
      {analysis.needsReview.length > 0 && (
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center">
          <button className="btn btn-primary" onClick={() => setReviewing(true)}><Roll>Start review</Roll></button>
          <p className="text-xs font-light text-muted sm:ml-4">Swipe or press 1 · 2 · 3</p>
        </div>
      )}
      <AccountExplorer
        accounts={analysis.needsReview}
        title="Needs review"
        reviewMode
        emptyTitle="All reviewed"
        emptyBody="Nothing left to check."
      />
      {reviewing && <ReviewQueue accounts={analysis.needsReview} onClose={() => setReviewing(false)} />}
    </Container>
  );
}

export function AllAccounts() {
  const { analysis } = useStore();
  const everyone = useMemo(
    () => (analysis ? [...analysis.notFollowingBack, ...analysis.needsReview, ...analysis.excluded, ...analysis.mutual, ...analysis.fans] : []),
    [analysis],
  );
  if (!analysis) return <Container><EmptyData /></Container>;
  return (
    <Container className="page-enter pb-28">
      <PageHeader
        eyebrow="Following ∪ followers"
        title="All accounts"
        aside={<Link to="/dashboard" className="label link-underline text-[0.6875rem]">Back to overview</Link>}
      >
        Everyone, in one searchable list.
      </PageHeader>
      <AccountExplorer accounts={everyone} title="All accounts" categoryFilter dateLabel="Since" emptyTitle="No accounts" />
    </Container>
  );
}
