import { hexDistance } from "./hex.ts";
import { hexesWithin, sectorGrid } from "./jumpChart.ts";
import { liveSession } from "./session.ts";
import { worldsMatching } from "./sectorLibrary.ts";
import type { RouteStop, World } from "./world.ts";
import { worldProfile, type WorldProfile } from "./worldProfile.ts";
import { parseZone, worldId } from "./codes.ts";
import { worldCoordinates, findJumpRoute, type CachedWorld } from "./worldCache.ts";
import { fetchJson, fetchOne, toProfileRecord, usingLibrary } from "./mapFetch.ts";
import { cacheSector, enqueue, readCache, readWorlds, worldCatalog, writeWorlds } from "./worldStore.ts";

/** Worlds farther than this from the current location are left out of a map search. */
export const SEARCH_PARSEC_LIMIT = 160;

export interface SearchHit {
  name: string;
  sector: string;
  hex: string;
  uwp: string;
  worldX: number | null;
  worldY: number | null;
}

export interface WorldSearch {
  hits: SearchHit[];
  /** The query was sent and nothing inside the search range remained. */
  noneInRange: boolean;
}

/** Map coordinates for a search hit. Sector X/Y are the sector's grid position. */
export function searchCoordinates(sectorX: number, sectorY: number, hexX: number, hexY: number): { worldX: number; worldY: number } | null {
  if (!Number.isInteger(hexX) || !Number.isInteger(hexY) || hexX < 1 || hexY < 1) return null;
  return worldCoordinates(sectorX, sectorY, `${String(hexX).padStart(2, "0")}${String(hexY).padStart(2, "0")}`);
}

/** Search hits whose hex distance from the current world is within the limit. */
export function withinSearchRange<T extends { worldX: number | null; worldY: number | null }>(
  originX: number,
  originY: number,
  hits: readonly T[],
  limit = SEARCH_PARSEC_LIMIT,
): T[] {
  return hits.filter((hit) => hit.worldX !== null && hit.worldY !== null && hexDistance(originX, originY, hit.worldX, hit.worldY) <= limit);
}

/** Four-digit sector hex from a column and a row. */
function hexOf(x: number, y: number): string {
  return `${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

/** Worlds whose name contains the query, from Traveller Map. Rows without a sector or a hex are skipped. */
async function remoteHits(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const body = await fetchJson<{
    Results?: { Items?: Array<{ World?: { Name?: string; Uwp?: string; Sector?: string; SectorX?: number; SectorY?: number; HexX?: number; HexY?: number } }> };
  }>(`/travellermap/api/search?q=${encodeURIComponent(query)}`, signal);
  const hits: SearchHit[] = [];
  for (const item of body.Results?.Items ?? []) {
    const world = item.World;
    if (!world?.Name || !world.Uwp || !world.Sector || world.HexX === undefined || world.HexY === undefined) continue;
    // Coordinates need the sector grid. A hit without it stays in the list and is dropped by the range filter.
    const point = typeof world.SectorX === "number" && typeof world.SectorY === "number"
      ? searchCoordinates(world.SectorX, world.SectorY, world.HexX, world.HexY)
      : null;
    hits.push({
      name: world.Name,
      sector: world.Sector,
      hex: hexOf(world.HexX, world.HexY),
      uwp: world.Uwp.toUpperCase(),
      worldX: point?.worldX ?? null,
      worldY: point?.worldY ?? null,
    });
  }
  return hits;
}

/** Search row from a world already stored in a sector. */
function hitFromWorld(world: CachedWorld): SearchHit {
  return {
    name: world.name,
    sector: world.sector,
    hex: world.hex,
    uwp: world.uwp,
    worldX: world.worldX,
    worldY: world.worldY,
  };
}

/**
 * Worlds from the packed sectors whose name contains the query.
 * Null when the pack is off, so the caller can tell "no pack" from "no hits".
 */
async function libraryHits(query: string): Promise<SearchHit[] | null> {
  if (!usingLibrary().on) return null;
  const library = liveSession().sectors!;
  // The index names the sectors. Each of those sectors is opened once and matched again on the world name.
  const wanted = new Map<string, Set<string>>();
  for (const row of await library.search(query)) {
    const names = wanted.get(row.sector) ?? new Set<string>();
    names.add(row.name.toLowerCase());
    wanted.set(row.sector, names);
  }
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const [sectorName, names] of wanted) {
    const sector = await library.sector(sectorName);
    if (!sector) continue;
    for (const world of worldsMatching(sector, query)) {
      if (!names.has(world.name.toLowerCase())) continue;
      const key = `${world.sector}|${world.hex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hitFromWorld(world));
    }
  }
  return hits;
}

