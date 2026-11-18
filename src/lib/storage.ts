import type { Group, MetaMap, Settings, Snapshot } from './types';

/**
 * Imported data lives only for this browser tab (sessionStorage): it survives a reload,
 * and is gone when you reset or close the tab. Uploaded files themselves are never stored,
 * and nothing is ever sent to a server.
 */

const DB_NAME = 'followly'; // used by earlier versions; removed by "Clear all data"
const SESSION_KEY = 'followly.session.v1';
const SETTINGS_KEY = 'followly.settings.v1';

let memorySnapshots: Snapshot[] = []; // fallback when sessionStorage is unavailable or full

function readSession(): Snapshot[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Snapshot[]) : memorySnapshots;
  } catch {
    return memorySnapshots;
  }
}

function writeSession(list: Snapshot[]) {
  memorySnapshots = list;
  try {
    if (list.length) sessionStorage.setItem(SESSION_KEY, JSON.stringify(list));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* too large or blocked: memory only */ }
}

export async function loadSnapshots(): Promise<Snapshot[]> {
  return readSession();
}

export async function saveSnapshot(s: Snapshot): Promise<void> {
  writeSession([...readSession().filter((x) => x.id !== s.id), s]);
}

export async function deleteSnapshot(id: string): Promise<void> {
  writeSession(readSession().filter((x) => x.id !== id));
}

export async function clearSnapshots(): Promise<void> {
  writeSession([]);
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

// Nothing about other accounts is kept beyond the session.
export const loadMeta = (): MetaMap => ({});
export const saveMeta = (_m: MetaMap) => undefined;
export const loadGroups = (): Group[] => [];
export const saveGroups = (_g: Group[]) => undefined;
export const loadWatch = (): string[] => [];
export const saveWatch = (_w: string[]) => undefined;

export const DEFAULT_SETTINGS: Settings = { historyEnabled: false, geoEnabled: false };
// Only the latest upload is kept: the three lists come from your newest export.
export const loadSettings = (): Settings => ({ ...readJson<Partial<Settings>>(SETTINGS_KEY, {}), ...DEFAULT_SETTINGS });
export const saveSettings = (s: Settings) => writeJson(SETTINGS_KEY, s);

export async function clearAllData() {
  await clearSnapshots();
  try {
    sessionStorage.removeItem(SESSION_KEY);
    for (const k of [SETTINGS_KEY, 'followly.meta.v1', 'followly.groups.v1', 'followly.watch.v1']) localStorage.removeItem(k);
    indexedDB?.deleteDatabase(DB_NAME);
  } catch { /* ignore */ }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
