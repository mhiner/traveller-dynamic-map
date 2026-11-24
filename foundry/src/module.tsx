import { render } from "preact";
import { createPortal } from "preact/compat";
import { Fragment, jsx, jsxs } from "preact/jsx-runtime";
import { useEffect, useRef, useState } from "preact/hooks";
import { createMap } from "../../src/instance.tsx";
import { travellerMapSource } from "../../src/source.ts";
import { EXPLORE_ZOOM_MAX, EXPLORE_ZOOM_MIN } from "../../src/jumpChart.ts";
import {
  COMPENDIUM_DATA,
  COMPENDIUM_ONLY,
  DEFAULT_HOME,
  DEFAULT_JUMP,
  HOME_SYSTEM,
  JUMP_RATING,
  MODULE_ID,
  ROOT_ID,
  SCENE_FLAG,
  ZOOM_MAX,
  ZOOM_MIN,
  DARK_MAP,
  GM_FILTERS,
  GM_SNAP,
  SCENE_LOCAL,
  SCENE_STATE,
  SELECTED_HEX,
} from "./constants.ts";
import { Screen } from "./screen.tsx";
import { hideWorldTab, installWorldTab, openWorldTab, toolsElement, watchWorldTab } from "./sidebar.ts";
import { installAstroChat, noteGmSync, onGmFiltersSetting, onGmSnapSetting } from "./chat.ts";
import { setMapOpen } from "./astro.ts";
import { importSectors, registerImportMenu } from "./importSectors.ts";
import { prerenderAstrogation } from "./prerender.ts";
import { installWorldActorSync } from "./actorWorld.ts";
import { fileAstrogationPacks } from "./pack.ts";
import { flushScene, installSceneMemory, recallScene } from "./sceneState.ts";
import { selectedSystem, systemsWithin, worldProfile } from "./shipLink.ts";
import { forgetSectorPack, foundrySectorLibrary, onSectorPackChange } from "./sectorPack.ts";
import "./types.ts";

/** The one map for this Foundry world. It reads Traveller Map directly. */
const map = createMap({
  jsxRuntime: { Fragment, jsx, jsxs },
  hooks: { useEffect, useRef, useState },
  source: travellerMapSource("https://travellermap.com"),
});

/** Subscribe to location and destination changes from that map. */
const listen = map.on.bind(map);

/** The map node on the board. It stays for the session and is detached when the scene closes. */
let host: HTMLElement | null = null;
/** The Pixi canvas hidden while the map covers the board, and the display it had. */
let hiddenCanvas: { element: HTMLCanvasElement; display: string } | null = null;

Hooks.once("init", () => {
  installWorldTab();
  watchWorldTab();
  installAstroChat();
  game.settings.register(MODULE_ID, HOME_SYSTEM, {
    name: "TRAVELLER_ASTROGATION.Settings.HomeSystem.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.HomeSystem.Hint",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_HOME,
    onChange: refreshMap
  });
  game.settings.register(MODULE_ID, JUMP_RATING, {
    name: "TRAVELLER_ASTROGATION.Settings.JumpRating.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.JumpRating.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_JUMP,
    range: { min: 1, max: 6, step: 1 },
    onChange: refreshMap
  });
  game.settings.register(MODULE_ID, ZOOM_MIN, {
    name: "TRAVELLER_ASTROGATION.Settings.ZoomMin.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.ZoomMin.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: EXPLORE_ZOOM_MIN,
    onChange: refreshMap,
  });
  game.settings.register(MODULE_ID, ZOOM_MAX, {
    name: "TRAVELLER_ASTROGATION.Settings.ZoomMax.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.ZoomMax.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: EXPLORE_ZOOM_MAX,
    onChange: refreshMap
  });
  game.settings.register(MODULE_ID, DARK_MAP, {
    name: "TRAVELLER_ASTROGATION.Settings.DarkMap.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.DarkMap.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshMap
  });
  game.settings.register(MODULE_ID, SELECTED_HEX, {
    name: "TRAVELLER_ASTROGATION.Settings.SelectedHex.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.SelectedHex.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshMap
  });
  game.settings.register(MODULE_ID, COMPENDIUM_DATA, {
    name: "TRAVELLER_ASTROGATION.Settings.CompendiumData.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.CompendiumData.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => forgetSectorPack()
  });
  game.settings.register(MODULE_ID, COMPENDIUM_ONLY, {
    name: "TRAVELLER_ASTROGATION.Settings.CompendiumOnly.Name",
    hint: "TRAVELLER_ASTROGATION.Settings.CompendiumOnly.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => forgetSectorPack()
  });
  game.settings.register(MODULE_ID, GM_SNAP, {
    name: "GM snap",
    hint: "The world the GM last shared with the other players.",
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: onGmSnapSetting
  });
  game.settings.register(MODULE_ID, GM_FILTERS, {
    name: "GM filters",
    hint: "The explore-map filters the GM last shared with the other players.",
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: onGmFiltersSetting
  });
  game.settings.register(MODULE_ID, SCENE_STATE, {
    name: "Scene view",
    hint: "The explore map this user last left open.",
    scope: "user",
    config: false,
    type: Object,
    default: null
  });
  game.settings.register(MODULE_ID, SCENE_LOCAL, {
    name: "Scene view (this browser)",
    hint: "The latest explore map saved in this browser.",
    scope: "client",
    config: false,
    type: Object,
    default: null
  });
  registerImportMenu();
  installWorldActorSync();
  installSceneMemory();
  const mod = game.modules?.get(MODULE_ID);
  if (mod) mod.api = { importSectors, selectedSystem, systemsWithin, worldProfile };
  onSectorPackChange(() => {
    map.setSectorLibrary(foundrySectorLibrary());
    void prerenderAstrogation();
    refreshMap();
  });
  map.setSectorLibrary(foundrySectorLibrary());
});