/** Pack hits first. A remote hit for the same sector and hex is the same world. */
function mergeHits(local: readonly SearchHit[], remote: readonly SearchHit[]): SearchHit[] {
  const seen = new Set(local.map((hit) => `${hit.sector}|${hit.hex}`));
  return [...local, ...remote.filter((hit) => !seen.has(`${hit.sector}|${hit.hex}`))];
}

/** Name search. The pack is asked first. Traveller Map is skipped when the pack is the only source. */
export async function searchWorlds(
  query: string,
  origin?: { worldX: number | null; worldY: number | null } | null,
  signal?: AbortSignal,
): Promise<WorldSearch> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { hits: [], noneInRange: false };
  const local = await libraryHits(trimmed);
  let remote: SearchHit[] = [];
  if (!usingLibrary().exclusive) {
    try {
      remote = await remoteHits(trimmed, signal);
    } catch (error) {
      // A pack answer is enough when the remote search fails. An abort, or no pack at all, still fails the search.
      if (signal?.aborted || !usingLibrary().on) throw error;
    }
  }
  const hits = mergeHits(local ?? [], remote);
  const originX = origin?.worldX;
  const originY = origin?.worldY;
  const located = originX != null && originY != null ? withinSearchRange(originX, originY, hits) : hits;
  return { hits: located, noneInRange: located.length === 0 };
}

/** Profile for the selected world. A cached survey is used before a fetch. */
export async function loadWorldProfile(sector: string, hex: string, signal?: AbortSignal): Promise<WorldProfile> {
  const cached = await readCache(`${sector}|${hex}`);
  if (cached?.profileReady) {
    const profile = worldProfile(toProfileRecord(cached.world));
    if (profile) {
      // Remarks can omit codes an actor wrote onto the world. Those codes are the ones the sheet should show.
      return profile.tradeCodes.length === 0 && cached.world.tradeCodes.length
        ? { ...profile, tradeCodes: cached.world.tradeCodes }
        : profile;
    }
  }
  const world = await fetchOne(sector, hex, signal);
  const profile = worldProfile(toProfileRecord(world));
  if (!profile) throw new Error(`No world data for ${sector} ${hex}`);
  return profile;
}

/** A world with map coordinates. The cache is used only when both coordinates are stored. */
export async function loadWorld(sector: string, hex: string, signal?: AbortSignal): Promise<World> {
  const cached = await readCache(`${sector}|${hex}`);
  if (cached && cached.world.worldX !== null && cached.world.worldY !== null) return cached.world;
  return await fetchOne(sector, hex, signal);
}

/** A cached world with subsector, bases, and allegiance. Fetches the world when the cache has no profile. */
export async function loadSurveyedWorld(sector: string, hex: string, signal?: AbortSignal): Promise<CachedWorld> {
  const cached = await readCache(`${sector}|${hex}`);
  if (cached?.profileReady) return cached.world;
  const fetched = await fetchOne(sector, hex, signal);
  // A fetch can omit coordinates the cache already had. Keep those so the world stays on the map.
  if ((fetched.worldX !== null && fetched.worldY !== null) || !cached) return fetched;
  return { ...fetched, worldX: cached.world.worldX, worldY: cached.world.worldY };
}

interface RawRouteWorld {
  Name?: string;
  Hex?: string;
  UWP?: string;
  Sector?: string;
  Subsector?: string;
  Zone?: string;
  AllegianceName?: string;
  PBG?: string;
  SectorX?: number;
  SectorY?: number;
  HexX?: number;
  HexY?: number;
}

