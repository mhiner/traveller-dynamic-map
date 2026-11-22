import { hexDistance } from "./hex.ts";
import { hexesWithin } from "./jumpChart.ts";
import type { World, Zone } from "./world.ts";
import { isUnknownUwp } from "./worldProfile.ts";
import { parseZone, tradeCodesFromRemarks, worldId } from "./codes.ts";

/** Sectors kept at once until Admin sets another count. */
export const DEFAULT_SECTOR_LIMIT = 6;

/** A whole number of sectors. A missing value uses the default. One sector is the smallest count. */
export function sectorCacheLimit(stored: number): number {
  if (!Number.isFinite(stored)) return DEFAULT_SECTOR_LIMIT;
  return Math.max(1, Math.floor(stored));
}

/** Marker for the sector list. It is not a system. */
export const SECTOR_CACHE_KEY = "\0sectors";

/** A mapped system kept for UWP calculations, the hex map, and local routes. */
export interface CachedWorld extends World {
  remarks: string;
  pbg: string;
  bases: string;
  allegiance: string;
  allegianceName: string;
  subsector: string;
}

/** Fields that mark a cached world as having a stored profile. A blank allegiance still counts. */
const PROFILE_FIELDS = ["remarks", "pbg", "bases", "allegiance", "allegianceName", "subsector"] as const;

/** True when the row was stored with profile fields. A blank allegiance still counts. */
export function hasProfileFields(value: object): boolean {
  return PROFILE_FIELDS.every((field) => field in value);
}

/** Fill fields older cache rows did not store. */
export function asStoredWorld(value: World): CachedWorld {
  const extra = value as World & Partial<CachedWorld>;
  return {
    ...value,
    manual: false,
    remarks: extra.remarks ?? "",
    pbg: extra.pbg ?? "",
    bases: extra.bases ?? "",
    allegiance: extra.allegiance ?? "",
    allegianceName: extra.allegianceName ?? "",
    subsector: extra.subsector ?? "",
  };
}

export interface CachedSector {
  name: string;
  /** Milliseconds when the sector was stored. The oldest unprotected sector is dropped first. */
  cachedAt: number;
}

export interface SectorCacheMeta {
  /** How many sectors may be stored. Starts at 6. */
  limit: number;
  sectors: CachedSector[];
}

export interface SectorLabels {
  x: number;
  y: number;
  /** Subsector index letter to name. */
  subsectors: ReadonlyMap<string, string>;
  /** Allegiance code to full name. */
  allegiances: ReadonlyMap<string, string>;
}

export type SectorAdmission =
  | { status: "ready"; meta: SectorCacheMeta; evict: string[] }
  | { status: "needs-permission"; limit: number; sector: string };

/**
 * Decide whether a sector fits.
 * A sector already stored is left as it is.
 * Past the limit, the oldest sector that no ship occupies is dropped.
 * When every stored sector still has a ship, the caller must ask before the limit grows by one.
 * On startup, `evictOldest` drops the oldest sector instead of asking.
 */
export function admitSector(
  meta: SectorCacheMeta,
  sector: string,
  keep: ReadonlySet<string>,
  now: number,
  allowGrow = false,
  evictOldest = false,
): SectorAdmission {
  if (meta.sectors.some((row) => row.name === sector)) return { status: "ready", meta, evict: [] };
  let limit = meta.limit;
  if (allowGrow && meta.sectors.length >= limit) limit += 1;
  if (meta.sectors.length < limit) {
    return {
      status: "ready",
      meta: { limit, sectors: [...meta.sectors, { name: sector, cachedAt: now }] },
      evict: [],
    };
  }
  if (evictOldest) {
    const needed = meta.sectors.length + 1 - limit;
    const ordered = [...meta.sectors].sort((a, b) => a.cachedAt - b.cachedAt || a.name.localeCompare(b.name));
    const evict = ordered.slice(0, needed).map((row) => row.name);
    const gone = new Set(evict);
    return {
      status: "ready",
      meta: {
        limit,
        sectors: [...meta.sectors.filter((row) => !gone.has(row.name)), { name: sector, cachedAt: now }],
      },
      evict,
    };
  }
  const needed = meta.sectors.length + 1 - limit;
  const droppable = meta.sectors
    .filter((row) => !keep.has(row.name))
    .sort((a, b) => a.cachedAt - b.cachedAt || a.name.localeCompare(b.name));
  if (droppable.length < needed) return { status: "needs-permission", limit: meta.limit, sector };
  const evict = droppable.slice(0, needed).map((row) => row.name);
  const gone = new Set(evict);
  return {
    status: "ready",
    meta: {
      limit,
      sectors: [...meta.sectors.filter((row) => !gone.has(row.name)), { name: sector, cachedAt: now }],
    },
    evict,
  };
}

