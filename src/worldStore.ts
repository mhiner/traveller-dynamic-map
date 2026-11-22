import type { SectorCache } from "./cache.ts";
import { hexesWithin } from "./jumpChart.ts";
import { liveSession } from "./session.ts";
import type { World } from "./world.ts";
import { loadSectorWorlds } from "./mapFetch.ts";
import {
  admitSector,
  holdExtraSector,
  asStoredWorld,
  DEFAULT_SECTOR_LIMIT,
  resizeSectorCache,
  sectorCacheLimit,
  hasProfileFields,
  SECTOR_CACHE_KEY,
  sectorCacheKeys,
  sectorLoadPlan,
  sectorWorldCounts,
  withoutSectors,
  type CachedSector,
  type CachedWorld,
  type SectorCacheMeta,
} from "./worldCache.ts";

interface WorldDatabase {
  get(_store: string, key: string): Promise<unknown>;
  put(_store: string, value: unknown, key: string): Promise<void>;
  clear(_store: string): Promise<void>;
  getAll(_store: string): Promise<unknown[]>;
  transaction(_store: string, _mode: "readwrite"): {
    store: {
      get(key: string): Promise<unknown>;
      put(value: unknown, key: string): Promise<void>;
      delete(key: string): Promise<void>;
      getAllKeys(): Promise<string[]>;
    };
    done: Promise<void>;
  };
}

/** Adapt the host cache to the small database the sector store uses. A transaction batches deletes and puts. */
function storeFor(cache: SectorCache): WorldDatabase {
  return {
    get(_store, key) {
      return cache.get(key);
    },
    put(_store, value, key) {
      return cache.put(key, value);
    },
    clear() {
      return cache.clear();
    },
    async getAll() {
      return [...await cache.values()];
    },
    transaction() {
      const deleteKeys: string[] = [];
      const puts: { key: string; value: unknown }[] = [];
      let flushed: Promise<void> | null = null;
      // The first read of `done` writes the batch. Later reads wait on that same write.
      const flush = () => {
        if (!flushed) flushed = cache.batch({ deleteKeys: [...deleteKeys], puts: [...puts] });
        return flushed;
      };
      return {
        store: {
          get: (key) => cache.get(key),
          put(value, key) {
            puts.push({ key, value });
            return Promise.resolve();
          },
          delete(key) {
            deleteKeys.push(key);
            return Promise.resolve();
          },
          async getAllKeys() {
            return [...await cache.keys()];
          },
        },
        get done() {
          return flush();
        },
      };
    },
  };
}

/** The cache belonging to the current map session. */
function database(): Promise<WorldDatabase> {
  return Promise.resolve(storeFor(liveSession().cache));
}

export interface CatalogHit {
  world: CachedWorld;
  /** The stored row includes subsector and allegiance, even when a value is blank. */
  profileReady: boolean;
}

/** A catalog row from a stored value. The sector-list marker has no UWP and is ignored. */
function cacheHit(stored: unknown): CatalogHit | undefined {
  if (!stored || typeof stored !== "object" || !("uwp" in stored)) return undefined;
  return { world: asStoredWorld(stored as World), profileReady: hasProfileFields(stored) };
}

/** One cached world by `sector|hex`. Missing and non-world rows are undefined. */
export async function readCache(id: string): Promise<CatalogHit | undefined> {
  const db = await database();
  return cacheHit(await db.get("worlds", id));
}

/** The sector list, or null when the stored value is not that list. A bad row rejects the whole list. */
function parseMeta(stored: unknown): SectorCacheMeta | null {
  if (!stored || typeof stored !== "object" || !("limit" in stored) || !("sectors" in stored)) return null;
  const row = stored as { limit?: unknown; sectors?: unknown };
  if (typeof row.limit !== "number" || !Array.isArray(row.sectors)) return null;
  const sectors: CachedSector[] = [];
  for (const item of row.sectors) {
    if (!item || typeof item !== "object") return null;
    const sector = item as { name?: unknown; cachedAt?: unknown };
    if (typeof sector.name !== "string" || typeof sector.cachedAt !== "number") return null;
    sectors.push({ name: sector.name, cachedAt: sector.cachedAt });
  }
  return { limit: sectorCacheLimit(row.limit), sectors };
}

