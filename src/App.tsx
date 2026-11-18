import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation, Link } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { Header, useHeaderOffset } from './components/Header';
import { Container, Loader, Toaster } from './components/ui';
import { usePageTransitions } from './components/motion';
import { LiquidGlass, useGlassLight } from './components/liquid';
import Home from './pages/Home';
import Analyze from './pages/Analyze';
import Dashboard from './pages/Dashboard';
import { AllAccounts, Excluded, FollowersOnly, Mutual, NeedsReview, NotFollowingBack } from './pages/Categories';
import Audit from './pages/Audit';
import Vault from './pages/Vault';
import Watchlist from './pages/Watchlist';
import DNA from './pages/DNA';
import Museum from './pages/Museum';
import Constellations from './pages/Constellations';
import Activity from './pages/Activity';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

// The map and its boundary data load only when the page is opened.
const World = lazy(() => import('./pages/World'));
const Universe = lazy(() => import('./pages/Universe'));
const Web = lazy(() => import('./pages/Web'));
const Replay = lazy(() => import('./pages/Replay'));
const Fingerprint = lazy(() => import('./pages/Fingerprint'));
const Wrapped = lazy(() => import('./pages/Wrapped'));

const lazyPage = (el: JSX.Element, label: string) => (
  <Suspense fallback={<div className="flex min-h-[70vh] items-center justify-center"><Loader label={label} /></div>}>{el}</Suspense>
);

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' })); return; }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

const TITLES: Record<string, string> = {
  '/': 'FOLLOWLY — Who doesn’t follow you back',
  '/analyze': 'Analyze — FOLLOWLY',
  '/dashboard': 'Dashboard — FOLLOWLY',
  '/not-following-back': 'Not following back — FOLLOWLY',
  '/mutual': 'Mutual followers — FOLLOWLY',
  '/excluded': 'Excluded accounts — FOLLOWLY',
  '/review': 'Needs review — FOLLOWLY',
  '/activity': 'Account activity — FOLLOWLY',
  '/analytics': 'Analytics — FOLLOWLY',
  '/world': 'World map — FOLLOWLY',
  '/accounts': 'All accounts — FOLLOWLY',
  '/followers-only': 'Followers you don’t follow — FOLLOWLY',
  '/audit': 'Instagram audit — FOLLOWLY',
  '/universe': 'Social Universe — FOLLOWLY',
  '/web': 'Connection Web — FOLLOWLY',
  '/constellations': 'Constellations — FOLLOWLY',
  '/replay': 'Social Replay — FOLLOWLY',
  '/wrapped': 'Followly Wrapped — FOLLOWLY',
  '/dna': 'Social DNA — FOLLOWLY',
  '/vault': 'Memory Vault — FOLLOWLY',
  '/fingerprint': 'Network Fingerprint — FOLLOWLY',
  '/museum': 'Account Museum — FOLLOWLY',
  '/watchlist': 'Watchlist — FOLLOWLY',
  '/settings': 'Settings — FOLLOWLY',
};

function Shell() {
  const { ready } = useStore();
  const location = useLocation();
  const offset = useHeaderOffset();
  usePageTransitions();
  useGlassLight();
  useEffect(() => { document.title = TITLES[location.pathname] ?? 'FOLLOWLY'; }, [location.pathname]);
  return (
    <>
      <ScrollManager />
      <Header />
      <main style={{ paddingTop: location.pathname === '/' ? 0 : offset }} className="min-h-[100svh]">
        {!ready ? (
          <div className="flex min-h-[70vh] items-center justify-center"><Loader /></div>
        ) : (
          <div key={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/analyze" element={<Analyze />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/not-following-back" element={<NotFollowingBack />} />
              <Route path="/mutual" element={<Mutual />} />
              <Route path="/excluded" element={<Excluded />} />
              <Route path="/review" element={<NeedsReview />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/world" element={lazyPage(<World />, 'Loading map')} />
              <Route path="/universe" element={lazyPage(<Universe />, 'Building your universe')} />
              <Route path="/web" element={lazyPage(<Web />, 'Weaving')} />
              <Route path="/replay" element={lazyPage(<Replay />, 'Loading replay')} />
              <Route path="/fingerprint" element={lazyPage(<Fingerprint />, 'Generating')} />
              <Route path="/wrapped" element={lazyPage(<Wrapped />, 'Wrapping')} />
              <Route path="/followers-only" element={<FollowersOnly />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/vault" element={<Vault />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/dna" element={<DNA />} />
              <Route path="/museum" element={<Museum />} />
              <Route path="/constellations" element={<Constellations />} />
              <Route path="/accounts" element={<AllAccounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={
                <Container className="page-enter py-36">
                  <p className="eyebrow mb-6 text-muted">404</p>
                  <h1 className="display text-6xl">Not found.</h1>
                  <Link to="/" className="btn btn-primary mt-10">Go home</Link>
                </Container>
              } />
            </Routes>
          </div>
        )}
      </main>
      <Toaster />
      <LiquidGlass />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </StoreProvider>
  );
}
