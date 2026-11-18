import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation, Link } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { Header, useHeaderOffset } from './components/Header';
import { Container, Loader, Toaster } from './components/ui';
import { usePageTransitions } from './components/motion';
import { LiquidGlass, useGlassLight } from './components/liquid';
import Home from './pages/Home';
import Analyze from './pages/Analyze';
import Dashboard from './pages/Dashboard';
import { Followers, Following, Mutual, NotFollowingBack, YouDontFollowBack } from './pages/Categories';
import Settings from './pages/Settings';

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
  '/dashboard': 'Overview — FOLLOWLY',
  '/following': 'People you follow — FOLLOWLY',
  '/followers': 'People who follow you — FOLLOWLY',
  '/not-following-back': 'Don’t follow you back — FOLLOWLY',
  '/you-dont-follow-back': 'You don’t follow back — FOLLOWLY',
  '/mutual': 'Mutual — FOLLOWLY',
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
              <Route path="/following" element={<Following />} />
              <Route path="/followers" element={<Followers />} />
              <Route path="/not-following-back" element={<NotFollowingBack />} />
              <Route path="/you-dont-follow-back" element={<YouDontFollowBack />} />
              <Route path="/mutual" element={<Mutual />} />
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