/** Write a sector limit that was normalized on read. */
async function persistSectorLimit(stored: unknown, parsed: SectorCacheMeta): Promise<void> {
  if (!stored || typeof stored !== "object" || !("limit" in stored)) return;
  if ((stored as { limit: unknown }).limit === parsed.limit) return;
  const db = await database();
  await db.put("worlds", parsed, SECTOR_CACHE_KEY);
}

/** The sector list. A store that still uses the old radius marker is cleared once. */
async function readMeta(): Promise<SectorCacheMeta> {
  const db = await database();
  const stored = await db.get("worlds", SECTOR_CACHE_KEY);
  const parsed = parseMeta(stored);
  if (parsed) {
    await persistSectorLimit(stored, parsed);
    return parsed;
  }
  await db.clear("worlds");
  const fresh: SectorCacheMeta = { limit: DEFAULT_SECTOR_LIMIT, sectors: [] };
  await db.put("worlds", fresh, SECTOR_CACHE_KEY);
  forgetWorldIndex();
  return fresh;
}

export interface WorldCatalog {
  hits: CatalogHit[];
  byCoord: Map<string, CatalogHit>;
  bySectorHex: Map<string, CatalogHit>;
}

/** Bumped when the in-memory catalog must be rebuilt. */
let worldEpoch = 0;
/** The catalog built for one epoch. */
let worldIndex: { epoch: number; catalog: WorldCatalog } | null = null;

/** Drop the in-memory catalog. A rebuild that started earlier sees the new epoch and starts over. */
export function forgetWorldIndex(): void {

  worldEpoch += 1;
  worldIndex = null;
}

/** Every cached world, indexed by coordinates and by sector hex. Rebuilt after the epoch changes. */
export async function worldCatalog(): Promise<WorldCatalog> {
  const remembered = worldIndex;
  if (remembered && remembered.epoch === worldEpoch) return remembered.catalog;
  const epoch = worldEpoch;
  const db = await database();
  const rows = await db.getAll("worlds");
  // A write landed while this read was in flight. The new epoch is the one to publish.
  if (epoch !== worldEpoch) return worldCatalog();
  const hits = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || !("sector" in row)) return [];
    const hit = cacheHit(row);
    return hit && !hit.world.manual ? [hit] : [];
  });
  // One world per hex. A manual world is not a chart or route candidate.
  const byCoord = new Map<string, CatalogHit>();
  const bySectorHex = new Map<string, CatalogHit>();
  for (const hit of hits) {
    const world = hit.world;
    if (world.worldX !== null && world.worldY !== null) byCoord.set(`${world.worldX},${world.worldY}`, hit);
    bySectorHex.set(`${world.sector}|${world.hex}`, hit);
  }
  const catalog = { hits, byCoord, bySectorHex };
  if (epoch !== worldEpoch) return worldCatalog();
  worldIndex = { epoch, catalog };
  return catalog;
}

/** Cached worlds, without the coordinate maps. */
export async function readWorlds(): Promise<CatalogHit[]> {
  return (await worldCatalog()).hits;
}

/** Worlds with a stored profile whose hex is inside the disk. */
export function worldsInRadius(catalog: WorldCatalog, worldX: number, worldY: number, radius: number): CatalogHit[] {
  const found: CatalogHit[] = [];
  for (const hex of hexesWithin(Math.round(worldX), Math.round(worldY), radius)) {
    const hit = catalog.byCoord.get(`${hex.x},${hex.y}`);
    if (hit?.profileReady) found.push(hit);
  }
  return found;
}

/** The cache write in flight. The next write waits for it, and a failure does not block that next write. */
let cacheQueue: Promise<unknown> = Promise.resolve();

/** Run cache writes one at a time. A failed write does not block the next one. */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = cacheQueue.then(task, task);
  cacheQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** Jump-chart memory listens for sector eviction. Chart loading registers the listener. */
let onChartDrop: () => void = () => {};
/** Chart loading drops only the charts that show a revised world. */
let onWorldRevised: (previous: CachedWorld, next: CachedWorld) => void = () => {};

/** Register the callback that clears jump charts when a sector leaves the cache. One listener. */
export function onChartsInvalidated(listener: () => void): void {
  onChartDrop = listener;
}

