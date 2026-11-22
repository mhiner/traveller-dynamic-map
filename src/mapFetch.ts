import { liveSession } from "./session.ts";
import { libraryMode, type StoredSector } from "./sectorLibrary.ts";
import type { World, Zone } from "./world.ts";
import { isUnknownUwp, type MapWorldRecord } from "./worldProfile.ts";
import type { ChartWorldRecord } from "./jumpChart.ts";
import { parseZone, tradeCodesFromRemarks, worldId } from "./codes.ts";
import { worldsFromTab, type CachedWorld, type SectorLabels } from "./worldCache.ts";

interface RawWorld {
  Name?: string;
  Hex?: string;
  UWP?: string;
  Remarks?: string;
  Zone?: string;
  Sector?: string;
  WorldX?: number;
  WorldY?: number;
  PBG?: string;
  Bases?: string;
  Allegiance?: string;
  AllegianceName?: string;
  Subsector?: string;
  SubsectorName?: string;
}

/** Whether the sector pack is in use, and whether it is the only source. */
export function usingLibrary(): { on: boolean; exclusive: boolean } {
  return libraryMode(liveSession().sectors);
}

/** One packed sector by name. Null when the pack is off or the name is blank. */
export async function storedSector(name: string): Promise<StoredSector | null> {
  const mode = libraryMode(liveSession().sectors);
  if (!mode.on || !name) return null;
  return await liveSession().sectors!.sector(name);
}

/** The packed sector at this grid cell. Null when the pack is off or the cell is empty. */
export async function storedSectorAt(x: number, y: number): Promise<StoredSector | null> {
  const mode = libraryMode(liveSession().sectors);
  if (!mode.on) return null;
  return await liveSession().sectors!.sectorAt(x, y);
}

/** A map world from a Traveller Map record. An unnamed surveyed world is dropped. An unnamed unknown world keeps its hex as the name. */
function toWorld(raw: RawWorld): World | null {
  const uwp = raw.UWP?.trim() ?? "";
  const unknown = isUnknownUwp(uwp);
  if (!uwp || !raw.Sector || !raw.Hex || (!raw.Name?.trim() && !unknown)) return null;
  const name = raw.Name?.trim() || raw.Hex;
  return {
    id: worldId({ sector: raw.Sector, hex: raw.Hex, name }),
    name,
    sector: raw.Sector,
    hex: raw.Hex,
    uwp: uwp.toUpperCase(),
    tradeCodes: tradeCodesFromRemarks(raw.Remarks ?? ""),
    zone: parseZone(raw.Zone) as Zone,
    worldX: typeof raw.WorldX === "number" ? raw.WorldX : null,
    worldY: typeof raw.WorldY === "number" ? raw.WorldY : null,
    manual: false,
  };
}

/** The same world plus the survey fields the cache and the profile need. */
function toCached(raw: RawWorld): CachedWorld | null {
  const world = toWorld(raw);
  if (!world) return null;
  return {
    ...world,
    remarks: raw.Remarks ?? "",
    pbg: raw.PBG ?? "",
    bases: raw.Bases ?? "",
    allegiance: typeof raw.Allegiance === "string" ? raw.Allegiance : "",
    allegianceName: typeof raw.AllegianceName === "string" ? raw.AllegianceName : "",
    subsector: (typeof raw.SubsectorName === "string" && raw.SubsectorName.trim()) || (typeof raw.Subsector === "string" ? raw.Subsector.trim() : ""),
  };
}

/** Profile input from a cached world. The profile builder reads Traveller Map field names. */
export function toProfileRecord(world: CachedWorld): MapWorldRecord {
  return {
    Name: world.name,
    Hex: world.hex,
    UWP: world.uwp,
    PBG: world.pbg,
    Zone: world.zone,
    Bases: world.bases,
    Allegiance: world.allegiance,
    Remarks: world.remarks,
    Sector: world.sector,
    SubsectorName: world.subsector,
    AllegianceName: world.allegianceName,
  };
}