/**
 * What to do with the cache when the ledger opens.
 * A missing sector list means the store is still the old radius cache: clear it and keep only the current sector.
 * A sector list keeps its other sectors. The current sector is refreshed, and the oldest sector is dropped when the list is already full.
 */
export function sectorLoadPlan(meta: SectorCacheMeta | null, sector: string, now: number): { clear: boolean; meta: SectorCacheMeta; evict: string[] } {
  if (!meta) {
    return {
      clear: true,
      evict: [],
      meta: { limit: DEFAULT_SECTOR_LIMIT, sectors: [{ name: sector, cachedAt: now }] },
    };
  }
  if (meta.sectors.some((row) => row.name === sector)) {
    return {
      clear: false,
      evict: [],
      meta: {
        ...meta,
        sectors: meta.sectors.map((row) => (row.name === sector ? { ...row, cachedAt: now } : row)),
      },
    };
  }
  const decision = admitSector(meta, sector, new Set(), now, false, true);
  if (decision.status !== "ready") return { clear: false, evict: [], meta };
  return { clear: false, meta: decision.meta, evict: decision.evict };
}

/**
 * Store a new sector count.
 * When the list is longer than that count, the oldest sector with no ship is dropped first.
 * Sectors a ship still occupies are dropped only after those, and only until the list fits.
 */
export function resizeSectorCache(
  meta: SectorCacheMeta,
  limit: number,
  keep: ReadonlySet<string> = new Set(),
): { meta: SectorCacheMeta; evict: string[] } {
  const next = sectorCacheLimit(limit);
  if (meta.sectors.length <= next) return { meta: { ...meta, limit: next }, evict: [] };
  const ordered = [...meta.sectors].sort((a, b) => a.cachedAt - b.cachedAt || a.name.localeCompare(b.name));
  const droppable = ordered.filter((row) => !keep.has(row.name));
  const occupied = ordered.filter((row) => keep.has(row.name));
  const evict = [...droppable, ...occupied].slice(0, meta.sectors.length - next).map((row) => row.name);
  const gone = new Set(evict);
  return {
    meta: { limit: next, sectors: meta.sectors.filter((row) => !gone.has(row.name)) },
    evict,
  };
}

/** Remember a sector past the configured limit. The limit number stays. */
export function holdExtraSector(meta: SectorCacheMeta, sector: string, now: number): SectorCacheMeta {
  if (meta.sectors.some((row) => row.name === sector)) return meta;
  return { ...meta, sectors: [...meta.sectors, { name: sector, cachedAt: now }] };
}

/** The sector list with the named sectors removed. The sector limit stays. */
export function withoutSectors(meta: SectorCacheMeta, names: readonly string[]): SectorCacheMeta {
  const drop = new Set(names);
  if (drop.size === 0) return meta;
  return { limit: meta.limit, sectors: meta.sectors.filter((row) => !drop.has(row.name)) };
}

/** Cache keys `sector|hex` whose sector is named. The sector-list record is not a world key. */
export function sectorCacheKeys(keys: readonly string[], names: readonly string[]): string[] {
  const drop = new Set(names);
  return keys.filter((key) => {
    const split = key.lastIndexOf("|");
    if (split <= 0) return false;
    return drop.has(key.slice(0, split));
  });
}