/** Register the callback that drops charts showing a world that was just replaced. One listener. */
export function onCachedWorldRevised(listener: (previous: CachedWorld, next: CachedWorld) => void): void {
  onWorldRevised = listener;
}

/** Write the sector list and its worlds, and delete worlds that belong to evicted sectors. */
async function commitSector(meta: SectorCacheMeta, evict: readonly string[], worlds: readonly CachedWorld[]): Promise<void> {
  const db = await database();
  const tx = db.transaction("worlds", "readwrite");
  // Keys are `sector|hex`. The sector list itself has no bar and is written below.
  const drop = new Set(evict);
  if (drop.size > 0) {
    const keys = await tx.store.getAllKeys();
    for (const key of keys) {
      if (typeof key !== "string" || !key.includes("|")) continue;
      const name = key.slice(0, key.lastIndexOf("|"));
      if (drop.has(name)) await tx.store.delete(key);
    }
  }
  for (const world of worlds) tx.store.put(world, world.id);
  tx.store.put(meta, SECTOR_CACHE_KEY);
  await tx.done;
  forgetWorldIndex();
  // A new sector does not invalidate charts. A removed sector might still be drawn, so those charts go.
  if (evict.length > 0) onChartDrop();
}

export interface SectorCacheResult {
  status: "ready" | "needs-permission";
  limit?: number;
  sector?: string;
}

/**
 * Store one sector from the Traveller Map tab file.
 * `onlyIfEmpty` fills the cache only when nothing is stored yet.
 * `allowGrow` raises the sector limit by one after the user agrees.
 */
export async function cacheSector(
  sector: string,
  keep: readonly string[],
  options?: { onlyIfEmpty?: boolean; allowGrow?: boolean; beyondLimit?: boolean; signal?: AbortSignal },
): Promise<SectorCacheResult> {
  return await enqueue(() => storeSector(sector, keep, options));
}

/** Sectors stored for a zoomed-out explore map, above the configured limit. */
const exploreOverflow = new Set<string>();

/** Forget which sectors were stored past the limit. The rows themselves stay until they are released. */
export function clearExploreOverflow(): void {
  exploreOverflow.clear();
}

/** Admit one sector, load its worlds, and commit. A sector already stored is left untouched. */
async function storeSector(
  sector: string,
  keep: readonly string[],
  options?: { onlyIfEmpty?: boolean; allowGrow?: boolean; beyondLimit?: boolean; signal?: AbortSignal },
): Promise<SectorCacheResult> {
  const meta = await readMeta();
  if (meta.sectors.some((row) => row.name === sector)) return { status: "ready" };
  if (options?.onlyIfEmpty && meta.sectors.length > 0) return { status: "ready" };
  // A zoomed-out map may keep extra sectors without raising the configured limit. They are released later.
  if (options?.beyondLimit && meta.sectors.length >= meta.limit) {
    const worlds = await loadSectorWorlds(sector, options.signal);
    if (!worlds) return { status: "ready" };
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // The load awaited the network. Another caller may have stored this sector in that time.
    const current = await readMeta();
    if (current.sectors.some((row) => row.name === sector)) return { status: "ready" };
    await commitSector(holdExtraSector(current, sector, Date.now()), [], worlds);
    exploreOverflow.add(sector);
    return { status: "ready" };
  }
  const decision = admitSector(meta, sector, new Set(keep), Date.now(), options?.allowGrow === true);
  if (decision.status === "needs-permission") return { status: "needs-permission", limit: decision.limit, sector: decision.sector };
  const worlds = await loadSectorWorlds(sector, options?.signal);
  if (!worlds) return { status: "ready" };
  await commitSector(decision.meta, decision.evict, worlds);
  return { status: "ready" };
}

/** Drop sectors the explore map stored past the limit. Sectors a ship occupies stay. The limit stays. */
export function releaseExploreSectors(keep: readonly string[] = []): Promise<void> {
  return enqueue(() => dropExploreOverflow(keep));
}

