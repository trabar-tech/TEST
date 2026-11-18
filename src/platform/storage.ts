/**
 * Browser storage adapter.
 *
 * Lives outside `core/` on purpose: `core/save.ts` defines the `SaveStorage`
 * interface and stays DOM-free, so the same save code runs headless for
 * OVERSEER dispatch and in tests. This module is the only place in the project
 * that talks to IndexedDB or `localStorage` (ADR-0001, enforced by
 * scripts/check-boundaries.mjs).
 */

import { MemoryStorage, type SaveStorage } from '@core/save';

/** Fallback for private-mode browsers and any environment without IndexedDB. */
export class LocalStorageAdapter implements SaveStorage {
  constructor(private readonly ls: Storage, private readonly prefix = 'civic-order:') {}
  async get(key: string): Promise<string | null> {
    return this.ls.getItem(this.prefix + key);
  }
  async set(key: string, value: string): Promise<void> {
    this.ls.setItem(this.prefix + key, value);
  }
  async del(key: string): Promise<void> {
    this.ls.removeItem(this.prefix + key);
  }
  async keys(): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
    }
    return out.sort();
  }
}

class IndexedDbAdapter implements SaveStorage {
  constructor(private readonly db: IDBDatabase, private readonly store = 'saves') {}

  private tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = this.db.transaction(this.store, mode);
      const req = fn(t.objectStore(this.store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'));
    });
  }

  async get(key: string): Promise<string | null> {
    return (await this.tx<string | undefined>('readonly', (s) => s.get(key))) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async del(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async keys(): Promise<string[]> {
    const all = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return all.map(String).sort();
  }
}

async function openDb(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
  };
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('could not open indexeddb'));
    req.onblocked = () => reject(new Error('indexeddb blocked by another tab'));
  });
}

/**
 * Best available storage: IndexedDB, then localStorage, then memory.
 * Never throws — a game that cannot persist should still boot and say so.
 */
export async function createBrowserStorage(dbName = 'civic-order'): Promise<{
  storage: SaveStorage;
  kind: 'indexeddb' | 'localstorage' | 'memory';
  warning?: string;
}> {
  if (typeof indexedDB !== 'undefined') {
    try {
      return { storage: new IndexedDbAdapter(await openDb(dbName)), kind: 'indexeddb' };
    } catch (e) {
      // fall through
      void e;
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return { storage: new LocalStorageAdapter(localStorage), kind: 'localstorage' };
    } catch (e) {
      void e;
    }
  }
  return {
    storage: new MemoryStorage(),
    kind: 'memory',
    warning: 'Progress cannot be saved in this browser context.',
  };
}
