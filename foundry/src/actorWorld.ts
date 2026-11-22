import type { Zone } from "../../src/world.ts";
import type { CachedWorld } from "../../src/worldCache.ts";
import { isUnknownUwp } from "../../src/worldProfile.ts";
import { cacheSector, loadSurveyedWorld, replaceCachedWorld } from "../../src/travellerMap.ts";
import { MODULE_ID } from "./constants.ts";
import { ensurePack, findPack, readPackIndex } from "./pack.ts";
import { updatePackedWorld } from "./sectorPack.ts";
import "./types.ts";

/** Actor compendium that holds one actor per world. Matching ignores case. */
export const WORLDS_PACK_LABEL = "worlds";
/** Index fields read when looking for an actor that already occupies a hex. */
const LOCATION_FIELDS = [
  "system.world.location.sector",
  "system.world.location.x",
  "system.world.location.y",
];

/** A Mongoose world profile. An unknown digit is still a digit here. */
const UWP_PATTERN = /^([A-HYX?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?])$/i;
/** Actors whose sector write is waiting for the sheet to close. */
const pendingActors = new Set<string>();

export interface WorldActorSource {
  name: string;
  sector: string;
  subsector: string;
  hex: string;
  uwp: string;
  tradeCodes: readonly string[];
  zone: Zone;
  worldX: number | null;
  worldY: number | null;
  pbg: string;
  bases: string;
  allegiance: string;
  allegianceName: string;
}

export interface WorldActorFields {
  folders: [string, string];
  sectorX: number;
  sectorY: number;
  x: number;
  y: number;
  port: string;
  size: number;
  atmosphere: number;
  hydrographics: number;
  population: number;
  government: number;
  lawLevel: number;
  techLevel: number;
  zone: "Amber" | "Red" | null;
  bases: string;
  codes: string;
  popDigit: number;
  allegiance: string;
  description: string;
}

/** An unnamed unknown world is labeled by sector and hex, for example Foreven 1808. */
export function actorDisplayName(world: { name: string; sector: string; hex: string; uwp: string }): string {
  const name = world.name.trim();
  if (name || !isUnknownUwp(world.uwp)) return name;
  return [world.sector.trim(), world.hex.trim()].filter(Boolean).join(" ");
}

/** Compendium folder pair. A blank sector or subsector still gets a folder so the actor can be filed. */
export function worldFolderNames(sector: string, subsector: string): [string, string] {
  return [sector.trim() || "Unknown sector", subsector.trim() || "Unknown subsector"];
}

/** Base letters as a comma-separated list. A packed string such as "NS" is split into letters. */
export function baseCodes(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const parts = text.includes(",") || /\s/.test(text) ? text.split(/[\s,]+/).filter(Boolean) : [...text];
  return parts.join(", ");
}

/** Sector grid and hex column/row. Hex 1910 in sector -4,-1 is Regina. */
export function sectorHex(worldX: number | null, worldY: number | null, hex: string): { sectorX: number; sectorY: number; x: number; y: number } | null {
  if (!/^\d{4}$/.test(hex)) return null;
  const x = Number(hex.slice(0, 2));
  const y = Number(hex.slice(2));
  if (worldX === null || worldY === null) return { sectorX: 0, sectorY: 0, x, y };
  const sectorX = (worldX - x + 1) / 32;
  const sectorY = (worldY - y) / 40 + 1;
  if (!Number.isInteger(sectorX) || !Number.isInteger(sectorY)) return { sectorX: 0, sectorY: 0, x, y };
  return { sectorX, sectorY, x, y };
}

