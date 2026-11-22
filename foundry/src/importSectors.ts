import type { SectorBorder, SectorRoute } from "../../src/jumpChart.ts";
import { indexRows, SECTOR_GRID_NAME, WORLD_INDEX_NAME, type StoredSector } from "../../src/sectorLibrary.ts";
import { worldsFromTab } from "../../src/worldCache.ts";
import { IMPORT_SECTORS, MODULE_ID } from "./constants.ts";
import { documentsIn, indexEntries } from "./pack.ts";
import { ensureSectorPack, findSectorPack, forgetSectorPack, sectorFromDocument, SECTOR_PACK_LABEL } from "./sectorPack.ts";

/** Sector files are read from Traveller Map during a GM import. */
const TRAVELLER_MAP = "https://travellermap.com";
/** Flag key on an imported journal for the sector document. */
const DATA_FLAG = "data";

interface SectorMeta {
  X?: number;
  Y?: number;
  Routes?: SectorRoute[];
  Borders?: SectorBorder[];
  Stylesheet?: string;
  Allegiances?: { Code?: string; Name?: string }[];
  Subsectors?: { Index?: string; Name?: string }[];
  Names?: { Text?: string }[];
}

interface GridBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Ask for two sector-grid corners and save every sector in that box. */
export async function importSectors(): Promise<void> {
  try {
    await runImport();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sector import failed";
    ui.notifications.error(message);
  }
}

/** Ask for the grid box, then save each sector in it and rebuild the World Index last. */
async function runImport(): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can import sector data.");
    return;
  }
  const pack = await ensureSectorPack();
  if (!pack) {
    ui.notifications.error(`The ${SECTOR_PACK_LABEL} compendium could not be created.`);
    return;
  }
  if (pack.locked) {
    ui.notifications.warn(`${SECTOR_PACK_LABEL} is locked. Unlock it, then run the import again.`);
    return;
  }
  const box = await askBox();
  if (!box) return;
  const width = Math.abs(box.x2 - box.x1) + 1;
  const height = Math.abs(box.y2 - box.y1) + 1;
  const cells = width * height;
  const ask = globalThis.confirm;
  if (cells > 36 && typeof ask === "function" && !ask(`This box covers ${cells} sector cells. Continue the import?`)) return;

  const saved: StoredSector[] = [];
  for (const doc of await documentsIn(pack)) {
    const sector = sectorFromDocument(doc);
    if (sector) saved.push(sector);
  }
  const names = new Set(saved.map((sector) => sector.name));
  let added = 0;
  let skipped = 0;
  let empty = 0;
  let failed = 0;
  ui.notifications.info(`Importing ${cells} sector cells into ${SECTOR_PACK_LABEL}.`);
  const xMin = Math.min(box.x1, box.x2);
  const xMax = Math.max(box.x1, box.x2);
  const yMin = Math.min(box.y1, box.y2);
  const yMax = Math.max(box.y1, box.y2);
  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      try {
        const outcome = await importCell(pack, names, saved, x, y);
        if (outcome === "saved") added += 1;
        else if (outcome === "skipped") skipped += 1;
        else empty += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Sector import failed";
        ui.notifications.warn(`${x},${y}: ${message}`);
      }
    }
  }
  await replaceWorldIndex(pack, saved);
  forgetSectorPack();
  ui.notifications.info(`${SECTOR_PACK_LABEL}: saved ${added}, already stored ${skipped}, empty ${empty}, failed ${failed}.`);
}

/** A Configure Settings button. Foundry opens the registered class, and this one starts the import. */
export function registerImportMenu(): void {
  const ApplicationV2 = foundry.applications?.api?.ApplicationV2;
  if (!ApplicationV2) return;
  const Menu = class extends ApplicationV2 {
    override async render(..._args: unknown[]): Promise<this> {
      await importSectors();
      return this;
    }
  };
  game.settings.registerMenu(MODULE_ID, IMPORT_SECTORS, {
    name: "TRAVELLER_ASTROGATION.Settings.ImportSectors.Name",
    label: "TRAVELLER_ASTROGATION.Settings.ImportSectors.Label",
    hint: "TRAVELLER_ASTROGATION.Settings.ImportSectors.Hint",
    icon: "fa-solid fa-download",
    type: Menu,
    restricted: true,
  });
}

