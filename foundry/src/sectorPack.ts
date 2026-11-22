import { asStoredSector, asSectorGrid, asWorldIndex, gridPoint, SECTOR_GRID_NAME, WORLD_INDEX_NAME, type SectorLibrary, type StoredSector, type StoredWorldName } from "../../src/sectorLibrary.ts";
import type { CachedWorld } from "../../src/worldCache.ts";
import { COMPENDIUM_DATA, COMPENDIUM_ONLY, MODULE_ID } from "./constants.ts";
import { ensurePack, findPack, readPackIndex } from "./pack.ts";

/** JournalEntry compendium that holds one journal per sector. */
export const SECTOR_PACK_LABEL = "Sector Data";
/** Flag key on a sector journal for the stored sector document. */
const DATA_FLAG = "data";
/** Index field for a sector's grid column. */
const GRID_X = `flags.${MODULE_ID}.${DATA_FLAG}.x`;
/** Index field for a sector's grid row. */
const GRID_Y = `flags.${MODULE_ID}.${DATA_FLAG}.y`;
/** Journal names that are indexes, not sectors. */
const RESERVED = new Set([WORLD_INDEX_NAME.toLowerCase(), SECTOR_GRID_NAME.toLowerCase()]);

/** Bumped when the packed copy is dropped, so an in-flight read does not publish it. */
let generation = 0;
/** Told when charts should forget the packed copy. */
let onChange: (() => void) | null = null;

/** Drop the in-memory copy of Sector Data. The next read loads the pack again. */
export function forgetSectorPack(): void {
  generation += 1;
  onChange?.();
}

/** Called after an import or a setting change so the map picks up the pack. */
export function onSectorPackChange(listener: () => void): void {
  onChange = listener;
}

/** The sector pack as the library the map reads. Enabled and exclusive come from world settings. */
export function foundrySectorLibrary(): SectorLibrary {
  return {
    get enabled() {
      return game.settings.get(MODULE_ID, COMPENDIUM_DATA) === true;
    },
    get exclusive() {
      return game.settings.get(MODULE_ID, COMPENDIUM_ONLY) === true;
    },
    sector: sectorByName,
    sectorAt,
    search: searchNames,
    list: listSectors,
  };
}

/** The Sector Data pack when it already exists. Import and world sync create it separately. */
export function findSectorPack(): FoundryPack | null {
  return findPack(SECTOR_PACK_LABEL);
}

/** The Sector Data journal pack, created when it is missing. Players can read it. */
export function ensureSectorPack(): Promise<FoundryPack | null> {
  return ensurePack(SECTOR_PACK_LABEL, "JournalEntry");
}

/** A sector document. The World Index and the Sector Grid are not sectors. */
export function sectorFromDocument(doc: FoundryDocument): StoredSector | null {
  if (RESERVED.has(doc.name.toLowerCase())) return null;
  return asStoredSector(doc.getFlag(MODULE_ID, DATA_FLAG));
}

interface GridRow {
  id: string;
  name: string;
  x: number | null;
  y: number | null;
}

interface OpenPack {
  generation: number;
  rows: Promise<GridRow[]>;
  coordinates: Promise<GridRow[]> | null;
  sectors: Map<string, Promise<StoredSector | null>>;
  names: Promise<StoredWorldName[]> | null;
}

/** The pack, its grid, and its name index for the current generation. */
let openPack: OpenPack | null = null;

/** The open pack for this generation. A failed index read drops the box so the next call tries again. */
function packState(): OpenPack {
  if (!openPack || openPack.generation !== generation) {
    const rows = readRows().catch((error: unknown) => {
      if (openPack?.rows === rows) openPack = null;
      throw error;
    });
    openPack = { generation, rows, coordinates: null, sectors: new Map(), names: null };
  }
  return openPack;
}

/** Journal index rows. Grid coordinates are read from the index when Foundry stored them there. */
async function readRows(): Promise<GridRow[]> {
  const pack = findSectorPack();
  if (!pack) return [];
  const entries = await readPackIndex(pack, [GRID_X, GRID_Y]);
  return entries.map((entry) => {
    const point = gridPoint(entry, MODULE_ID, DATA_FLAG);
    return { id: entry._id, name: entry.name, x: point?.x ?? null, y: point?.y ?? null };
  });
}

