import { chartOpenHex, clampExploreZoom } from "../../src/jumpChart.ts";
import type { World } from "../../src/world.ts";
import {
  bordersShown,
  shipsShown,
  EMPTY_FILTERS,
  exploreFilters,
  hydrateExplore,
  mapView,
  onExploreChange,
  selectedWorld,
  STARPORT_CODES,
  TECH_CODES,
  type ExploreFilters,
  type MapFocus,
} from "./astro.ts";
import { FIND_TRADE_CODES } from "../../src/codes.ts";
import { MODULE_ID, SCENE_LOCAL, SCENE_STATE } from "./constants.ts";
import "./types.ts";

export interface SavedScene {
  revision: number;
  zoom: number;
  x: number | null;
  y: number | null;
  center: MapFocus | null;
  selected: MapFocus | null;
  filters: ExploreFilters;
  borders: boolean;
  ships: boolean;
  query: string;
}

export interface LocalScene {
  userId: string;
  scene: SavedScene;
}

/** Find-box text kept in the saved view. */
const QUERY_LIMIT = 200;
/** Milliseconds of quiet before the view is written. */
const SAVE_DELAY = 400;

/** The view this client will save. */
let scene: SavedScene | null = null;
/** True after the saved view has been read. Writes before that are dropped. */
let started = false;
/** True when the view has changed and has not been written yet. */
let dirty = false;
/** The pending save. Zero means none is scheduled. */
let timer = 0;
/** True after the first failed world save, so the console is warned once. */
let flagFailure = false;

/** Read the stored view once, then keep later edits in memory. */
export function recallScene(): SavedScene | null {
  if (started) return scene;
  if (game.ready === false) return scene;
  started = true;
  const userId = game.user?.id ?? "";
  const saved = preferScene(
    parseScene(readSetting(SCENE_STATE)),
    parseLocal(readSetting(SCENE_LOCAL)),
    userId,
  );
  scene = saved;
  if (saved) {
    hydrateExplore({
      filters: saved.filters,
      borders: saved.borders,
      ships: saved.ships,
      view: saved.center,
      selected: saved.selected,
    });
  }
  return scene;
}

/** Where a saved view is looking. The camera wins; otherwise the centered world. */
export function sceneOrigin(saved: SavedScene | null): { worldX: number; worldY: number; sector: string } | null {
  if (!saved) return null;
  return chartOpenHex({
    cameraX: saved.x,
    cameraY: saved.y,
    centerX: saved.center?.worldX ?? null,
    centerY: saved.center?.worldY ?? null,
    centerSector: saved.center?.sector ?? "",
    liveX: null,
    liveY: null,
  });
}

/**
 * Hex the first chart is built around.
 * A saved camera or world is used first. Otherwise the live map world.
 * The caller loads the home world when this returns null.
 */
export function loginChartCenter(
  live: { worldX: number | null; worldY: number | null; sector: string } | null,
): { worldX: number; worldY: number; sector: string } | null {
  return chartOpenHex({
    cameraX: scene?.x ?? null,
    cameraY: scene?.y ?? null,
    centerX: scene?.center?.worldX ?? null,
    centerY: scene?.center?.worldY ?? null,
    centerSector: scene?.center?.sector ?? "",
    liveX: live?.worldX ?? null,
    liveY: live?.worldY ?? null,
    liveSector: live?.sector ?? "",
  });
}

/** Worlds and camera the explore map should open on. Filters are applied separately. */
export function restoredScene(): {
  query: string;
  selected: World | null;
  center: World | null;
  camera: { zoom: number; x: number; y: number } | null;
} | null {
  if (!scene) return null;
  const center = scene.center ? worldFromFocus(scene.center) : null;
  const selected = scene.selected ? worldFromFocus(scene.selected) : null;
  if (!center && !selected && !scene.query) return null;
  const camera = center && scene.x !== null && scene.y !== null
    ? { zoom: scene.zoom, x: scene.x, y: scene.y }
    : null;
  return { query: scene.query, selected: selected ?? center, center, camera };
}

