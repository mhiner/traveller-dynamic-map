import {
  buildJumpChart,
  hexesWithin,
  nearbySectorGrids,
  sectorGrid,
  type JumpChartView,
  type SectorChartData,
} from "./jumpChart.ts";
import { fetchJson, storedSector, storedSectorAt, toChartRecord, usingLibrary } from "./mapFetch.ts";
import {
  cacheSector,
  clearExploreOverflow,
  forgetWorldIndex,
  onCachedWorldRevised,
  onChartsInvalidated,
  worldCatalog,
  worldsInRadius,
} from "./worldStore.ts";
import type { CachedWorld } from "./worldCache.ts";

/** Sector metadata already opened for a chart, including a recorded miss. */
const sectorSheets = new Map<string, SectorChartData | null>();
/** Sector name at a grid cell, so a second lookup in the same load is free. */
const sectorNames = new Map<string, string>();
/** Jump charts already built, keyed by sector and hex. */
const chartViews = new Map<string, JumpChartView>();

/** Forget jump charts after a sector is evicted.  */
function clearJumpCharts(): void {
  chartViews.clear();
}

onChartsInvalidated(clearJumpCharts);

/** True when this drawn world is the stored world, by sector hex or by the coordinates it was drawn at. */
function worldOnChart(world: { sector: string; hex: string; x: number; y: number }, stored: CachedWorld): boolean {
  if (world.sector === stored.sector && world.hex === stored.hex) return true;
  return stored.worldX !== null && stored.worldY !== null && world.x === stored.worldX && world.y === stored.worldY;
}

/** Drop a remembered chart when the revised hex is drawn on it. Other charts stay. */
function dropChartsCovering(previous: CachedWorld, next: CachedWorld): void {
  // The old coordinates matter when an edit moves the world. Both the previous hex and the new hex can be on a chart.
  const covers = (view: JumpChartView) => view.worlds.some((world) => worldOnChart(world, previous) || worldOnChart(world, next));
  for (const [key, view] of chartViews) {
    if (covers(view)) chartViews.delete(key);
  }
  if (preparedExplore && covers(preparedExplore.chart)) preparedExplore = null;
}

onCachedWorldRevised(dropChartsCovering);

/** Drop in-memoory chart and world indexes after the cache implementation changes. */
export function dropChartMemory(): void {
  forgetWorldIndex();
  clearJumpCharts();
  forgetExploreChart();
  sectorSheets.clear();
  sectorNames.clear();
  clearExploreOverflow();
}

/** chart already built for this hex, ready to draw again without another fetch. */
export function peekJumpChart(sector: string, hex: string): JumpChartView | null {
  return chartViews.get(`${sector}|${hex}`) ?? null;
}

interface PreparedExplore {
  centerX: number;
  centerY: number;
  radius: number;
  chart: JumpChartView;
}

/** The explore chart built before the map is on screen. */
let preparedExplore: PreparedExplore | null = null;

/** Keep a chart built before the explore map is on screen. */
export function rememberExploreChart(worldX: number, worldY: number, radius: number, chart: JumpChartView): void {
  preparedExplore = { centerX: Math.round(worldX), centerY: Math.round(worldY), radius, chart };
}

/** The prepared chart when it is centered on this world. */
export function peekExploreChart(worldX: number, worldY: number): PreparedExplore | null {
  const prepared = preparedExplore;
  if (!prepared) return null;
  if (prepared.centerX !== Math.round(worldX) || prepared.centerY !== Math.round(worldY)) return null;
  return prepared;
}

/** Drop the chart that was built before the explore map opened. */
export function forgetExploreChart(): void {
  preparedExplore = null;
}

/** Routes for one sector. Null means the sector has no metadata sheet. */
async function sectorSheet(name: string, signal?: AbortSignal): Promise<{ sheet: SectorChartData | null; cached: boolean }> {
  if (sectorSheets.has(name)) return { sheet: sectorSheets.get(name) ?? null, cached: true };
  // A packed sector already holds borders and routes. Remember it so the next chart does not reopen the journal.
  const stored = await storedSector(name);
  if (stored) {
    const sheet: SectorChartData = {
      x: stored.x,
      y: stored.y,
      routes: stored.routes,
      borders: stored.borders,
      stylesheet: stored.stylesheet,
      allegiances: stored.allegiances,
    };
    sectorSheets.set(name, sheet);
    return { sheet, cached: true };
  }
  // Exclusive mode has nowhere else to look. Leave it uncached so a later import can fill the sheet.
  if (usingLibrary().exclusive) return { sheet: null, cached: false };
  try {
    const metaSheet = await fetchJson<{
      X?: number;
      Y?: number;
      Routes?: SectorChartData["routes"];
      Borders?: SectorChartData["borders"];
      Stylesheet?: string;
      Allegiances?: { Code?: string; Name?: string }[];
    }>(`/travellermap/api/metadata?sector=${encodeURIComponent(name)}`, signal);
    if (typeof metaSheet.X !== "number" || typeof metaSheet.Y !== "number") {
      sectorSheets.set(name, null);
      return { sheet: null, cached: true };
    }
    const sheet: SectorChartData = {
      x: metaSheet.X,
      y: metaSheet.Y,
      routes: metaSheet.Routes ?? [],
      borders: metaSheet.Borders ?? [],
      stylesheet: metaSheet.Stylesheet ?? "",
      allegiances: (metaSheet.Allegiances ?? []).flatMap((row) => row.Code && row.Name ? [{ code: row.Code, name: row.Name }] : []),
    };
    sectorSheets.set(name, sheet);
    return { sheet, cached: true };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { sheet: null, cached: false };
  }
}