Hooks.once("ready", () => {
  installWorldTab();
  installAstroChat();
  noteGmSync();
  recallScene();
  globalThis.addEventListener("pagehide", () => flushScene());
  void prerenderAstrogation();
  if (game.user?.isGM) {
    void fileAstrogationPacks();
    void ensureScene().catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : "The Astrogation scene could not be created.";
      console.error(`${MODULE_ID} | ${message}`, reason);
      ui.notifications.error(message);
    });
  }
});

Hooks.on("canvasReady", () => {
  if (isAstrogation(canvas?.scene ?? null)) void 
    showMap();
  else 
    hideMap();
});

Hooks.on("canvasTearDown", () => { hideMap(); });

/** Foundry redraws the palette after the map opens. Hide that new element too. */
Hooks.on("renderSceneControls", () => {
  if (host?.isConnected) concealSceneControls();
});

/** Redraw the map when a setting that changes the first view is saved. */
function refreshMap(): void {  if (host?.isConnected) void showMap(); }

/** The configured home system, or Regina when the setting is blank. */
function homeSystem(): string {
  const value = game.settings.get(MODULE_ID, HOME_SYSTEM);
  const text = typeof value === "string" ? value.trim() : "";
  return text || DEFAULT_HOME;
}

/** A setting that must be a positive number. Anything else uses the fallback. */
function positiveSetting(key: string, fallback: number): number {
  const value = game.settings.get(MODULE_ID, key);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** True when the module draws the chart in dark ink. */
function darkMap(): boolean {  return game.settings.get(MODULE_ID, DARK_MAP) === true; }

/** True when the selected world's hex is outlined. */
function selectedHex(): boolean {  return game.settings.get(MODULE_ID, SELECTED_HEX) === true; }

/** The configured jump range, kept between 1 and 6. */
function jumpRating(): number {  return Math.min(6, Math.max(1, Math.round(positiveSetting(JUMP_RATING, DEFAULT_JUMP)))); }

/** Explore-map zoom floor and ceiling. A reversed pair is swapped. */
function zoomLimits(): { min: number; max: number } {
  let min = positiveSetting(ZOOM_MIN, EXPLORE_ZOOM_MIN);
  let max = positiveSetting(ZOOM_MAX, EXPLORE_ZOOM_MAX);
  if (min > max) {
    const low = max;
    max = min;
    min = low;
  }
  return { min, max };
}

/** True for the scene this module created. */
function isAstrogation(scene: FoundryScene | null): boolean {
  return scene?.getFlag(MODULE_ID, SCENE_FLAG) === true;
}

/** The Astrogation scene, if it has already been created. */
function managedScene(): FoundryScene | null {
  const scenes = game.scenes?.contents ?? [];
  return scenes.find((scene) => isAstrogation(scene)) ?? null;
}

/** Create the Astrogation scene once and tell the GM it is in the navigation bar. */
async function ensureScene(): Promise<void> {
  if (managedScene()) return;
  const created = await Scene.create({
    name: "Astrogation",
    navName: "Astrogation",
    navigation: true,
    width: 1600,
    height: 900,
    padding: 0,
    backgroundColor: "#10151b",
    grid: { type: gridless(), size: 100 },
    tokenVision: false,
    ownership: { default: observer() },
    flags: { [MODULE_ID]: { [SCENE_FLAG]: true } }
  });
  const scene = Array.isArray(created) ? created[0] : created;

  if (!scene) throw new Error("Foundry did not return the Astrogation scene.");
  
  ui.notifications.info("Astrogation is in the scene navigation bar.");
}

/** Open the World tab, cover the board, and render the map. */
async function showMap(): Promise<void> {
  const dock = await openWorldTab();
  if (dock === "stale" || !isAstrogation(canvas?.scene ?? null)) return;
  const board = boardElement();
  if (!board) {
    ui.notifications.warn("Astrogation could not find the Foundry board.");
    hideWorldTab();
    return;
  }
  concealCanvas();
  recallScene();
  const node = mapHost();
  board.appendChild(node);
  host = node;
  const zoom = zoomLimits();
  render(
    <Screen
      view={map.View}
      listen={listen}
      homeName={homeSystem()}
      jumpRating={jumpRating()}
      zoomMin={zoom.min}
      zoomMax={zoom.max}
      dark={darkMap()}
      selectedOutline={selectedHex()}
      tools={dock ? {
        element: toolsElement,
        portal: (children, element) => createPortal(children as never, element),
      } : null}
    />,
    node,
  );
  setMapOpen(true);
  concealSceneControls();
}

/** The same node for the whole session. Leaving the scene detaches it, so zoom, pan, filters, and the selected world stay. */
function mapHost(): HTMLElement {
  if (host) return host;
  const existing = document.getElementById(ROOT_ID);
  if (existing instanceof HTMLElement) return existing;
  const node = document.createElement("div");
  node.id = ROOT_ID;
  node.className = "traveller-astrogation";
  // Foundry listens for wheel and pointer on the board, in the bubble phase.
  // The map's own listeners sit on the SVG, so they run before this stop.
  const keep = (event: Event) => event.stopPropagation();
  node.addEventListener("wheel", keep);
  node.addEventListener("pointerdown", keep);
  node.addEventListener("pointermove", keep);
  node.addEventListener("pointerup", keep);
  return node;
}

/** Leave the board, save the view, and hide the World tab. */
function hideMap(): void {
  if (host?.isConnected) host.remove();
  revealSceneControls();
  flushScene();
  setMapOpen(false);
  revealCanvas();
  hideWorldTab();
}

/** Hide the tool palette without dropping the space that holds the player list at the bottom. */
function concealSceneControls(): void {
  for (const node of document.querySelectorAll("#scene-controls")) {
    if (!(node instanceof HTMLElement) || node.tagName === "TEMPLATE") continue;
    node.style.removeProperty("display");
    node.style.setProperty("visibility", "hidden", "important");
    node.style.setProperty("pointer-events", "none", "important");
  }
}

/** Put the tool palette back for every other scene. */
function revealSceneControls(): void {
  for (const node of document.querySelectorAll("#scene-controls")) {
    if (!(node instanceof HTMLElement)) continue;
    node.style.removeProperty("display");
    node.style.removeProperty("visibility");
    node.style.removeProperty("pointer-events");
  }
}

/** The Foundry board element the map is mounted on. */
function boardElement(): HTMLElement | null {
  const board = document.getElementById("board");
  if (board instanceof HTMLElement && !(board instanceof HTMLCanvasElement)) return board;
  return pixiCanvas()?.parentElement ?? null;
}

/** The canvas Foundry is drawing the scene into. */
function pixiCanvas(): HTMLCanvasElement | null {
  const app = canvas?.app;
  const view = app?.canvas ?? app?.view ?? null;
  if (view instanceof HTMLCanvasElement) return view;
  const board = document.getElementById("board");
  return board instanceof HTMLCanvasElement ? board : null;
}

/** The Pixi view stays in the board so Foundry keeps its layout, and the map covers it. */
function concealCanvas(): void {
  const element = pixiCanvas();
  if (!element || hiddenCanvas?.element === element) return;
  hiddenCanvas = { element, display: element.style.display };
  element.style.display = "none";
}

/** Put the Pixi canvas back the way it was before the map covered it. */
function revealCanvas(): void {
  if (!hiddenCanvas) return;
  hiddenCanvas.element.style.display = hiddenCanvas.display;
  hiddenCanvas = null;
}

/** Foundry's gridless grid type, or 0 when that constant is missing. */
function gridless(): number {
  const types = (globalThis as { CONST?: { GRID_TYPES?: { GRIDLESS?: number } } }).CONST?.GRID_TYPES;
  return typeof types?.GRIDLESS === "number" ? types.GRIDLESS : 0;
}

/** Foundry's observer ownership level, or 2 when that constant is missing. */
function observer(): number {
  const levels = (globalThis as { CONST?: { DOCUMENT_OWNERSHIP_LEVELS?: { OBSERVER?: number } } }).CONST
    ?.DOCUMENT_OWNERSHIP_LEVELS;
  return typeof levels?.OBSERVER === "number" ? levels.OBSERVER : 2;
}
