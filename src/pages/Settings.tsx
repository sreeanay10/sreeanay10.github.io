import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Container, Modal, PageHeader } from '../components/ui';

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
  const { clearAll, toast } = useStore();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);

  return (
    <Container className="page-enter pb-28">
      <PageHeader title="Settings" />
      <div className="border-t border-ink">
        <Row
          title="How it works"
          body={
            <ul className="space-y-1.5">
              <li>Files are read in your browser — never uploaded.</li>
              <li>No password, no login, no tracking.</li>
              <li>Your import is kept only in this tab, until you close it or clear it.</li>
              <li>FOLLOWLY never follows or unfollows anyone.</li>
            </ul>
          }
        />
        <Row title="Clear all data" body="Remove your import now.">
          <button className="btn btn-primary" onClick={() => setConfirm(true)}>Clear all data</button>
        </Row>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Clear all data">
        <p className="headline text-xl">Erase everything?</p>
        <p className="lede mt-3 text-sm text-graphite">This can’t be undone.</p>
        <div className="mt-8 flex gap-3">
          <button className="btn btn-primary btn-sm" onClick={async () => { await clearAll(); toast('All data cleared'); setConfirm(false); navigate('/'); }}>
            Erase everything
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      </Modal>
    </Container>
  );
}