/** Keep the saved view in step with explore filters, borders, the centered world, and the selection. */
export function installSceneMemory(): void {
  onExploreChange(() => {
    const patch: Partial<SavedScene> = {
      filters: exploreFilters(),
      borders: bordersShown(),
      ships: shipsShown(),
    };
    const center = mapView();
    const selected = selectedWorld();
    if (center) patch.center = center;
    if (selected) patch.selected = selected;
    remember(patch);
  });
}

/** Remember the find text, trimmed to the stored limit. An unchanged query does not schedule a write. */
export function rememberQuery(query: string): void {
  const text = query.slice(0, QUERY_LIMIT);
  if ((scene?.query ?? "") === text) return;
  remember({ query: text });
}

/** Remember pan and zoom. An unchanged camera does not schedule a write. */
export function rememberCamera(view: { zoom: number; x: number; y: number }): void {
  if (scene && scene.zoom === view.zoom && scene.x === view.x && scene.y === view.y) return;
  remember({ zoom: view.zoom, x: view.x, y: view.y });
}

/** Write a pending view now. Scene changes and leaving the page both call this. */
export function flushScene(): void {
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  if (!dirty || !scene || !started) return;
  if (game.ready === false) return;
  const saving = scene;
  const userId = game.user?.id ?? "";
  dirty = false;
  writeSetting(SCENE_LOCAL, { userId, scene: saving });
  if (!userId) return;
  void game.settings.set(MODULE_ID, SCENE_STATE, saving).catch((reason: unknown) => {
    dirty = true;
    if (flagFailure) return;
    flagFailure = true;
    console.error(`${MODULE_ID} | The astrogation view could not be saved for this user.`, reason);
  });
}

/** A stored view. Missing revision means the value is not a view. */
export function parseScene(value: unknown): SavedScene | null {
  const data = objectValue(value);
  if (!data) return null;
  const revision = finite(data.revision);
  if (revision === null) return null;
  const zoom = finite(data.zoom);
  const x = finite(data.x);
  const y = finite(data.y);
  const query = typeof data.query === "string" ? data.query.slice(0, QUERY_LIMIT) : "";
  return {
    revision,
    zoom: zoom === null ? 1 : clampExploreZoom(zoom),
    x,
    y,
    center: parseFocus(data.center),
    selected: parseFocus(data.selected),
    filters: parseFilters(data.filters),
    borders: data.borders !== false,
    ships: data.ships === true,
    query,
  };
}

/** A browser copy, when it names a user and holds a view. */
export function parseLocal(value: unknown): LocalScene | null {
  const data = objectValue(value);
  if (!data || typeof data.userId !== "string" || !data.userId) return null;
  const saved = parseScene(data.scene);
  if (!saved) return null;
  return { userId: data.userId, scene: saved };
}

/** The newer copy wins. A local copy for a different user is ignored. */
export function preferScene(userScene: SavedScene | null, local: LocalScene | null, userId: string): SavedScene | null {
  const localScene = local && userId && local.userId === userId ? local.scene : null;
  if (userScene && localScene) return userScene.revision >= localScene.revision ? userScene : localScene;
  return userScene ?? localScene;
}

/** Merge a change into the view and schedule a save. An unchanged view is left alone. */
function remember(patch: Partial<SavedScene>): void {
  if (!started) return;
  const previous = scene;
  const next: SavedScene = {
    revision: Date.now(),
    zoom: patch.zoom ?? previous?.zoom ?? 1,
    x: patch.x !== undefined ? patch.x : previous?.x ?? null,
    y: patch.y !== undefined ? patch.y : previous?.y ?? null,
    center: patch.center !== undefined ? patch.center : previous?.center ?? null,
    selected: patch.selected !== undefined ? patch.selected : previous?.selected ?? null,
    filters: patch.filters ?? previous?.filters ?? { ...EMPTY_FILTERS, trade: [] },
    borders: patch.borders ?? previous?.borders ?? true,
    ships: patch.ships ?? previous?.ships ?? false,
    query: patch.query ?? previous?.query ?? "",
  };
  if (previous && sameScene(previous, next)) return;
  scene = next;
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    flushScene();
  }, SAVE_DELAY);
}