/** Cached sectors in stored order, with how many worlds in each have a UWP. */
export function sectorWorldCounts(sectors: readonly string[], worlds: readonly { sector: string; uwp: string }[]): { name: string; worlds: number }[] {
  return sectors.map((name) => ({
    name,
    worlds: worlds.filter((world) => world.sector === name && world.uwp.trim() !== "").length,
  }));
}

/** Sector names of the worlds a ship is currently in. */
export function sectorsInUse(worlds: readonly (Pick<World, "sector" | "manual"> | null | undefined)[]): string[] {
  const names: string[] = [];
  for (const world of worlds) {
    if (!world || world.manual || !world.sector || names.includes(world.sector)) continue;
    names.push(world.sector);
  }
  return names;
}

/** Traveller Map world coordinates from a sector's metadata origin and a hex such as 1910. */
export function worldCoordinates(sectorX: number, sectorY: number, hex: string): { worldX: number; worldY: number } | null {
  if (!/^\d{4}$/.test(hex)) return null;
  const hexX = Number(hex.slice(0, 2));
  const hexY = Number(hex.slice(2));
  return {
    worldX: sectorX * 32 + hexX - 1,
    worldY: (sectorY - 1) * 40 + hexY,
  };
}

/**
 * The tab endpoint returns plain text, or a JSON string when the request asks for JSON.
 * The proxy asks for JSON, so the body is a quoted string with escaped tabs.
 */
export function sectorTabText(raw: string): string {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  if (!trimmed.startsWith('"')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
  } catch {
    // A tab file that begins with a quote is still tab text.
  }
  return trimmed;
}