/** Coordinates from the index, or from the one Sector Grid document when the index has none. */
function coordinates(): Promise<GridRow[]> {
  const box = packState();
  if (!box.coordinates) {
    const pending = locateCoordinates(box).catch((error: unknown) => {
      if (box.coordinates === pending) box.coordinates = null;
      throw error;
    });
    box.coordinates = pending;
  }
  return box.coordinates;
}

/** Fill in grid coordinates. The index is enough when any row already has them. Otherwise the Sector Grid document is opened. */
async function locateCoordinates(box: OpenPack): Promise<GridRow[]> {
  const rows = await box.rows;
  if (rows.some((row) => row.x !== null && row.y !== null)) return rows;
  const listed = await readGridDocument(rows);
  if (!listed) return rows;
  const byName = new Map(listed.map((item) => [item.name.toLowerCase(), item]));
  return rows.map((row) => {
    const hit = byName.get(row.name.toLowerCase());
    return hit ? { ...row, x: hit.x, y: hit.y } : row;
  });
}

/** The Sector Grid journal, used when the compendium index does not project coordinates. */
async function readGridDocument(rows: readonly GridRow[]): Promise<ReturnType<typeof asSectorGrid>> {
  const entry = rows.find((row) => row.name === SECTOR_GRID_NAME);
  const pack = findSectorPack();
  if (!entry || !pack) return null;
  const doc = await pack.getDocument(entry.id);
  return asSectorGrid(doc.getFlag(MODULE_ID, DATA_FLAG));
}

/** Keep a sector that was just written, so the next chart does not reopen that journal. */
function rememberPackedSector(sector: StoredSector): void {
  const box = openPack;
  if (!box || box.generation !== generation) return;
  box.sectors.set(sector.name.trim().toLowerCase(), Promise.resolve(sector));
}

/** One sector by name. The document is opened once per generation and reused. */
function sectorByName(name: string): Promise<StoredSector | null> {
  const needle = name.trim().toLowerCase();
  if (!needle || RESERVED.has(needle)) return Promise.resolve(null);
  const box = packState();
  const cached = box.sectors.get(needle);
  if (cached) return cached;
  // A failed open is removed so the next call can try the journal again.
  const pending = loadSector(needle).catch((error: unknown) => {
    if (box.sectors.get(needle) === pending) box.sectors.delete(needle);
    throw error;
  });
  box.sectors.set(needle, pending);
  return pending;
}

/** Open the journal whose name matches and read its sector flag. */
async function loadSector(needle: string): Promise<StoredSector | null> {
  const box = packState();
  const row = (await box.rows).find((item) => item.name.toLowerCase() === needle);
  const pack = findSectorPack();
  if (!row || !pack) return null;
  const doc = await pack.getDocument(row.id);
  return sectorFromDocument(doc);
}

/** The sector at a grid cell, resolved through the coordinate list and then by name. */
async function sectorAt(x: number, y: number): Promise<StoredSector | null> {
  const row = (await coordinates()).find((item) => item.x === x && item.y === y);
  if (!row) return null;
  return sectorByName(row.name);
}

/** World Index rows whose name contains the query. Fewer than two characters matches nothing. */
async function searchNames(query: string): Promise<readonly StoredWorldName[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const names = await worldNames();
  return names.filter((row) => row.name.toLowerCase().includes(needle));
}

/** The World Index, opened once per generation. A failed read is forgotten so the next search can retry. */
function worldNames(): Promise<StoredWorldName[]> {
  const box = packState();
  if (!box.names) {
    const pending = readWorldNames(box).catch((error: unknown) => {
      if (box.names === pending) box.names = null;
      throw error;
    });
    box.names = pending;
  }
  return box.names;
}

/** Open the World Index journal and read its name list. */
async function readWorldNames(box: OpenPack): Promise<StoredWorldName[]> {
  const entry = (await box.rows).find((row) => row.name === WORLD_INDEX_NAME);
  const pack = findSectorPack();
  if (!entry || !pack) return [];
  const doc = await pack.getDocument(entry.id);
  return asWorldIndex(doc.getFlag(MODULE_ID, DATA_FLAG)) ?? [];
}