/** True when two views would save the same fields. */
function sameScene(left: SavedScene, right: SavedScene): boolean {
  return left.zoom === right.zoom
    && left.x === right.x
    && left.y === right.y
    && left.borders === right.borders
    && left.ships === right.ships
    && left.query === right.query
    && sameFocus(left.center, right.center)
    && sameFocus(left.selected, right.selected)
    && left.filters.tech === right.filters.tech
    && left.filters.starport === right.filters.starport
    && left.filters.trade.length === right.filters.trade.length
    && left.filters.trade.every((code, index) => code === right.filters.trade[index]);
}

/** True when both sides name the same world, or both are empty. */
function sameFocus(left: MapFocus | null, right: MapFocus | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.name === right.name
    && left.sector === right.sector
    && left.hex === right.hex
    && left.worldX === right.worldX
    && left.worldY === right.worldY;
}

/** A world the map can open. A focus without coordinates is not one. */
function worldFromFocus(focus: MapFocus): World | null {
  if (focus.worldX === null || focus.worldY === null || !focus.sector || !focus.hex || !focus.name) return null;
  return {
    id: `${focus.sector}|${focus.hex}`,
    name: focus.name,
    sector: focus.sector,
    hex: focus.hex,
    uwp: "",
    tradeCodes: [],
    zone: "green",
    worldX: focus.worldX,
    worldY: focus.worldY,
    manual: false,
  };
}

/** A stored center or selection. A partial world is dropped. */
function parseFocus(value: unknown): MapFocus | null {
  const data = objectValue(value);
  if (!data || typeof data.name !== "string" || typeof data.sector !== "string" || typeof data.hex !== "string") return null;
  if (!data.name || !data.sector || !data.hex) return null;
  return {
    name: data.name,
    sector: data.sector,
    hex: data.hex,
    worldX: finite(data.worldX),
    worldY: finite(data.worldY),
  };
}

/** Tech, starport, and the trade codes this map knows. Unknown codes are dropped. */
function parseFilters(value: unknown): ExploreFilters {
  const data = objectValue(value);
  if (!data) return { tech: null, starport: null, trade: [] };
  const tech = typeof data.tech === "string" && TECH_CODES.includes(data.tech as typeof TECH_CODES[number]) ? data.tech : null;
  const starport = typeof data.starport === "string" && STARPORT_CODES.includes(data.starport as typeof STARPORT_CODES[number])
    ? data.starport
    : null;
  const trade: string[] = [];
  if (Array.isArray(data.trade)) {
    for (const code of data.trade) {
      if (typeof code !== "string") continue;
      const known = FIND_TRADE_CODES.find((item) => item === code);
      if (!known || trade.includes(known)) continue;
      trade.push(known);
    }
  }
  return { tech, starport, trade };
}

/** A plain object, or null. A JSON string is parsed first. */
function objectValue(value: unknown): Record<string, unknown> | null {
  let data = value;
  if (typeof data === "string") {
    if (!data) return null;
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

/** A finite number, or null. */
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One module setting. A missing game returns nothing. */
function readSetting(key: string): unknown {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return null;
  }
}

/** Write a client setting. A missing game is ignored. */
function writeSetting(key: string, value: unknown): void {
  try {
    void game.settings.set(MODULE_ID, key, value);
  } catch (reason) {
    console.error(`${MODULE_ID} | The astrogation view could not be stored in this browser.`, reason);
  }
}