/** Worlds from a Traveller Map sector tab file. `sector` is the full sector name, not the abbreviation in the file. */
export function worldsFromTab(sector: string, tab: string, labels: SectorLabels): CachedWorld[] {
  const lines = sectorTabText(tab).split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  const header = lines[0]?.split("\t") ?? [];
  const column = (names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const hexCol = column(["Hex"]);
  const nameCol = column(["Name"]);
  const uwpCol = column(["UWP"]);
  const ssCol = column(["SS", "Subsector"]);
  const basesCol = column(["Bases"]);
  const remarksCol = column(["Remarks"]);
  const zoneCol = column(["Zone"]);
  const pbgCol = column(["PBG"]);
  const allegianceCol = column(["Allegiance"]);
  if (hexCol < 0 || nameCol < 0 || uwpCol < 0) return [];
  const worlds: CachedWorld[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const hex = cells[hexCol]?.trim() ?? "";
    const name = cells[nameCol]?.trim() ?? "";
    const uwp = cells[uwpCol]?.trim().toUpperCase() ?? "";
    const point = worldCoordinates(labels.x, labels.y, hex);
    if (!uwp || !point || (!name && !isUnknownUwp(uwp))) continue;
    const code = allegianceCol >= 0 ? cells[allegianceCol]?.trim() ?? "" : "";
    const ss = ssCol >= 0 ? cells[ssCol]?.trim() ?? "" : "";
    const remarks = remarksCol >= 0 ? cells[remarksCol] ?? "" : "";
    worlds.push({
      id: worldId({ sector, hex, name }),
      name,
      sector,
      hex,
      uwp,
      tradeCodes: tradeCodesFromRemarks(remarks),
      zone: parseZone(zoneCol >= 0 ? cells[zoneCol] : ""),
      worldX: point.worldX,
      worldY: point.worldY,
      manual: false,
      remarks,
      pbg: pbgCol >= 0 ? cells[pbgCol]?.trim() ?? "" : "",
      bases: basesCol >= 0 ? cells[basesCol]?.trim() ?? "" : "",
      allegiance: code,
      allegianceName: labels.allegiances.get(code) ?? "",
      subsector: labels.subsectors.get(ss) ?? ss,
    });
  }
  return worlds;
}

interface PathWorld {
  id: string;
  zone: Zone;
  worldX: number | null;
  worldY: number | null;
}

/**
 * Fewest jumps, then the shorter distance, from origin to destination.
 * Red systems are not used as intermediate stops. The ends may be red.
 */
export function findJumpRoute<T extends PathWorld>(
  worlds: readonly T[],
  originId: string,
  destinationId: string,
  jump: number,
): T[] | null {
  const rating = Math.max(0, Math.floor(jump));
  if (rating < 1 || originId === destinationId) return null;
  const byId = new Map<string, T>();
  for (const world of worlds) {
    if (world.worldX === null || world.worldY === null) continue;
    byId.set(world.id, world);
  }
  const origin = byId.get(originId);
  const destination = byId.get(destinationId);
  if (!origin || !destination || origin.worldX === null || origin.worldY === null || destination.worldX === null || destination.worldY === null) return null;
  // Red worlds cannot be stepped through. The two ends stay in the set even when they are red.
  const nodes = [...byId.values()].filter((world) => world.zone !== "red" || world.id === originId || world.id === destinationId);
  // One world per hex. Each step looks up the hexes inside the jump rating instead of scanning every world.
  const atHex = new Map<string, T>();
  for (const world of nodes) atHex.set(`${world.worldX},${world.worldY}`, world);

  // Jumps dominate distance. 10_000 keeps a shorter chain ahead of a longer one, then the parsecs break the tie.
  const heuristic = (world: T) => {
    const distance = hexDistance(world.worldX!, world.worldY!, destination.worldX!, destination.worldY!);
    return Math.ceil(distance / rating) * 10_000 + distance;
  };
  const gScore = new Map<string, number>([[origin.id, 0]]);
  const parent = new Map<string, string | null>([[origin.id, null]]);
  const heap: { id: string; f: number; g: number }[] = [{ id: origin.id, f: heuristic(origin), g: 0 }];

  const consider = (from: T, to: T) => {
    const distance = hexDistance(from.worldX!, from.worldY!, to.worldX!, to.worldY!);
    if (distance < 1 || distance > rating) return;
    const next = gScore.get(from.id)! + 10_000 + distance;
    if (next >= (gScore.get(to.id) ?? Number.POSITIVE_INFINITY)) return;
    gScore.set(to.id, next);
    parent.set(to.id, from.id);
    const f = next + heuristic(to);
    let index = heap.length;
    heap.push({ id: to.id, f, g: next });
    while (index > 0) {
      const up = (index - 1) >> 1;
      if (heap[up].f < heap[index].f || (heap[up].f === heap[index].f && heap[up].id <= heap[index].id)) break;
      [heap[up], heap[index]] = [heap[index], heap[up]];
      index = up;
    }
  };

  while (heap.length > 0) {
    const item = popHeap(heap);
    // A later, cheaper path already replaced this entry. Skip the stale one.
    if (item.g !== gScore.get(item.id)) continue;
    if (item.id === destination.id) {
      const path: T[] = [];
      let cursor: string | null = item.id;
      while (cursor) {
        const world = byId.get(cursor);
        if (!world) return null;
        path.push(world);
        cursor = parent.get(cursor) ?? null;
      }
      path.reverse();
      return path;
    }
    const current = byId.get(item.id);
    if (!current) continue;
    for (const hex of hexesWithin(current.worldX!, current.worldY!, rating)) {
      const next = atHex.get(`${hex.x},${hex.y}`);
      if (!next || next.id === current.id) continue;
      consider(current, next);
    }
  }
  return null;
}

/** Take the cheapest open world. Equal cost prefers the earlier id so the path is stable. */
function popHeap(heap: { id: string; f: number; g: number }[]): { id: string; f: number; g: number } {
  const top = heap[0];
  const last = heap.pop();
  if (!last || heap.length === 0) return top;
  heap[0] = last;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1;
    const right = left + 1;
    let best = index;
    if (left < heap.length && (heap[left].f < heap[best].f || (heap[left].f === heap[best].f && heap[left].id < heap[best].id))) best = left;
    if (right < heap.length && (heap[right].f < heap[best].f || (heap[right].f === heap[best].f && heap[right].id < heap[best].id))) best = right;
    if (best === index) break;
    [heap[index], heap[best]] = [heap[best], heap[index]];
    index = best;
  }
  return top;
}