export type PackedWorldWrite = "updated" | "unchanged" | "missing" | "locked" | "unmatched";

/** Replace the world at this sector grid cell and hex. The sector name must match the stored sector. */
export async function updatePackedWorld(
  match: { sector: string; sectorX: number; sectorY: number; hex: string },
  revise: (world: CachedWorld) => CachedWorld,
): Promise<{ status: PackedWorldWrite; sector: string; world?: CachedWorld }> {
  const pack = findSectorPack();
  if (!pack) return { status: "missing", sector: "" };
  if (pack.locked) return { status: "locked", sector: "" };
  const row = (await coordinates()).find((item) => item.x === match.sectorX && item.y === match.sectorY && item.name.toLowerCase() === match.sector.trim().toLowerCase());
  if (!row) return { status: "unmatched", sector: "" };
  const doc = await pack.getDocument(row.id);
  const stored = sectorFromDocument(doc);
  if (!stored || stored.x !== match.sectorX || stored.y !== match.sectorY) return { status: "unmatched", sector: "" };
  const index = stored.worlds.findIndex((world) => world.hex === match.hex);
  if (index < 0) return { status: "unmatched", sector: "" };
  const current = stored.worlds[index];
  const next = revise(current);
  if (sameSurvey(current, next)) return { status: "unchanged", sector: stored.name };
  // Replace one world in a copy of the sector and write that flag. The rest of the sector is unchanged.
  const worlds = stored.worlds.slice();
  worlds[index] = next;
  const revised = { ...stored, worlds };
  await doc.setFlag(MODULE_ID, DATA_FLAG, revised);
  rememberPackedSector(revised);
  // A new name has to land in the World Index. The cached name list is dropped so the next search reads it.
  if (current.name !== next.name) {
    await renameIndexedWorld(pack, stored.name, current.name, next.name);
    if (openPack && openPack.generation === generation) openPack.names = null;
  }
  return { status: "updated", sector: stored.name, world: next };
}

/** Change the first matching name in one sector. Later duplicates of that name are left alone. */
async function renameIndexedWorld(pack: FoundryPack, sector: string, from: string, to: string): Promise<void> {
  const rows = await packState().rows;
  const entry = rows.find((row) => row.name === WORLD_INDEX_NAME);
  if (!entry) return;
  const doc = await pack.getDocument(entry.id);
  const names = asWorldIndex(doc.getFlag(MODULE_ID, DATA_FLAG));
  if (!names) return;
  const sectorKey = sector.trim().toLowerCase();
  const fromKey = from.trim().toLowerCase();
  const name = to.trim();
  if (!name || fromKey === name.toLowerCase()) return;
  let replaced = false;
  const next = names.map((row) => {
    if (replaced || row.sector.trim().toLowerCase() !== sectorKey || row.name.trim().toLowerCase() !== fromKey) return row;
    replaced = true;
    return { name, sector: row.sector };
  });
  if (!replaced) return;
  next.sort((a, b) => a.name.localeCompare(b.name) || a.sector.localeCompare(b.sector));
  await doc.setFlag(MODULE_ID, DATA_FLAG, { kind: "world-index", worlds: next });
}

/** True when the actor edit did not change any field the sector stores. */
function sameSurvey(current: CachedWorld, next: CachedWorld): boolean {
  return current.name === next.name
    && current.uwp === next.uwp
    && current.zone === next.zone
    && current.bases === next.bases
    && current.pbg === next.pbg
    && current.allegiance === next.allegiance
    && current.allegianceName === next.allegianceName
    && current.worldX === next.worldX
    && current.worldY === next.worldY
    && current.tradeCodes.join("\0") === next.tradeCodes.join("\0");
}

/** Every packed sector. Kept for a full-pack read. Routes open sectors by grid coordinate instead. */
/** Every sector journal. The chart and routes open sectors by name or grid instead of calling this. */
async function listSectors(): Promise<readonly StoredSector[]> {
  const rows = await packState().rows;
  const sectors: StoredSector[] = [];
  for (const row of rows) {
    if (RESERVED.has(row.name.toLowerCase())) continue;
    const sector = await sectorByName(row.name);
    if (sector) sectors.push(sector);
  }
  return sectors;
}