/** Canonical sector name at a metadata grid position. Missing space has no name. */
async function sectorNameAt(x: number, y: number, signal?: AbortSignal): Promise<string | null> {
  const key = `${x},${y}`;
  const remembered = sectorNames.get(key);
  if (remembered) return remembered;
  const stored = await storedSectorAt(x, y);
  if (stored) {
    sectorNames.set(key, stored.name);
    return stored.name;
  }
  if (usingLibrary().exclusive) return null;
  try {
    const meta = await fetchJson<{ Names?: { Text?: string }[] }>(`/travellermap/api/metadata?sx=${x}&sy=${y}`, signal);
    const name = meta.Names?.find((row) => row.Text?.trim())?.Text?.trim() ?? "";
    if (!name) return null;
    sectorNames.set(key, name);
    return name;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/**
 * Store each sector that comes within `parsecs` of this hex, when it is not already cached.
 * Names in `keep` are not evicted. A name in `keep` is still fetched when it is missing.
 */
async function cacheSectorsAround(
  worldX: number,
  worldY: number,
  parsecs: number,
  keepNames: readonly string[],
  signal?: AbortSignal,
  beyondLimit = false,
): Promise<void> {
  const centerX = Math.round(worldX);
  const centerY = Math.round(worldY);
  const home = sectorGrid(centerX, centerY);
  const grids = [home, ...nearbySectorGrids(centerX, centerY, parsecs)];
  // Admission order decides which sector is evicted, so each sector is stored before the next name is resolved.
  const keep = [...keepNames];
  for (const grid of grids) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const name = await sectorNameAt(grid.x, grid.y, signal);
    if (!name) continue;
    const result = await cacheSector(name, keep, { beyondLimit, signal });
    if (result.status === "ready" && !keep.includes(name)) keep.push(name);
  }
}

/** Store each other sector within six parsecs of the chart's center world. */
async function cacheNearbySectors(centerSector: string, worldX: number, worldY: number, signal?: AbortSignal): Promise<void> {
  await cacheSectorsAround(worldX, worldY, 6, [centerSector], signal);
}

/** Hexes and routes around a map position. Missing sectors are cached first. */
export async function loadExploreChart(
  worldX: number,
  worldY: number,
  radius: number,
  keep: readonly string[],
  signal?: AbortSignal,
  beyondLimit = false,
): Promise<JumpChartView> {
  const centerX = Math.round(worldX);
  const centerY = Math.round(worldY);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await cacheSectorsAround(centerX, centerY, radius, keep, signal, beyondLimit);
  const catalog = await worldCatalog();
  // Glyphs come from cached worlds inside the disk. Borders come from every sector the disk touches.
  const records = worldsInRadius(catalog, centerX, centerY, radius).map((hit) => toChartRecord(hit.world));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const grids = new Map<string, { x: number; y: number }>();
  for (const hex of hexesWithin(centerX, centerY, radius)) {
    const grid = sectorGrid(hex.x, hex.y);
    grids.set(`${grid.x},${grid.y}`, grid);
  }
  const lookedUp = await Promise.all([...grids.values()].map((grid) => sectorNameAt(grid.x, grid.y, signal)));
  const names = [...new Set([
    ...records.map((world) => world.Sector).filter((name): name is string => Boolean(name)),
    ...lookedUp.filter((name): name is string => name !== null),
  ])];
  const sectors: SectorChartData[] = [];
  await Promise.all(names.map(async (name) => {
    const result = await sectorSheet(name, signal);
    if (result.sheet) sectors.push(result.sheet);
  }));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return buildJumpChart({ centerX, centerY, worlds: records, sectors, radius });
}

/** Worlds and jump routes for a four-parsec chart around one hex. Worlds come from the cached sectors. */
export async function loadJumpChart(sector: string, hex: string, signal?: AbortSignal): Promise<JumpChartView> {
  const key = `${sector}|${hex}`;
  const remembered = chartViews.get(key);
  // A chart is remembered only after its sector sheets loaded. A partial chart is rebuilt next time.
  if (remembered) return remembered;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await cacheSector(sector, [sector], { onlyIfEmpty: true, signal });
  const chartJump = 4;
  const placed = await worldCatalog();
  const origin = placed.bySectorHex.get(`${sector}|${hex}`);
  if (origin && origin.world.worldX !== null && origin.world.worldY !== null) {
    await cacheNearbySectors(sector, origin.world.worldX, origin.world.worldY, signal);
  }
  const hits = await worldCatalog();
  const cachedCenter = hits.bySectorHex.get(`${sector}|${hex}`);
  if (!cachedCenter || cachedCenter.world.worldX === null || cachedCenter.world.worldY === null) {
    throw new Error(`No world data for ${sector} ${hex}`);
  }
  const centerX = cachedCenter.world.worldX;
  const centerY = cachedCenter.world.worldY;
  const records = worldsInRadius(hits, centerX, centerY, chartJump).map((hit) => toChartRecord(hit.world));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const center = records.find((world) => world.Sector === sector && world.Hex === hex);
  if (!center || typeof center.WorldX !== "number" || typeof center.WorldY !== "number") {
    throw new Error(`No world data for ${sector} ${hex}`);
  }
  const names = [...new Set(records.map((world) => world.Sector).filter((name): name is string => Boolean(name)))];
  const sectors: SectorChartData[] = [];
  let sheetsReady = true;
  // A sheet that could not be loaded this time must not be frozen into the remembered chart.
  await Promise.all(names.map(async (name) => {
    const result = await sectorSheet(name, signal);
    if (!result.cached) sheetsReady = false;
    if (result.sheet) sectors.push(result.sheet);
  }));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const view = buildJumpChart({
    centerX: center.WorldX,
    centerY: center.WorldY,
    worlds: records,
    sectors,
  });
  if (sheetsReady) chartViews.set(key, view);
  return view;
}