/** Mongoose Traveller world fields from a surveyed world. An unreadable UWP or hex returns null. */
export function worldActorFields(world: WorldActorSource): WorldActorFields | null {
  const place = sectorHex(world.worldX, world.worldY, world.hex);
  const match = UWP_PATTERN.exec(world.uwp.trim().toUpperCase());
  if (!place || !match) return null;
  // The actor sheet stores numbers. An unknown digit becomes 0, and an unknown starport becomes X.
  const digit = (code: string) => {
    if (code === "?") return 0;
    const value = Number.parseInt(code, 16);
    return Number.isNaN(value) ? 0 : value;
  };
  const popDigit = digit(world.pbg.trim()[0] ?? "?");
  return {
    folders: worldFolderNames(world.sector, world.subsector),
    sectorX: place.sectorX,
    sectorY: place.sectorY,
    x: place.x,
    y: place.y,
    port: match[1] === "?" ? "X" : match[1],
    size: digit(match[2]),
    atmosphere: digit(match[3]),
    hydrographics: digit(match[4]),
    population: digit(match[5]),
    government: digit(match[6]),
    lawLevel: digit(match[7]),
    techLevel: digit(match[8]),
    zone: world.zone === "amber" ? "Amber" : world.zone === "red" ? "Red" : null,
    bases: baseCodes(world.bases),
    codes: world.tradeCodes.join(", "),
    popDigit: popDigit === 0 && digit(match[5]) > 0 ? 1 : popDigit,
    allegiance: world.allegianceName.trim() || world.allegiance.trim(),
    description: `${world.sector} ${world.hex} · ${world.uwp.trim().toUpperCase()}`,
  };
}

export interface ExistingWorld {
  name: string;
  type: string;
  sector: string;
  x: number;
  y: number;
  folderId: string | null;
}

/** An existing actor for this world: the same name at the same hex, or the same name already in the destination folder. */
export function matchingWorld(actors: readonly ExistingWorld[], world: { name: string; sector: string; x: number; y: number }, folderId: string | null): ExistingWorld | null {
  const name = world.name.trim().toLowerCase();
  const sector = world.sector.trim().toLowerCase();
  return actors.find((actor) => {
    if (actor.type !== "world" || actor.name.trim().toLowerCase() !== name) return false;
    const samePlace = actor.sector.trim().toLowerCase() === sector && actor.x === world.x && actor.y === world.y;
    const sameFolder = folderId !== null && actor.folderId === folderId;
    return samePlace || sameFolder;
  }) ?? null;
}

export interface ActorWorldUpdate {
  name: string;
  sector: string;
  sectorX: number;
  sectorY: number;
  x: number;
  y: number;
  port: string;
  size: number;
  atmosphere: number;
  hydrographics: number;
  population: number;
  government: number;
  lawLevel: number;
  techLevel: number;
  zone: string | null;
  bases: string;
  codes: string;
  popDigit: number | null;
  allegiance: string;
}

