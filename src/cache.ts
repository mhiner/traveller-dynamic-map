import { openDB } from "idb";

/** Persistence for cached sector metadata and world rows. */
export interface SectorCache {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
  values(): Promise<readonly unknown[]>;
  clear(): Promise<void>;
  /** Apply deletes and writes together when the store can. */
  batch(change: { deleteKeys: readonly string[]; puts: readonly { key: string; value: unknown }[] }): Promise<void>;
}

/** IndexedDB database shared with the Traveller Trade world cache. */
const DATABASE = "traveller-trade";
/** Object store of cached worlds and the sector list. */
const STORE = "worlds";

/**
 * IndexedDB sector cache. Uses the same database and object store as the
 * existing Traveller Trade world cache so sectors already stored still load.
 */
export function indexedDbSectorCache(): SectorCache {
  const db = () =>
    openDB(DATABASE, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("campaign")) database.createObjectStore("campaign");
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      },
    });

  return {
    async get(key) {
      return await (await db()).get(STORE, key);
    },
    async put(key, value) {
      await (await db()).put(STORE, value, key);
    },
    async delete(key) {
      await (await db()).delete(STORE, key);
    },
    async keys() {
      const found = await (await db()).getAllKeys(STORE);
      return found.filter((key): key is string => typeof key === "string");
    },
    async values() {
      return await (await db()).getAll(STORE);
    },
    async clear() {
      await (await db()).clear(STORE);
    },
    async batch(change) {
      const database = await db();
      const tx = database.transaction(STORE, "readwrite");
      for (const key of change.deleteKeys) tx.store.delete(key);
      for (const row of change.puts) tx.store.put(row.value, row.key);
      await tx.done;
    },
  };
}

/** In-memory sector cache. A host test or a custom store can start from this shape. */
export function memorySectorCache(seed?: Readonly<Record<string, unknown>>): SectorCache {
  const rows = new Map<string, unknown>(Object.entries(seed ?? {}));
  const clone = (value: unknown) => value === undefined ? undefined : structuredClone(value);
  return {
    get(key) {
      return Promise.resolve(clone(rows.get(key)));
    },
    put(key, value) {
      rows.set(key, clone(value));
      return Promise.resolve();
    },
    delete(key) {
      rows.delete(key);
      return Promise.resolve();
    },
    keys() {
      return Promise.resolve([...rows.keys()]);
    },
    values() {
      return Promise.resolve([...rows.values()].map((value) => clone(value)));
    },
    clear() {
      rows.clear();
      return Promise.resolve();
    },
    batch(change) {
      for (const key of change.deleteKeys) rows.delete(key);
      for (const row of change.puts) rows.set(row.key, clone(row.value));
      return Promise.resolve();
    },
  };
}
