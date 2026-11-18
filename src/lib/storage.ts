import type { Group, MetaMap, Settings, Snapshot } from './types';

/**
 * Everything FOLLOWLY keeps lives on this device only:
 *   • IndexedDB "followly" / "snapshots" — usernames + follow timestamps per upload
 *   • localStorage — account metadata you confirmed, and settings
 * Uploaded files themselves are never stored.
 */

const DB_NAME = 'followly';
const STORE = 'snapshots';
const META_KEY = 'followly.meta.v1';
const SETTINGS_KEY = 'followly.settings.v1';
const GROUPS_KEY = 'followly.groups.v1';
const WATCH_KEY = 'followly.watch.v1';

let memorySnapshots: Snapshot[] | null = null; // fallback when IndexedDB is unavailable

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { resolve(req ? req.result : undefined); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export async function loadSnapshots(): Promise<Snapshot[]> {
  try {
    return ((await tx<Snapshot[]>('readonly', (s) => s.getAll())) ?? []) as Snapshot[];
  } catch {
    return memorySnapshots ?? [];
  }
}

export async function saveSnapshot(s: Snapshot): Promise<void> {
  try {
    await tx('readwrite', (st) => st.put(s));
  } catch {
    memorySnapshots = [...(memorySnapshots ?? []).filter((x) => x.id !== s.id), s];
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  try {
    await tx('readwrite', (st) => st.delete(id));
  } catch {
    memorySnapshots = (memorySnapshots ?? []).filter((x) => x.id !== id);
  }
}

export async function clearSnapshots(): Promise<void> {
  try {
    await tx('readwrite', (st) => st.clear());
  } catch { /* ignore */ }
  memorySnapshots = [];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or blocked: keep in memory only */ }
}

export const loadMeta = (): MetaMap => readJson<MetaMap>(META_KEY, {});
export const saveMeta = (m: MetaMap) => writeJson(META_KEY, m);

export const loadGroups = (): Group[] => readJson<Group[]>(GROUPS_KEY, []);
export const saveGroups = (g: Group[]) => writeJson(GROUPS_KEY, g);
export const loadWatch = (): string[] => readJson<string[]>(WATCH_KEY, []);
export const saveWatch = (w: string[]) => writeJson(WATCH_KEY, w);

export const DEFAULT_SETTINGS: Settings = { historyEnabled: true, geoEnabled: true };
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) });
export const saveSettings = (s: Settings) => writeJson(SETTINGS_KEY, s);

export async function clearAllData() {
  await clearSnapshots();
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(GROUPS_KEY);
    localStorage.removeItem(WATCH_KEY);
    indexedDB?.deleteDatabase(DB_NAME);
  } catch { /* ignore */ }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