/** Traveller Map sector grid: 32 columns, 40 rows, hex numbers starting at 1. */
function routeCoordinates(raw: RawRouteWorld): { worldX: number | null; worldY: number | null } {
  if (typeof raw.SectorX !== "number" || typeof raw.SectorY !== "number" || typeof raw.HexX !== "number" || typeof raw.HexY !== "number") {
    return { worldX: null, worldY: null };
  }
  return {
    worldX: raw.SectorX * 32 + raw.HexX - 1,
    worldY: (raw.SectorY - 1) * 40 + raw.HexY,
  };
}

/** One stop from a Traveller Map route world. A row missing a name, sector, hex, or UWP is not a stop. */
function toRouteStop(raw: RawRouteWorld): RouteStop | null {
  if (!raw.Name || !raw.Sector || !raw.Hex || !raw.UWP) return null;
  return {
    name: raw.Name,
    sector: raw.Sector,
    subsector: raw.Subsector ?? "",
    hex: raw.Hex,
    uwp: raw.UWP.toUpperCase(),
    zone: parseZone(raw.Zone),
    allegiance: raw.AllegianceName ?? "",
    pbg: raw.PBG ?? "",
    tradeCodes: [],
    ...routeCoordinates(raw),
  };
}

/** Stops from a Traveller Map route body. An empty list is a failed route, not a route of no jumps. */
export function parseRoute(value: unknown): RouteStop[] {
  if (!Array.isArray(value)) throw new Error("Traveller Map did not return a route.");
  const stops = value.flatMap((item) => {
    const stop = toRouteStop(item as RawRouteWorld);
    return stop ? [stop] : [];
  });
  if (stops.length === 0) throw new Error("Traveller Map did not return a route.");
  return stops;
}

/** A plotted stop from a world the cache or the pack already holds. */
function stopFromCached(world: CachedWorld): RouteStop {
  return {
    name: world.name,
    sector: world.sector,
    subsector: world.subsector,
    hex: world.hex,
    uwp: world.uwp,
    zone: world.zone,
    allegiance: world.allegianceName,
    pbg: world.pbg,
    tradeCodes: world.tradeCodes,
    worldX: world.worldX,
    worldY: world.worldY,
  };
}

/**
 * Use Traveller Map when the cached sectors do not contain a route and the destination is within 160 parsecs.
 * The worlds on that route are cached. A full sector is not stored until a ship arrives there.
 */
export function remoteRouteAllowed(foundLocally: boolean, parsecs: number | null, jump: number, limit = SEARCH_PARSEC_LIMIT): boolean {
  return !foundLocally && jump >= 1 && parsecs !== null && parsecs >= 1 && parsecs <= limit;
}

/** Parsecs between the two ends. Cached coordinates fill in an end the caller did not place. */
function endpointDistance(
  origin: World,
  destination: { sector: string; hex: string; worldX?: number | null; worldY?: number | null },
  worlds: readonly CachedWorld[],
): number | null {
  const located = worlds.find((world) => world.id === origin.id);
  const originX = origin.worldX ?? located?.worldX ?? null;
  const originY = origin.worldY ?? located?.worldY ?? null;
  const cachedDestination = worlds.find((world) => world.sector === destination.sector && world.hex === destination.hex);
  const destinationX = destination.worldX ?? cachedDestination?.worldX ?? null;
  const destinationY = destination.worldY ?? cachedDestination?.worldY ?? null;
  if (originX === null || originY === null || destinationX === null || destinationY === null) return null;
  return hexDistance(originX, originY, destinationX, destinationY);
}

/** A cache row built from the route stop itself, used when that world cannot be fetched. */
function cachedFromStop(stop: RouteStop): CachedWorld {
  return {
    id: worldId({ sector: stop.sector, hex: stop.hex, name: stop.name }),
    name: stop.name,
    sector: stop.sector,
    hex: stop.hex,
    uwp: stop.uwp,
    tradeCodes: [...stop.tradeCodes],
    zone: stop.zone,
    worldX: stop.worldX,
    worldY: stop.worldY,
    manual: false,
    remarks: "",
    pbg: stop.pbg,
    bases: "",
    allegiance: "",
    allegianceName: stop.allegiance,
    subsector: stop.subsector,
  };
}