/** Remove overflow sectors that are no longer on screen. Names in `keep` stay, including a sector a ship occupies. */
async function dropExploreOverflow(keep: readonly string[]): Promise<void> {
  const extra = [...exploreOverflow];
  exploreOverflow.clear();
  const stay = new Set(keep);
  const drop = extra.filter((name) => !stay.has(name));
  if (drop.length === 0) return;
  const meta = await readMeta();
  const present = drop.filter((name) => meta.sectors.some((row) => row.name === name));
  if (present.length === 0) return;
  await commitSector(withoutSectors(meta, present), present, []);
}

export interface CachedSectorSummary {
  name: string;
  worlds: number;
}

/** Sectors in the cache and how many stored worlds in each have a UWP. */
export function cachedSectors(): Promise<CachedSectorSummary[]> {
  return enqueue(readCachedSectors);
}

/** The configured number of sectors. A new cache uses six. */
export function sectorCacheLimitValue(): Promise<number> {
  return enqueue(async () => (await readMeta()).limit);
}

/** Save the sector count from Admin and drop the oldest sectors that no longer fit. */
export function setSectorCacheLimit(limit: number, keep: readonly string[] = []): Promise<number> {
  return enqueue(() => writeSectorLimit(limit, keep));
}

/** Apply a new sector count. Nothing is written when the count and the stored sectors are already right. */
async function writeSectorLimit(limit: number, keep: readonly string[]): Promise<number> {
  const meta = await readMeta();
  const decision = resizeSectorCache(meta, limit, new Set(keep));
  if (decision.evict.length === 0 && decision.meta.limit === meta.limit) return meta.limit;
  await commitSector(decision.meta, decision.evict, []);
  return decision.meta.limit;
}

/** Remove every cached world and leave an empty sector list. The sector limit stays. */
export function clearWorldCache(): Promise<void> {
  return enqueue(clearStoredWorlds);
}

/** Remove one sector and the worlds stored under it. */
export function forgetCachedSector(name: string): Promise<void> {
  return enqueue(() => dropCachedSectors(name));
}

/** Write one world that is already cached. Charts that show its hex are dropped. The sector stays. */
export function replaceCachedWorld(world: CachedWorld): Promise<void> {
  return enqueue(() => writeCachedWorld(world));
}

/** Replace one stored world. A world the cache never held is left for the next full sector load. */
async function writeCachedWorld(world: CachedWorld): Promise<void> {
  const db = await database();
  const previous = cacheHit(await db.get("worlds", world.id))?.world ?? null;
  if (!previous) return;
  await db.put("worlds", world, world.id);
  patchCatalog(previous, world);
  // Charts that drew the old hex or the new hex rebuild. Charts of other hexes stay.
  onWorldRevised(previous, world);
}

/** Swap one catalog row in place. A catalog that is already stale is left for the next rebuild. */
function patchCatalog(previous: CachedWorld, next: CachedWorld): void {
  const remembered = worldIndex;
  if (!remembered || remembered.epoch !== worldEpoch) return;
  const catalog = remembered.catalog;
  const prior = catalog.bySectorHex.get(`${previous.sector}|${previous.hex}`);
  // Drop the old coordinates only when they still point at this world. Another world may now occupy them.
  if (prior && previous.worldX !== null && previous.worldY !== null) {
    const coord = `${previous.worldX},${previous.worldY}`;
    if (catalog.byCoord.get(coord) === prior) catalog.byCoord.delete(coord);
  }
  const hit: CatalogHit = { world: next, profileReady: hasProfileFields(next) };
  const index = prior ? catalog.hits.indexOf(prior) : -1;
  if (index >= 0) catalog.hits[index] = hit;
  else catalog.hits.push(hit);
  catalog.bySectorHex.set(`${next.sector}|${next.hex}`, hit);
  if (next.worldX !== null && next.worldY !== null) catalog.byCoord.set(`${next.worldX},${next.worldY}`, hit);
}

/** Empty the store and write back an empty sector list that keeps the previous limit. */
async function clearStoredWorlds(): Promise<void> {
  const db = await database();
  const parsed = parseMeta(await db.get("worlds", SECTOR_CACHE_KEY));
  const limit = parsed?.limit ?? DEFAULT_SECTOR_LIMIT;
  await db.clear("worlds");
  await db.put("worlds", { limit, sectors: [] } satisfies SectorCacheMeta, SECTOR_CACHE_KEY);
  forgetWorldIndex();
  onChartDrop();
}