/** Chart input from a cached world. Trade codes are passed through so an actor edit is drawn, not re-parsed from remarks. */
export function toChartRecord(world: CachedWorld): ChartWorldRecord {
  return {
    Name: world.name,
    Hex: world.hex,
    UWP: world.uwp,
    PBG: world.pbg,
    Zone: world.zone,
    Bases: world.bases,
    Allegiance: world.allegiance,
    AllegianceName: world.allegianceName,
    Remarks: world.remarks,
    Sector: world.sector,
    SubsectorName: world.subsector,
    WorldX: world.worldX ?? undefined,
    WorldY: world.worldY ?? undefined,
    TradeCodes: world.tradeCodes,
  };
}

/** Path the map source expects. Callers include the `/travellermap` prefix the proxy also serves. */
function mapPath(path: string): string {
  const prefix = "/travellermap";
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** A readable failure. JSON `{ error }` is preferred. A route miss is plain text and is kept as-is. */
function errorMessage(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `Traveller Map returned ${status}`;
  try {
    const body = JSON.parse(trimmed) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // The route API reports a miss as plain text.
  }
  return trimmed;
}

/** Plain text from the map source. A non-OK response throws the body's message. */
async function fetchText(path: string, signal?: AbortSignal): Promise<string> {
  const response = await liveSession().source.get(mapPath(path), { accept: "text/plain", signal });
  if (!response.ok) throw new Error(errorMessage(response.text, response.status));
  return response.text;
}

/** JSON from the map source. A non-OK response throws the body's message. */
export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await liveSession().source.get(mapPath(path), { accept: "application/json", signal });
  if (!response.ok) throw new Error(errorMessage(response.text, response.status));
  return JSON.parse(response.text) as T;
}

/** One world. The packed sector wins. An exclusive pack does not fall through to Traveller Map. */
export async function fetchOne(sector: string, hex: string, signal?: AbortSignal): Promise<CachedWorld> {
  const stored = await storedSector(sector);
  const packed = stored?.worlds.find((world) => world.hex === hex);
  if (packed) return packed;
  if (usingLibrary().exclusive) throw new Error(`No world data for ${sector} ${hex}`);
  const body = await fetchJson<{ Worlds?: RawWorld[] }>(
    `/travellermap/data/${encodeURIComponent(sector)}/${encodeURIComponent(hex)}`,
    signal,
  );
  const world = toCached(body.Worlds?.[0] ?? {});
  if (!world) throw new Error(`No world data for ${sector} ${hex}`);
  return world;
}

interface RawSectorMeta {
  X?: number;
  Y?: number;
  Subsectors?: { Name?: string; Index?: string }[];
  Allegiances?: { Name?: string; Code?: string }[];
}

/** Every world in a sector. An exclusive pack with no such sector returns null instead of throwing. */
export async function loadSectorWorlds(sector: string, signal?: AbortSignal): Promise<CachedWorld[] | null> {
  try {
    return await fetchSectorWorlds(sector, signal);
  } catch (error) {
    if (usingLibrary().exclusive && error instanceof Error && error.message.startsWith("No sector data")) return null;
    throw error;
  }
}

/** Worlds for one sector. A packed document is returned whole. Otherwise the tab file and the metadata are read together. */
async function fetchSectorWorlds(sector: string, signal?: AbortSignal): Promise<CachedWorld[]> {
  const stored = await storedSector(sector);
  if (stored) {
    if (stored.worlds.length === 0) throw new Error(`No sector data for ${sector}`);
    return stored.worlds;
  }
  if (usingLibrary().exclusive) throw new Error(`No sector data for ${sector}`);
  const [tab, meta] = await Promise.all([
    fetchText(`/travellermap/data/${encodeURIComponent(sector)}/tab`, signal),
    fetchJson<RawSectorMeta>(`/travellermap/api/metadata?sector=${encodeURIComponent(sector)}`, signal),
  ]);
  if (typeof meta.X !== "number" || typeof meta.Y !== "number") throw new Error(`No sector data for ${sector}`);
  const labels: SectorLabels = {
    x: meta.X,
    y: meta.Y,
    subsectors: new Map((meta.Subsectors ?? []).flatMap((row) => (row.Index && row.Name ? [[row.Index, row.Name] as const] : []))),
    allegiances: new Map((meta.Allegiances ?? []).flatMap((row) => (row.Code && row.Name ? [[row.Code, row.Name] as const] : []))),
  };
  const worlds = worldsFromTab(sector, tab, labels);
  if (worlds.length === 0) throw new Error(`No sector data for ${sector}`);
  return worlds;
}