/** Hex column and row, as stored on a sector world. */
export function planetHex(x: number, y: number): string {
  return `${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

/** Absolute map position from a sector grid cell and a planet hex. Hex 1910 in sector -4,-1 is Regina. */
export function worldCoordinates(sectorX: number, sectorY: number, x: number, y: number): { worldX: number; worldY: number } {
  return { worldX: sectorX * 32 + x - 1, worldY: (sectorY - 1) * 40 + y };
}

/** Copy the actor's survey onto the sector world at the same hex. Location and allegiance code stay put. */
export function applyActorWorld(world: CachedWorld, actor: ActorWorldUpdate): CachedWorld {
  const place = worldCoordinates(actor.sectorX, actor.sectorY, actor.x, actor.y);
  const port = actor.port.trim().toUpperCase().slice(0, 1) || "X";
  return {
    ...world,
    name: actor.name.trim() || world.name,
    uwp: `${port}${ehex(actor.size)}${ehex(actor.atmosphere)}${ehex(actor.hydrographics)}${ehex(actor.population)}${ehex(actor.government)}${ehex(actor.lawLevel)}-${ehex(actor.techLevel)}`,
    tradeCodes: actor.codes.split(/[\s,]+/).filter(Boolean),
    zone: actor.zone?.trim().toLowerCase() === "amber" || actor.zone?.trim().toLowerCase() === "a"
      ? "amber"
      : actor.zone?.trim().toLowerCase() === "red" || actor.zone?.trim().toLowerCase() === "r"
      ? "red"
      : "green",
    bases: actor.bases.split(/[\s,]+/).filter(Boolean).join(""),
    pbg: actor.popDigit === null ? world.pbg : `${ehex(actor.popDigit)}${world.pbg.trim().slice(1)}`,
    allegianceName: actor.allegiance.trim() || world.allegianceName,
    worldX: place.worldX,
    worldY: place.worldY,
  };
}

/** Name and survey edits are written back. Folder and sort changes are not. */
export function actorUpdateMatters(changed: unknown): boolean {
  if (!changed || typeof changed !== "object") return false;
  return "name" in changed || "system" in changed;
}

/** An open world sheet holds the sector write until that sheet closes. */
export function sectorSyncAction(sheetOpen: boolean): "defer" | "write" {
  return sheetOpen ? "defer" : "write";
}

/** The survey on a world actor, or null when the location or profile is incomplete. */
export function readActorUpdate(actor: FoundryActor): ActorWorldUpdate | null {
  const location = actor.system?.world?.location;
  const uwp = actor.system?.world?.uwp;
  const sector = typeof location?.sector === "string" ? location.sector.trim() : "";
  const sectorX = finite(location?.sectorX);
  const sectorY = finite(location?.sectorY);
  const x = finite(location?.x);
  const y = finite(location?.y);
  if (!sector || sectorX === null || sectorY === null || x === null || y === null || !uwp?.port) return null;
  const popDigit = finite(actor.system?.world?.extra?.popDigit);
  return {
    name: actor.name,
    sector,
    sectorX,
    sectorY,
    x,
    y,
    port: uwp.port,
    size: finite(uwp.size) ?? 0,
    atmosphere: finite(uwp.atmosphere) ?? 0,
    hydrographics: finite(uwp.hydrographics) ?? 0,
    population: finite(uwp.population) ?? 0,
    government: finite(uwp.government) ?? 0,
    lawLevel: finite(uwp.lawLevel) ?? 0,
    techLevel: finite(uwp.techLevel) ?? 0,
    zone: typeof uwp.zone === "string" ? uwp.zone : null,
    bases: uwp.bases ?? "",
    codes: uwp.codes ?? "",
    popDigit,
    allegiance: actor.system?.world?.extra?.allegiance ?? "",
  };
}

/** The latest actor document to write when its sheet closes. */
const pendingSectorWrites = new Map<string, FoundryActor>();

/** Identity of a worlds-compendium actor. The pack id keeps two packs from sharing a queue slot. */
function actorKey(actor: { pack?: string | null; id: string }): string {
  return `${actor.pack ?? ""}|${actor.id}`;
}

/** The sheet object exists only after the world has been opened. */
function actorSheetOpen(actor: object): boolean {
  const held = (actor as { _sheet?: { rendered?: boolean } | null })._sheet;
  return held?.rendered === true;
}

/** The actor on a closing sheet. A hook argument that is not a sheet is ignored. */
function sheetActor(sheet: unknown): FoundryActor | null {
  if (!sheet || typeof sheet !== "object") return null;
  const actor = (sheet as { actor?: FoundryActor }).actor;
  if (!actor || typeof actor.id !== "string") return null;
  return actor;
}

/** Write the sector in the background. A failure is logged and does not reject the sheet close. */
function runSectorSync(actor: FoundryActor): void {
  void syncUpdatedWorldActor(actor).catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : "The sector data could not be updated.";
    console.error(`${MODULE_ID} | ${message}`, reason);
  });
}

/** Hold a worlds-compendium edit until its sheet closes. An edit with no open sheet is written now. */
function queueWorldActor(actor: FoundryActor): void {
  const pack = worldsPack();
  if (!pack || actor.pack !== pack.collection) return;
  if (sectorSyncAction(actorSheetOpen(actor)) === "defer") {
    pendingSectorWrites.set(actorKey(actor), actor);
    return;
  }
  pendingSectorWrites.delete(actorKey(actor));
  runSectorSync(actor);
}

/** Write the actor that was waiting on this sheet. An actor that was not queued is left alone. */
function flushWorldActor(actor: FoundryActor): void {
  if (!pendingSectorWrites.delete(actorKey(actor))) return;
  runSectorSync(actor);
}

/** Write an edited worlds-compendium actor back to Sector Data when its sheet closes. */
export function installWorldActorSync(): void {
  Hooks.on("updateActor", (...args: unknown[]) => {
    const userId = args[3];
    if (typeof userId !== "string" || !game.user?.id || userId !== game.user.id) return;
    if (!actorUpdateMatters(args[1])) return;
    const actor = args[0];
    if (!actor || typeof actor !== "object") return;
    queueWorldActor(actor as FoundryActor);
  });
  const onSheetClose = (...args: unknown[]) => {
    const actor = sheetActor(args[0]);
    if (actor) flushWorldActor(actor);
  };
  Hooks.on("closeActorSheet", onSheetClose);
  Hooks.on("closeActorSheetV2", onSheetClose);
  globalThis.addEventListener("pagehide", () => {
    const pending = [...pendingSectorWrites.values()];
    pendingSectorWrites.clear();
    for (const actor of pending) runSectorSync(actor);
  });
}

/** Copy the actor survey onto the matching sector world, then patch that one cached world. */
async function syncUpdatedWorldActor(actor: FoundryActor): Promise<void> {
  const pack = worldsPack();
  if (!pack || actor.pack !== pack.collection) return;
  const update = readActorUpdate(actor);
  if (!update) return;
  const result = await updatePackedWorld(
    { sector: update.sector, sectorX: update.sectorX, sectorY: update.sectorY, hex: planetHex(update.x, update.y) },
    (world) => applyActorWorld(world, update),
  );
  if (result.status === "locked") {
    ui.notifications.warn("Sector Data is locked, so the world actor edit was not saved there.");
    return;
  }
  if (result.status !== "updated" || !result.world) return;
  await replaceCachedWorld(result.world);
}

/** Create the world actor in the worlds compendium, or report that it is already there. */
export async function createTravellerWorld(target: { sector: string; hex: string }, signal?: AbortSignal): Promise<string> {
  if (game.system?.id !== "mgt2e") {
    return "World actors need the Mongoose Traveller 2e game system.";
  }
  const key = `${target.sector}|${target.hex}`;
  if (pendingActors.has(key)) return `${target.sector} ${target.hex} is already being created.`;
  pendingActors.add(key);
  try {
    return await createTravellerWorldNow(target, signal);
  } finally {
    pendingActors.delete(key);
  }
}

/** Create the actor under sector and subsector. An actor already at that hex is left in place. */
async function createTravellerWorldNow(target: { sector: string; hex: string }, signal?: AbortSignal): Promise<string> {
  let stored = await cacheSector(target.sector, [target.sector], { signal });
  if (stored.status === "needs-permission") {
    stored = await cacheSector(target.sector, [target.sector], { allowGrow: true, signal });
  }
  if (stored.status !== "ready") return `The ${target.sector} sector could not be cached.`;

  const surveyed = await loadSurveyedWorld(target.sector, target.hex, signal);
  const name = actorDisplayName(surveyed);
  const fields = worldActorFields(surveyed);

  if (!fields) return `${name || `${surveyed.sector} ${surveyed.hex}`} has no usable Universal World Profile.`;

  const pack = await ensurePack(WORLDS_PACK_LABEL, "Actor", { ignoreCase: true });

  if (!pack) return `The ${WORLDS_PACK_LABEL} compendium could not be created.`;
  if (pack.locked) return `${WORLDS_PACK_LABEL} is locked. Unlock it, then create the world actor.`;

  const actors = await actorsInPack(pack);
  const placed = matchingWorld(actors, { name, sector: surveyed.sector, x: fields.x, y: fields.y }, null);
  
  if (placed) return `${name} (${surveyed.sector} ${surveyed.hex}) already has a world actor in the ${WORLDS_PACK_LABEL} compendium.`;
  const folderId = await ensureWorldFolder(pack, fields.folders);
  const filed = matchingWorld(await actorsInPack(pack), { name, sector: surveyed.sector, x: fields.x, y: fields.y }, folderId);
  if (filed) return `${name} already exists in ${fields.folders.join("/")}.`;
  const created: FoundryActor | null = one(await Actor.create({
    name,
    type: "world",
    img: "systems/mgt2e/icons/actors/world.svg",
    folder: folderId,
    system: {
      description: fields.description,
      world: {
        location: {
          sector: surveyed.sector,
          sectorX: fields.sectorX,
          sectorY: fields.sectorY,
          x: fields.x,
          y: fields.y,
        },
        uwp: {
          port: fields.port,
          size: fields.size,
          atmosphere: fields.atmosphere,
          hydrographics: fields.hydrographics,
          population: fields.population,
          government: fields.government,
          lawLevel: fields.lawLevel,
          techLevel: fields.techLevel,
          zone: fields.zone,
          bases: fields.bases,
          codes: fields.codes,
        },
        extra: {
          popDigit: fields.popDigit,
          allegiance: fields.allegiance,
          autoCodes: false,
        },
      },
    },
  }, { pack: pack.collection }));
  if (!created) return `${name} could not be created.`;
  return `Created the world actor ${name} in the ${WORLDS_PACK_LABEL} compendium (${fields.folders.join("/")}).`;
}

/** The worlds compendium, if it has been created. */
function worldsPack(): FoundryPack | null {
  return findPack(WORLDS_PACK_LABEL, { ignoreCase: true });
}

/** The subsector folder under the sector folder, created when either is missing. */
async function ensureWorldFolder(pack: FoundryPack, names: readonly [string, string]): Promise<string> {
  let parent: string | null = null;
  for (const name of names) {
    const found = packFolders(pack).find((folder) => folder.type === "Actor" && folder.name === name && parentOf(folder) === parent);
    if (found) {
      parent = found.id;
      continue;
    }
    const created: FoundryFolder | null = one(await Folder.create({ name, type: "Actor", folder: parent }, { pack: pack.collection }));
    if (!created) throw new Error(`The ${name} folder could not be created.`);
    parent = created.id;
  }
  if (!parent) throw new Error("The world folder could not be created.");
  return parent;
}

/** Actors already in the pack, with enough fields to recognize a world. */
async function actorsInPack(pack: FoundryPack): Promise<ExistingWorld[]> {
  const entries = await readPackIndex(pack, LOCATION_FIELDS);
  const actors: ExistingWorld[] = [];
  for (const entry of entries) {
    const listed = actorFromIndex(entry);
    if (listed.sector || listed.type !== "world") {
      actors.push(listed);
      continue;
    }
    const doc = await pack.getDocument(entry._id);
    actors.push(actorFromDocument(doc, entry));
  }
  return actors;
}

/** A world identity read from the pack index. */
function actorFromIndex(entry: FoundryIndexEntry): ExistingWorld {
  const location = entry.system?.world?.location;
  return {
    name: entry.name,
    type: entry.type ?? (location ? "world" : ""),
    sector: typeof location?.sector === "string" ? location.sector : "",
    x: numberOrZero(location?.x),
    y: numberOrZero(location?.y),
    folderId: typeof entry.folder === "string" ? entry.folder : null,
  };
}

/** A world identity read from an actor document when the index row is thin. */
function actorFromDocument(doc: FoundryDocument, entry: FoundryIndexEntry): ExistingWorld {
  const actor = doc as unknown as FoundryActor;
  const location = actor.system?.world?.location;
  return {
    name: actor.name || entry.name,
    type: actor.type || entry.type || "",
    sector: typeof location?.sector === "string" ? location.sector : "",
    x: numberOrZero(location?.x),
    y: numberOrZero(location?.y),
    folderId: typeof entry.folder === "string" ? entry.folder : parentOf(actor),
  };
}

/** Folders stored in the pack. */
function packFolders(pack: FoundryPack): FoundryFolder[] {
  const folders = pack.folders;
  if (!folders) return [];
  if (Array.isArray(folders.contents)) return folders.contents;
  return typeof folders.values === "function" ? [...folders.values()] : [];
}

/** The folder id of a document, when it has one. */
function parentOf(document: { folder?: { id?: string } | string | null }): string | null {
  const parent = document.folder;
  if (!parent) return null;
  return typeof parent === "string" ? parent : parent.id ?? null;
}

/** A number, or 0 when the field is blank. */
function numberOrZero(value: number | string | undefined): number {
  return finite(value) ?? 0;
}

/** A finite number, or null when the field is blank. */
function finite(value: number | string | undefined): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** One extended-hex digit. Values past 17 stay as the decimal text. */
function ehex(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return "0";
  if (value < 10) return String(value);
  if (value < 18) return "ABCDEFGH"[value - 10];
  return "H";
}

/** The document Foundry returned, whether it came back alone or as a one-item list. */
function one<T>(created: T | T[] | null | undefined): T | null {
  if (Array.isArray(created)) return created[0] ?? null;
  return created ?? null;
}
