import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccountMeta, Analysis, Group, MetaMap, ParseResult, Settings, Snapshot, SnapshotDiff } from './lib/types';
import { analyze, diffSnapshots, sortSnapshots } from './lib/analysis';
import { mergeMeta } from './lib/metadata';
import * as storage from './lib/storage';

export type ManualVerdict = 'regular' | 'verified' | 'over-threshold' | 'unknown';

interface Store {
  ready: boolean;
  snapshots: Snapshot[]; // oldest → newest
  active: Snapshot | null;
  previous: Snapshot | null;
  analysis: Analysis | null;
  latestDiff: SnapshotDiff | null;
  meta: MetaMap;
  settings: Settings;
  addSnapshot(r: ParseResult, source: Snapshot['source'], fileName: string): Promise<Snapshot>;
  setActive(id: string | null): void;
  removeSnapshot(id: string): Promise<void>;
  setVerdict(usernames: string[], v: ManualVerdict): void;
  setAccountMeta(username: string, m: Partial<AccountMeta>, opts?: { keepConfirmations?: boolean }): void;
  /** Remove every stored country (used when turning geographic analytics off). */
  clearCountries(): void;
  importMeta(m: MetaMap): void;
  resetMeta(): void;
  updateSettings(s: Partial<Settings>): void;
  clearAll(): Promise<void>;
  updateSnapshot(id: string, patch: Pick<Snapshot, 'name' | 'note'>): Promise<void>;
  groups: Group[];
  createGroup(name: string, kind: Group['kind'], members?: string[]): string;
  renameGroup(id: string, name: string): void;
  deleteGroup(id: string): void;
  setMembership(id: string, usernames: string[], member: boolean): void;
  watchlist: string[];
  toggleWatch(username: string): void;
  toast(message: string): void;
  toastMessage: { id: number; text: string } | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaMap>(() => storage.loadMeta());
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings());
  const [toastMessage, setToast] = useState<{ id: number; text: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>(() => storage.loadGroups());
  const [watchlist, setWatchlist] = useState<string[]>(() => storage.loadWatch());
  useEffect(() => storage.saveGroups(groups), [groups]);
  useEffect(() => storage.saveWatch(watchlist), [watchlist]);

  useEffect(() => {
    storage.loadSnapshots().then((list) => {
      setSnapshots(sortSnapshots(list));
      setReady(true);
    });
  }, []);

  useEffect(() => storage.saveMeta(meta), [meta]);
  useEffect(() => storage.saveSettings(settings), [settings]);

  const toast = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const active = useMemo(
    () => snapshots.find((s) => s.id === activeId) ?? snapshots[snapshots.length - 1] ?? null,
    [snapshots, activeId],
  );
  const previous = useMemo(() => {
    if (!active) return null;
    const i = snapshots.findIndex((s) => s.id === active.id);
    return i > 0 ? snapshots[i - 1] : null;
  }, [snapshots, active]);

  const analysis = useMemo(() => (active ? analyze(active, meta) : null), [active, meta]);
  const latestDiff = useMemo(
    () => (active && previous ? diffSnapshots(previous, active, meta) : null),
    [active, previous, meta],
  );

  const addSnapshot = useCallback<Store['addSnapshot']>(async (r, source, fileName) => {
    const snap: Snapshot = {
      id: storage.newId(),
      uploadedAt: Date.now(),
      exportDate: r.exportDate,
      owner: r.owner,
      source,
      fileName,
      followers: r.followers,
      following: r.following,
      health: r.health,
    };
    if (!settings.historyEnabled) {
      // Keep only the newest analysis when history is off.
      await storage.clearSnapshots();
      await storage.saveSnapshot(snap);
      setSnapshots([snap]);
    } else {
      await storage.saveSnapshot(snap);
      setSnapshots((prev) => sortSnapshots([...prev, snap]));
    }
    setActiveId(null);
    return snap;
  }, [settings.historyEnabled]);

  const removeSnapshot = useCallback(async (id: string) => {
    await storage.deleteSnapshot(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const setVerdict = useCallback((usernames: string[], v: ManualVerdict) => {
    setMeta((prev) => {
      const next = { ...prev };
      const now = Date.now();
      for (const u of usernames) {
        const base = prev[u];
        if (v === 'unknown') {
          if (!base) continue;
          const { confirmedRegular: _a, confirmedOverThreshold: _b, verified: _c, ...rest } = base;
          next[u] = { ...rest, source: 'manual', updatedAt: now };
          continue;
        }
        next[u] = {
          ...(base ?? {}),
          source: 'manual',
          updatedAt: now,
          confirmedRegular: v === 'regular',
          confirmedOverThreshold: v === 'over-threshold',
          verified: v === 'verified' ? true : v === 'regular' ? false : base?.verified,
        };
        if (v === 'regular' && (base?.followerCount ?? 0) > 100_000) delete next[u].followerCount;
      }
      return next;
    });
  }, []);

  const setAccountMeta = useCallback((u: string, m: Partial<AccountMeta>, opts: { keepConfirmations?: boolean } = {}) => {
    setMeta((prev) => {
      const before = prev[u];
      const entry: AccountMeta = { source: 'manual', updatedAt: Date.now() };
      if (m.verified !== undefined) entry.verified = m.verified;
      if (m.followerCount !== undefined) entry.followerCount = m.followerCount;
      if (m.displayName) entry.displayName = m.displayName;
      if (m.country) entry.country = m.country;
      // Edits that don't touch the classification keep earlier confirmations;
      // edits that do replace them, so nothing stale lingers.
      if (opts.keepConfirmations && before) {
        if (before.confirmedRegular) entry.confirmedRegular = true;
        if (before.confirmedOverThreshold) entry.confirmedOverThreshold = true;
      }
      const next = { ...prev };
      const empty = entry.verified === undefined && entry.followerCount === undefined && !entry.displayName && !entry.country && !entry.confirmedRegular && !entry.confirmedOverThreshold;
      if (empty) delete next[u];
      else next[u] = entry;
      return next;
    });
  }, []);

  const clearCountries = useCallback(() => {
    setMeta((prev) => {
      const next: MetaMap = {};
      for (const [u, m] of Object.entries(prev)) {
        const { country: _c, ...rest } = m;
        const keep = rest.verified !== undefined || rest.followerCount !== undefined || rest.displayName || rest.confirmedRegular || rest.confirmedOverThreshold;
        if (keep) next[u] = rest;
      }
      return next;
    });
  }, []);

  const importMeta = useCallback((m: MetaMap) => setMeta((prev) => mergeMeta(prev, m)), []);
  const resetMeta = useCallback(() => setMeta({}), []);
  const updateSettings = useCallback((s: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...s })), []);

  const snapsRef = useRef(snapshots);
  snapsRef.current = snapshots;
  const updateSnapshot = useCallback(async (id: string, patch: Pick<Snapshot, 'name' | 'note'>) => {
    const cur = snapsRef.current.find((s) => s.id === id);
    if (!cur) return;
    const updated = { ...cur, ...patch };
    setSnapshots((prev) => prev.map((s) => (s.id === id ? updated : s)));
    await storage.saveSnapshot(updated);
  }, []);

  const createGroup = useCallback((name: string, kind: Group['kind'], members: string[] = []) => {
    const id = storage.newId();
    setGroups((g) => [...g, { id, name: name.trim() || 'Untitled', kind, members: [...new Set(members)], createdAt: Date.now() }]);
    return id;
  }, []);
  const renameGroup = useCallback((id: string, name: string) => setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x))), []);
  const deleteGroup = useCallback((id: string) => setGroups((g) => g.filter((x) => x.id !== id)), []);
  const setMembership = useCallback((id: string, usernames: string[], member: boolean) => {
    setGroups((g) => g.map((x) => {
      if (x.id !== id) return x;
      const set = new Set(x.members);
      for (const u of usernames) { if (member) set.add(u); else set.delete(u); }
      return { ...x, members: [...set] };
    }));
  }, []);
  const toggleWatch = useCallback((u: string) => setWatchlist((w) => (w.includes(u) ? w.filter((x) => x !== u) : [...w, u])), []);

  const clearAll = useCallback(async () => {
    await storage.clearAllData();
    setSnapshots([]);
    setGroups([]);
    setWatchlist([]);
    setMeta({});
    setSettings(storage.DEFAULT_SETTINGS);
    setActiveId(null);
  }, []);

  const value: Store = {
    ready, snapshots, active, previous, analysis, latestDiff, meta, settings,
    addSnapshot, setActive: setActiveId, removeSnapshot, setVerdict, setAccountMeta, clearCountries, importMeta, resetMeta,
    updateSettings, clearAll, toast, toastMessage, updateSnapshot,
    groups, createGroup, renameGroup, deleteGroup, setMembership, watchlist, toggleWatch,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