/** Store each world on a mapped route. A sector already in the cache is left to that sector's copy. */
async function cacheRouteStops(stops: readonly RouteStop[], signal?: AbortSignal): Promise<CachedWorld[]> {
  const saved: CachedWorld[] = [];
  for (const stop of stops) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const existing = await readCache(`${stop.sector}|${stop.hex}`);
    // A surveyed world already in the cache is the copy to keep. Fetching it again would replace a local edit.
    if (existing?.profileReady && existing.world.worldX !== null && existing.world.worldY !== null) {
      saved.push(existing.world);
      continue;
    }
    try {
      saved.push(await fetchOne(stop.sector, stop.hex, signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      saved.push(cachedFromStop(stop));
    }
  }
  return saved;
}

/** A route from Traveller Map. Red worlds are not used as intermediate stops. Jump is kept inside 1 to 12. */
async function mapRoute(
  origin: Pick<World, "sector" | "hex">,
  destination: Pick<World, "sector" | "hex">,
  jump: number,
  signal?: AbortSignal,
): Promise<RouteStop[]> {
  const rating = Math.max(1, Math.min(12, Math.floor(jump)));
  const params = new URLSearchParams({
    start: `${origin.sector} ${origin.hex}`,
    end: `${destination.sector} ${destination.hex}`,
    jump: String(rating),
    nored: "1",
  });
  try {
    return parseRoute(await fetchJson<unknown>(`/travellermap/api/route?${params}`, signal));
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("No route found");
  }
}

/** Worlds from the origin sector and, when it differs, the destination sector. Empty when the pack is off. */
async function routeWorlds(originSector: string, destinationSector: string | undefined): Promise<CachedWorld[]> {
  if (!usingLibrary().on) return [];
  const library = liveSession().sectors!;
  const names = [...new Set([originSector, destinationSector].filter((name): name is string => Boolean(name)))];
  const worlds: CachedWorld[] = [];
  for (const name of names) {
    const sector = await library.sector(name);
    if (sector) worlds.push(...sector.worlds);
  }
  return worlds;
}

/** One row per world id. A world in `extra` replaces the same id from `base`. */
function mergeWorlds(base: readonly CachedWorld[], extra: readonly CachedWorld[]): CachedWorld[] {
  const byId = new Map(base.map((world) => [world.id, world]));
  for (const world of extra) byId.set(world.id, world);
  return [...byId.values()];
}

/**
 * Sector cells a jump can cross between two worlds.
 * The straight line is included, plus the sectors that touch it, so a detour of one sector still has worlds.
 */
export function routeSectorGrids(
  originX: number,
  originY: number,
  destinationX: number,
  destinationY: number,
): { x: number; y: number }[] {
  // One world per step. A sector is 32 by 40, so this walk cannot skip a sector the line enters.
  const steps = Math.max(Math.abs(destinationX - originX), Math.abs(destinationY - originY));
  const onLine = new Map<string, { x: number; y: number }>();
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(originX + (destinationX - originX) * t);
    const y = Math.round(originY + (destinationY - originY) * t);
    const grid = sectorGrid(x, y);
    onLine.set(`${grid.x},${grid.y}`, grid);
  }
  // The eight neighbors of each cell on the line cover a one-sector detour off the straight path.
  const widened = new Map(onLine);
  for (const grid of onLine.values()) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        widened.set(`${grid.x + dx},${grid.y + dy}`, { x: grid.x + dx, y: grid.y + dy });
      }
    }
  }
  return [...widened.values()];
}

