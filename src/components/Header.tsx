import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Search, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '../store';
import { Wordmark } from './ui';
import { useLiquidIndicator } from './liquid';
import { CommandPalette } from './CommandPalette';
import { fmtCompact } from '../lib/format';

type CountKey = 'nfb' | 'mutual' | 'excluded' | 'review' | 'fans';
export interface NavItem { to: string; label: string; count?: CountKey; geo?: boolean }
export interface NavGroup { id: 'analytics' | 'universe' | 'archive'; label: string; title: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'analytics', label: 'Analytics', title: 'The Analytics',
    items: [
      { to: '/dashboard', label: 'Overview' },
      { to: '/not-following-back', label: 'Not following back', count: 'nfb' },
      { to: '/mutual', label: 'Mutual', count: 'mutual' },
      { to: '/followers-only', label: 'You don’t follow', count: 'fans' },
      { to: '/excluded', label: 'Excluded', count: 'excluded' },
      { to: '/review', label: 'Needs review', count: 'review' },
      { to: '/activity', label: 'Activity' },
      { to: '/analytics', label: 'Analytics' },
    ],
  },
  {
    id: 'universe', label: 'Universe', title: 'The Universe',
    items: [
      { to: '/universe', label: 'Social Universe' },
      { to: '/web', label: 'Connection Web' },
      { to: '/constellations', label: 'Constellations' },
      { to: '/world', label: 'World Map', geo: true },
    ],
  },
  {
    id: 'archive', label: 'Archive', title: 'The Archive',
    items: [
      { to: '/replay', label: 'Social Replay' },
      { to: '/wrapped', label: 'Wrapped' },
      { to: '/dna', label: 'Social DNA' },
      { to: '/vault', label: 'Memory Vault' },
      { to: '/fingerprint', label: 'Fingerprint' },
      { to: '/museum', label: 'Museum' },
      { to: '/watchlist', label: 'Watchlist' },
    ],
  },
];

/** Pages that belong to a group without being a tab of it. */
const EXTRA: Record<string, NavGroup['id']> = { '/accounts': 'analytics', '/audit': 'analytics' };

export function groupOf(pathname: string): NavGroup | undefined {
  const id = EXTRA[pathname];
  return NAV_GROUPS.find((g) => g.id === id || g.items.some((i) => i.to === pathname));
}

/** Space reserved for the floating header (bar only / bar + tabs). */
export const HEADER_BASE = 76;
export const HEADER_APP = 128;

function useCounts(): Partial<Record<CountKey, number>> {
  const { analysis } = useStore();
  if (!analysis) return {};
  return {
    nfb: analysis.notFollowingBack.length,
    mutual: analysis.mutual.length,
    excluded: analysis.excluded.length,
    review: analysis.needsReview.length,
    fans: analysis.fans.length,
  };
}

export function Header() {
  const { pathname } = useLocation();
  const { analysis, settings } = useStore();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const counts = useCounts();
  const group = analysis ? groupOf(pathname) : undefined;
  const items = (group?.items ?? []).filter((n) => !n.geo || settings.geoEnabled);

  // Turn the glass dark while a dark section (like the Universe) sits under it.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      setDark([...document.querySelectorAll<HTMLElement>('[data-header-theme="dark"]')].some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= 40 && r.bottom >= 40;
      }));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const t = setTimeout(measure, 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pathname]);

  useEffect(() => { setOpen(false); setSearch(false); }, [pathname]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((s) => !s); }
    };
    const onOpen = () => setSearch(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('followly:search', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('followly:search', onOpen); };
  }, []);

  const glass = open ? '' : dark ? 'glass-dark text-paper' : 'glass text-ink';

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 sm:px-5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }} data-site-header>
        <div className={`pointer-events-auto relative z-[61] mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 rounded-full pl-5 pr-2 transition-colors duration-500 sm:pl-6 ${glass}`}>
          <Link to="/" aria-label="FOLLOWLY home" className="-ml-1 shrink-0 p-1">
            <Wordmark inverse={open || dark} />
          </Link>

          {analysis ? (
            <GroupSwitcher active={group?.id} dark={dark} />
          ) : (
            <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
              <a href="/#how" className="label link-underline text-[0.6875rem]">How it works</a>
              <a href="/#features" className="label link-underline text-[0.6875rem]">Features</a>
              <a href="/#privacy" className="label link-underline text-[0.6875rem]">Privacy</a>
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-1">
            {analysis && (
              <button
                onClick={() => setSearch(true)}
                className={`flex h-10 items-center gap-2 rounded-full px-3 transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-90 ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                aria-label="Smart search"
              >
                <Search size={17} strokeWidth={1.5} />
                <kbd className="hidden font-sans text-[0.625rem] opacity-50 lg:inline">⌘K</kbd>
              </button>
            )}
            {analysis && (
              <Link to="/settings" aria-label="Settings" className={`hidden h-10 w-10 items-center justify-center rounded-full transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-90 md:flex ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                <SettingsIcon size={17} strokeWidth={1.5} />
              </Link>
            )}
            <Link to="/analyze" className={`btn btn-sm hidden h-10 md:inline-flex ${dark ? 'btn-inverse' : 'btn-primary'}`}>Analyze</Link>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-500 [transition-timing-function:var(--ease-spring)] active:scale-90 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="relative block h-3 w-5">
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={`absolute left-0 block h-[1.5px] w-5 rounded-full transition-[transform,top,background-color] duration-500 ease-sheet ${open || dark ? 'bg-paper' : 'bg-ink'}`}
                    style={{ top: open ? 5 : i ? 10 : 0, transform: open ? `rotate(${i ? -45 : 45}deg)` : 'none' }}
                  />
                ))}
              </span>
            </button>
          </div>
        </div>
        {group && <SubNav group={group} items={items} counts={counts} pathname={pathname} dark={dark} />}
      </header>

      <MobileMenu open={open} counts={counts} hasData={!!analysis} />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </>
  );
}