/** Delete one sector's worlds and take its name off the sector list. Charts are cleared because the sector may be drawn. */
async function dropCachedSectors(name: string): Promise<void> {
  const sector = name.trim();
  if (!sector) return;
  const db = await database();
  const tx = db.transaction("worlds", "readwrite");
  const parsed = parseMeta(await tx.store.get(SECTOR_CACHE_KEY));
  const keys = await tx.store.getAllKeys();
  for (const key of keys) {
    if (typeof key === "string" && sectorCacheKeys([key], [sector]).length > 0) await tx.store.delete(key);
  }
  if (parsed) tx.store.put(withoutSectors(parsed, [sector]), SECTOR_CACHE_KEY);
  await tx.done;
  forgetWorldIndex();
  onChartDrop();
}

/** Sector names from the list, with a count of stored worlds that have a UWP. */
async function readCachedSectors(): Promise<CachedSectorSummary[]> {
  const db = await database();
  const meta = parseMeta(await db.get("worlds", SECTOR_CACHE_KEY));
  if (!meta) return [];
  const rows = await db.getAll("worlds");
  const worlds = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || !("sector" in row) || !("uwp" in row)) return [];
    const sector = (row as { sector?: unknown }).sector;
    const uwp = (row as { uwp?: unknown }).uwp;
    if (typeof sector !== "string" || typeof uwp !== "string" || !uwp.trim()) return [];
    return [{ sector, uwp }];
  });
  return sectorWorldCounts(meta.sectors.map((row) => row.name), worlds);
}

/** Start the cache at login. A manual or unplaced ship does not name a sector to load. */
export function warmWorldCache(origin: World | null): void {
  const sector = origin && !origin.manual && origin.sector && origin.hex ? origin.sector : null;
  void enqueue(() => loadCurrentSector(sector)).catch(() => undefined);
}

/** Load the ship's sector, or reset a store that is not a sector list when no sector is known. */
async function loadCurrentSector(sector: string | null): Promise<void> {
  const db = await database();
  const stored = await db.get("worlds", SECTOR_CACHE_KEY);
  const parsed = parseMeta(stored);
  if (!sector) {
    if (parsed) {
      await persistSectorLimit(stored, parsed);
      return;
    }
    await db.clear("worlds");
    await db.put("worlds", { limit: DEFAULT_SECTOR_LIMIT, sectors: [] } satisfies SectorCacheMeta, SECTOR_CACHE_KEY);
    forgetWorldIndex();
    return;
  }
  const plan = sectorLoadPlan(parsed, sector, Date.now());
  const worlds = await loadSectorWorlds(sector);
  if (!worlds) return;
  if (plan.clear) {
    await db.clear("worlds");
    forgetWorldIndex();
  }
  await commitSector(plan.meta, plan.evict, worlds);
}

/** When a ship arrives in a sector that is not cached, store that sector and drop the oldest if the list is full. */
export function ensureArrivedSector(origin: World | null): void {
  if (!origin || origin.manual || !origin.sector || !origin.hex) return;
  void enqueue(() => loadArrivedSector(origin.sector)).catch(() => undefined);
}

/** Store the sector a ship just entered. A sector already in the list is not fetched again. */
async function loadArrivedSector(sector: string): Promise<void> {
  const db = await database();
  const parsed = parseMeta(await db.get("worlds", SECTOR_CACHE_KEY));
  if (parsed?.sectors.some((row) => row.name === sector)) return;
  const plan = sectorLoadPlan(parsed, sector, Date.now());
  const worlds = await loadSectorWorlds(sector);
  if (!worlds) return;
  if (plan.clear) {
    await db.clear("worlds");
    forgetWorldIndex();
  }
  await commitSector(plan.meta, plan.evict, worlds);
}

/** Store route stops that are not already part of a cached sector. The catalog is rebuilt on the next read. */
export async function writeWorlds(worlds: readonly CachedWorld[]): Promise<void> {
  if (worlds.length === 0) return;
  const db = await database();
  const tx = db.transaction("worlds", "readwrite");
  for (const world of worlds) tx.store.put(world, world.id);
  await tx.done;
  forgetWorldIndex();
}