/** Worlds in the sectors a jump between these two ends can cross. No coordinates means no extra sectors. */
async function corridorWorlds(
  origin: World,
  destination: { sector: string; hex: string; worldX?: number | null; worldY?: number | null },
  known: readonly CachedWorld[],
): Promise<CachedWorld[]> {
  const library = liveSession().sectors;
  if (!library) return [];
  // Either end may omit coordinates. The worlds already loaded can supply them.
  const originHit = known.find((world) => world.id === origin.id)
    ?? known.find((world) => world.sector === origin.sector && world.hex === origin.hex);
  const destinationHit = known.find((world) => world.sector === destination.sector && world.hex === destination.hex);
  const originX = origin.worldX ?? originHit?.worldX ?? null;
  const originY = origin.worldY ?? originHit?.worldY ?? null;
  const destinationX = destination.worldX ?? destinationHit?.worldX ?? null;
  const destinationY = destination.worldY ?? destinationHit?.worldY ?? null;
  if (originX === null || originY === null || destinationX === null || destinationY === null) return [];
  // Open each cell on its own. The whole pack is not read.
  const worlds: CachedWorld[] = [];
  for (const grid of routeSectorGrids(originX, originY, destinationX, destinationY)) {
    const sector = await library.sectorAt(grid.x, grid.y);
    if (sector) worlds.push(...sector.worlds);
  }
  return worlds;
}

/** A jump route across the cached sectors. Intermediate stops are never red. */
export async function jumpRoute(
  origin: World,
  destination: Pick<World, "sector" | "hex"> & { worldX?: number | null; worldY?: number | null },
  jump: number,
  signal?: AbortSignal,
): Promise<RouteStop[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  // The two named sectors plus whatever is already cached. That is enough for a short jump.
  const packed = await routeWorlds(origin.sector, destination.sector);
  const worlds = mergeWorlds((await readWorlds()).map((hit) => hit.world), packed);
  const destinationId = destination.sector && destination.hex ? `${destination.sector}|${destination.hex}` : "";
  const path = findJumpRoute(worlds, worldId(origin), destinationId, jump);
  if (path) return path.map(stopFromCached);
  if (usingLibrary().exclusive) {
    // The first search missed. Open the sectors along the line and search that set. There is no remote fallback.
    const corridor = await corridorWorlds(origin, destination, worlds);
    const wider = mergeWorlds(worlds, corridor);
    const again = findJumpRoute(wider, worldId(origin), destinationId, jump);
    if (again) return again.map(stopFromCached);
    throw new Error("No route found");
  }
  const parsecs = endpointDistance(origin, destination, worlds);
  if (!remoteRouteAllowed(false, parsecs, jump)) throw new Error("No route found");
  // Traveller Map plots the route. The stops are then stored so the next plot can stay local.
  const stops = await mapRoute(origin, destination, jump, signal);
  const cached = await cacheRouteStops(stops, signal);
  await enqueue(() => writeWorlds(cached));
  return stops.map((stop) => {
    const world = cached.find((item) => item.sector === stop.sector && item.hex === stop.hex);
    return world ? stopFromCached(world) : stop;
  });
}

/** Cached worlds inside the jump rating, nearest first. The coordinate index is the neighbor list. */
export async function worldsWithin(origin: World, jump: number, signal?: AbortSignal): Promise<Array<World & { parsecs: number }>> {
  if (!origin.sector || !origin.hex || origin.manual) return [];
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await cacheSector(origin.sector, [origin.sector], { onlyIfEmpty: true, signal });
  const catalog = await worldCatalog();
  const located = catalog.bySectorHex.get(origin.id)?.world ?? origin;
  if (located.worldX === null || located.worldY === null) return [];
  const rating = Math.max(0, Math.floor(jump));
  const found: Array<World & { parsecs: number }> = [];
  for (const hex of hexesWithin(located.worldX, located.worldY, rating)) {
    const world = catalog.byCoord.get(`${hex.x},${hex.y}`)?.world;
    if (!world || world.id === origin.id || world.worldX === null || world.worldY === null) continue;
    const parsecs = hexDistance(located.worldX, located.worldY, world.worldX, world.worldY);
    if (parsecs < 1 || parsecs > rating) continue;
    found.push({ ...world, parsecs });
  }
  found.sort((a, b) => a.parsecs - b.parsecs || a.name.localeCompare(b.name));
  return found;
}