/** Two sector-grid corners from the GM. Cancel returns nothing. */
async function askBox(): Promise<GridBox | null> {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) {
    ui.notifications.error("The import dialog is not available in this Foundry version.");
    return null;
  }
  const result = await DialogV2.prompt({
    window: { title: "Import Sector Data" },
    content: `
      <p>Two corners of a sector grid. The box includes both corners. Borders and trade routes are saved with each sector. A sector already in ${SECTOR_PACK_LABEL} is skipped, and the World Index is rebuilt from every stored sector.</p>
      <div class="form-group"><label>First X</label><input type="number" name="x1" step="1"></div>
      <div class="form-group"><label>First Y</label><input type="number" name="y1" step="1"></div>
      <div class="form-group"><label>Second X</label><input type="number" name="x2" step="1"></div>
      <div class="form-group"><label>Second Y</label><input type="number" name="y2" step="1"></div>
    `,
    ok: {
      label: "Import",
      callback: (_event, button) => {
        const form = button.form;
        if (!form) return null;
        const data = new FormData(form);
        return {
          x1: integerField(data.get("x1")),
          y1: integerField(data.get("y1")),
          x2: integerField(data.get("x2")),
          y2: integerField(data.get("y2")),
        };
      },
    },
    rejectClose: false,
  });
  if (!result || typeof result !== "object") return null;
  const box = result as { x1: number | null; y1: number | null; x2: number | null; y2: number | null };
  if (box.x1 === null || box.y1 === null || box.x2 === null || box.y2 === null) {
    ui.notifications.warn("Enter a whole number for each sector coordinate.");
    return null;
  }
  return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

/** A whole number from the dialog, or null when the field is blank or not a number. */
function integerField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

/** Fetch one sector cell and write its journal. A cell with no sector is skipped. */
async function importCell(
  pack: FoundryPack,
  names: Set<string>,
  saved: StoredSector[],
  x: number,
  y: number,
): Promise<"saved" | "skipped" | "empty"> {
  const name = await sectorNameAt(x, y);
  if (!name || name === WORLD_INDEX_NAME || name === SECTOR_GRID_NAME) return "empty";
  if (names.has(name)) return "skipped";
  const sector = await fetchSector(name);
  await JournalEntry.create({
    name: sector.name,
    flags: { [MODULE_ID]: { [DATA_FLAG]: sector } },
  }, { pack: pack.collection });
  names.add(sector.name);
  saved.push(sector);
  return "saved";
}

/** The sector name Traveller Map gives this grid cell. */
async function sectorNameAt(x: number, y: number): Promise<string | null> {
  const meta = await readJson<SectorMeta>(`${TRAVELLER_MAP}/api/metadata?sx=${x}&sy=${y}`);
  return meta.Names?.find((row) => row.Text?.trim())?.Text?.trim() || null;
}

/** Sector metadata and the tab-delimited worlds for one named sector. */
async function fetchSector(name: string): Promise<StoredSector> {
  const [tab, meta] = await Promise.all([
    readText(`${TRAVELLER_MAP}/data/${encodeURIComponent(name)}/tab`),
    readJson<SectorMeta>(`${TRAVELLER_MAP}/api/metadata?sector=${encodeURIComponent(name)}`),
  ]);
  if (typeof meta.X !== "number" || typeof meta.Y !== "number") throw new Error(`No sector data for ${name}`);
  const subsectors = (meta.Subsectors ?? []).flatMap((row) => row.Index && row.Name ? [{ index: row.Index, name: row.Name }] : []);
  const allegiances = (meta.Allegiances ?? []).flatMap((row) => row.Code && row.Name ? [{ code: row.Code, name: row.Name }] : []);
  const worlds = worldsFromTab(name, tab, {
    x: meta.X,
    y: meta.Y,
    subsectors: new Map(subsectors.map((row) => [row.index, row.name])),
    allegiances: new Map(allegiances.map((row) => [row.code, row.name])),
  });
  if (worlds.length === 0) throw new Error(`No sector data for ${name}`);
  return {
    kind: "sector",
    name,
    x: meta.X,
    y: meta.Y,
    worlds,
    routes: meta.Routes ?? [],
    borders: meta.Borders ?? [],
    stylesheet: meta.Stylesheet ?? "",
    allegiances,
    subsectors,
  };
}

/** Rewrite the World Index from the sectors now in the pack. This stays last and single-threaded. */
async function replaceWorldIndex(pack: FoundryPack, sectors: readonly StoredSector[]): Promise<void> {
  const current = findSectorPack() ?? pack;
  for (const entry of indexEntries(await current.getIndex())) {
    if (entry.name !== WORLD_INDEX_NAME && entry.name !== SECTOR_GRID_NAME) continue;
    const doc = await current.getDocument(entry._id);
    await doc.delete();
  }
  await JournalEntry.create({
    name: WORLD_INDEX_NAME,
    flags: { [MODULE_ID]: { [DATA_FLAG]: { kind: "world-index", worlds: indexRows(sectors) } } },
  }, { pack: current.collection });
  await JournalEntry.create({
    name: SECTOR_GRID_NAME,
    flags: {
      [MODULE_ID]: {
        [DATA_FLAG]: {
          kind: "sector-grid",
          sectors: sectors.map((sector) => ({ name: sector.name, x: sector.x, y: sector.y })),
        },
      },
    },
  }, { pack: current.collection });
}

/** JSON from Traveller Map. A failed response raises. */
async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Traveller Map returned ${response.status}`);
  return await response.json() as T;
}

/** Response text from Traveller Map. A failed response raises. */
async function readText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!response.ok) throw new Error(`Traveller Map returned ${response.status}`);
  return await response.text();
}