/** Analytics · Universe · Archive, with a liquid droplet under the active world. */
function GroupSwitcher({ active, dark }: { active?: NavGroup['id']; dark: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLiquidIndicator(root, pill, '[data-active="true"]', [active]);
  return (
    <nav ref={root} aria-label="Sections" className={`relative hidden rounded-full p-1 md:flex ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
      <span ref={pill} aria-hidden="true" className={`pointer-events-none absolute bottom-1 left-0 top-1 rounded-full ${dark ? 'bg-paper' : 'bg-ink'} shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_14px_-6px_rgba(0,0,0,0.5)]`} style={{ width: 0, opacity: 0 }} />
      {NAV_GROUPS.map((g) => {
        const on = g.id === active;
        return (
          <Link
            key={g.id}
            to={g.items[0].to}
            data-active={on}
            className={`label relative z-10 flex h-8 items-center rounded-full px-4 text-[0.625rem] transition-colors duration-300 ${on ? (dark ? 'text-ink' : 'text-paper') : 'opacity-70 hover:opacity-100'}`}
          >
            {g.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The current world's pages on a floating glass capsule with a liquid droplet. */
function SubNav({ group, items, counts, pathname, dark }: { group: NavGroup; items: NavItem[]; counts: Partial<Record<CountKey, number>>; pathname: string; dark: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLiquidIndicator(list, pill, 'a[aria-current="page"]', [pathname, items.length, counts.nfb, counts.mutual, counts.excluded, counts.review, counts.fans]);

  useLayoutEffect(() => {
    const ul = list.current, sc = scroller.current;
    const active = ul?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!ul || !sc || !active) return;
    const left = active.offsetLeft - (sc.clientWidth - active.offsetWidth) / 2;
    sc.scrollTo({ left: Math.max(0, left), behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [pathname]);

  return (
    <nav aria-label="Pages" className="pointer-events-auto mx-auto mt-2 max-w-[1240px]">
      <div className={`${dark ? 'glass-dark text-paper' : 'glass'} flex items-center gap-1 rounded-full p-1 transition-colors duration-500`}>
        <GroupPicker group={group} dark={dark} />
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto rounded-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul ref={list} className="relative flex h-9 w-max min-w-full items-stretch gap-1 whitespace-nowrap">
            <span
              ref={pill}
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0 left-0 top-0 rounded-full ${dark ? 'bg-paper' : 'bg-ink'} shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_14px_-6px_rgba(0,0,0,0.55)]`}
              style={{ width: 0, opacity: 0 }}
            />
            {items.map((n) => (
              <li key={n.to} className="flex">
                <NavLink
                  to={n.to}
                  className={({ isActive }) =>
                    `label relative z-10 flex items-center rounded-full px-4 text-[0.625rem] transition-colors duration-300 ${
                      isActive ? (dark ? 'text-ink' : 'text-paper') : dark ? 'text-paper/70 hover:text-paper' : 'text-graphite hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                  {n.count && counts[n.count] !== undefined && <span className="ml-1.5 tabular-nums opacity-55">{fmtCompact(counts[n.count]!)}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

/** Phones: pick Analytics / Universe / Archive from the start of the tab bar. */
function GroupPicker({ group, dark }: { group: NavGroup; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0 md:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`label flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.625rem] transition-[background-color,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-95 ${dark ? 'bg-white/10' : 'bg-black/[0.06]'}`}
      >
        {group.label}
        <svg width="8" height="5" viewBox="0 0 10 6" fill="none" aria-hidden="true" className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path stroke="currentColor" strokeWidth="1.4" d="m1 1 4 4 4-4" /></svg>
      </button>
      <div
        role="menu"
        className={`${dark ? 'glass-dark text-paper' : 'glass'} glass-thick absolute left-0 top-full z-10 mt-2 w-48 origin-top-left rounded-[20px] p-1.5`}
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'none' : 'scale(0.7)',
          pointerEvents: open ? 'auto' : 'none',
          transition: `opacity ${open ? 140 : 200}ms var(--ease-out), transform ${open ? 560 : 260}ms ${open ? 'var(--ease-spring)' : 'var(--ease-sheet)'}`,
        }}
      >
        {NAV_GROUPS.map((g) => (
          <Link
            key={g.id}
            role="menuitem"
            tabIndex={open ? 0 : -1}
            to={g.items[0].to}
            className={`label flex items-center justify-between rounded-[14px] px-3.5 py-3 text-[0.6875rem] ${g.id === group.id ? (dark ? 'bg-white/10' : 'bg-black/[0.06]') : ''}`}
          >
            {g.label}
            <span className="font-sans text-[0.625rem] normal-case tracking-normal opacity-50">{g.items.length}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobileMenu({ open, counts, hasData }: { open: boolean; counts: Partial<Record<CountKey, number>>; hasData: boolean }) {
  const { settings } = useStore();
  let i = 0;
  const item = (n: NavItem) => {
    const delay = open ? 120 + i++ * 22 : 0;
    return (
      <li key={n.to} style={{ opacity: open ? 1 : 0, transform: open ? 'none' : 'translateY(20px)', transition: `opacity 450ms var(--ease-out) ${delay}ms, transform 750ms var(--ease-spring) ${delay}ms` }}>
        <NavLink
          to={n.to}
          end
          className={({ isActive }) => `headline flex items-baseline justify-between py-2 text-[1.375rem] transition-colors ${isActive ? 'text-paper' : 'text-paper/45 active:text-paper'}`}
        >
          {n.label}
          {n.count && counts[n.count] !== undefined && <span className="text-sm font-light tracking-normal text-paper/45 tabular-nums">{fmtCompact(counts[n.count]!)}</span>}
        </NavLink>
      </li>
    );
  };
  return (
    <div
      className="fixed inset-0 z-[60] bg-ink text-paper md:hidden"
      style={{
        clipPath: open ? 'circle(150% at calc(100% - 44px) 46px)' : 'circle(0px at calc(100% - 44px) 46px)',
        visibility: open ? 'visible' : 'hidden',
        transition: `clip-path 700ms var(--ease-sheet), visibility 0ms linear ${open ? '0ms' : '700ms'}`,
      }}
      aria-hidden={!open}
    >
      <nav className="flex h-full flex-col overflow-y-auto px-6 pb-10 pt-24" aria-label="Menu">
        <ul>{item({ to: '/', label: 'Home' })}</ul>
        {hasData ? (
          NAV_GROUPS.map((g) => (
            <div key={g.id} className="mt-7">
              <p className="eyebrow mb-2 text-paper/40">{g.title}</p>
              <ul>{g.items.filter((n) => !n.geo || settings.geoEnabled).map(item)}</ul>
            </div>
          ))
        ) : (
          <ul className="mt-2">{item({ to: '/analyze', label: 'Analyze' })}</ul>
        )}
        <ul className="mt-7">{item({ to: '/settings', label: 'Settings' })}</ul>
        <div className="mt-auto pt-10">
          <Link to="/analyze" className="btn btn-inverse w-full">{hasData ? 'Upload new export' : 'Analyze my account'}</Link>
        </div>
      </nav>
    </div>
  );
}

/** Height reserved under the floating header on each route. */
export function useHeaderOffset() {
  const { pathname } = useLocation();
  const { analysis } = useStore();
  return analysis && groupOf(pathname) ? HEADER_APP : HEADER_BASE;
}
