import type { SectorBorder, SectorRoute } from "./jumpChart.ts";
import type { CachedWorld } from "./worldCache.ts";

/** A sector saved for the map: worlds, borders, and trade routes. */
export interface StoredSector {
  kind: "sector";
  name: string;
  x: number;
  y: number;
  worlds: CachedWorld[];
  routes: SectorRoute[];
  borders: SectorBorder[];
  stylesheet: string;
  allegiances: { code: string; name: string }[];
  subsectors: { index: string; name: string }[];
}

/** One row in the world-name index. */
export interface StoredWorldName {
  name: string;
  sector: string;
}

/**
 * Optional sector pack. Omitted, or `enabled` false, leaves every read on the map source.
 * `exclusive` does not call the map source, so the map only shows packed sectors.
 */
export interface SectorLibrary {
  readonly enabled: boolean;
  readonly exclusive: boolean;
  sector(name: string): Promise<StoredSector | null>;
  sectorAt(x: number, y: number): Promise<StoredSector | null>;
  /** World names that contain the query. */
  search(query: string): Promise<readonly StoredWorldName[]>;
  /** Every packed sector. The chart does not use this. A route opens sectors along its line instead. */
  list(): Promise<readonly StoredSector[]>;
}

/** Journal that lists world names. It is not a sector. */
export const WORLD_INDEX_NAME = "World Index";
/** Journal that lists sector names and grid positions. It is not a sector. */
export const SECTOR_GRID_NAME = "Sector Grid";

/** Sector name and grid position, small enough to locate a sector without opening it. */
export interface StoredSectorGridRow {
  name: string;
  x: number;
  y: number;
}

/** How the pack is used. Exclusive implies on, so a pack-only map does not also need the enabled flag. */
export function libraryMode(library: SectorLibrary | null | undefined): { on: boolean; exclusive: boolean } {
  if (!library) return { on: false, exclusive: false };
  const exclusive = library.exclusive === true;
  return { on: library.enabled === true || exclusive, exclusive };
}

/** A sector flag, or null when the value is not a sector. Worlds without a name and hex are dropped. */
export function asStoredSector(value: unknown): StoredSector | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredSector>;
  if (row.kind !== "sector" || typeof row.name !== "string" || !row.name.trim()) return null;
  if (typeof row.x !== "number" || typeof row.y !== "number" || !Array.isArray(row.worlds)) return null;
  return {
    kind: "sector",
    name: row.name,
    x: row.x,
    y: row.y,
    worlds: row.worlds.filter((world) => world && typeof world.name === "string" && typeof world.hex === "string"),
    routes: Array.isArray(row.routes) ? row.routes : [],
    borders: Array.isArray(row.borders) ? row.borders : [],
    stylesheet: typeof row.stylesheet === "string" ? row.stylesheet : "",
    allegiances: Array.isArray(row.allegiances) ? row.allegiances.filter((item) => item && item.code && item.name) : [],
    subsectors: Array.isArray(row.subsectors) ? row.subsectors.filter((item) => item && item.index && item.name) : [],
  };
}

/** Rows of the World Index. A value that is not that index is null. Blank names are skipped. */
export function asWorldIndex(value: unknown): StoredWorldName[] | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { kind?: unknown; worlds?: unknown };
  if (row.kind !== "world-index" || !Array.isArray(row.worlds)) return null;
  const worlds: StoredWorldName[] = [];
  for (const item of row.worlds) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { name?: unknown }).name;
    const sector = (item as { sector?: unknown }).sector;
    if (typeof name !== "string" || typeof sector !== "string" || !name.trim() || !sector.trim()) continue;
    worlds.push({ name, sector });
  }
  return worlds;
}

/** Rows of the Sector Grid. A value that is not that grid is null. Rows without a name and coordinates are skipped. */
export function asSectorGrid(value: unknown): StoredSectorGridRow[] | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { kind?: unknown; sectors?: unknown };
  if (row.kind !== "sector-grid" || !Array.isArray(row.sectors)) return null;
  const sectors: StoredSectorGridRow[] = [];
  for (const item of row.sectors) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { name?: unknown }).name;
    const x = (item as { x?: unknown }).x;
    const y = (item as { y?: unknown }).y;
    if (typeof name !== "string" || !name.trim() || typeof x !== "number" || typeof y !== "number") continue;
    sectors.push({ name, x, y });
  }
  return sectors;
}

/** Grid position stored on a compendium index row. Missing coordinates mean the row was not a sector. */
export function gridPoint(entry: unknown, moduleId: string, flag = "data"): { x: number; y: number } | null {
  if (!entry || typeof entry !== "object") return null;
  const flags = (entry as { flags?: unknown }).flags;
  if (!flags || typeof flags !== "object") return null;
  const scope = (flags as Record<string, unknown>)[moduleId];
  if (!scope || typeof scope !== "object") return null;
  const data = (scope as Record<string, unknown>)[flag];
  if (!data || typeof data !== "object") return null;
  const x = (data as { x?: unknown }).x;
  const y = (data as { y?: unknown }).y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

/** Worlds in this sector whose name contains the query. */
export function worldsMatching(sector: StoredSector, query: string): CachedWorld[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return sector.worlds.filter((world) => world.name.toLowerCase().includes(needle));
}

/** Names for the world index, one row per named world. */
export function indexRows(sectors: readonly StoredSector[]): StoredWorldName[] {
  const rows: StoredWorldName[] = [];
  for (const sector of sectors) {
    for (const world of sector.worlds) {
      if (!world.name.trim()) continue;
      rows.push({ name: world.name, sector: sector.name });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.sector.localeCompare(b.sector));
  return rows;
}
