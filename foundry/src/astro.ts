import { FIND_TRADE_CODES } from "../../src/codes.ts";

/** Tech-level digits /astro filter accepts, 0 through F. */
export const TECH_CODES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"] as const;
/** Starport letters /astro filter accepts, A through E. */
export const STARPORT_CODES = ["A", "B", "C", "D", "E"] as const;

export interface ExploreFilters {
  tech: string | null;
  starport: string | null;
  trade: string[];
}

export interface MapFocus {
  sector: string;
  hex: string;
  name: string;
  worldX: number | null;
  worldY: number | null;
}

/** No tech, starport, or trade highlight. */
export const EMPTY_FILTERS: ExploreFilters = { tech: null, starport: null, trade: [] };

export type AstroAction =
  | { type: "help" }
  | { type: "find"; name: string }
  | { type: "route"; jump: number | null; name: string }
  | { type: "borders" }
  | { type: "snap" }
  | { type: "sync-filters" }
  | { type: "actor"; name: string | null }
  | { type: "list" }
  | { type: "clear" }
  | { type: "set"; tech?: string; starport?: string; trade?: string[] }
  | { type: "error"; message: string };

/** The /astro help text whispered back to the player. */
const HELP = [
  "Astrogation commands",
  "/astro help — show this list",
  "/astro find <world> — search by name",
  "/astro route j=[1-6] <world> — plot a jump route from the current world; omit j= to use the default jump range.",
  "/astro borders — show or hide political borders",
  "/astro gm snap — GM only. Center every other player on the world your map is centered on",
  "/astro gm filters — GM only. Give every other player your tech level, starport, and trade-code filters",
  "/astro actor <world> — create a world actor in the worlds compendium, under <sector>/<subsector>. Omit the name to use the selected world.",
  "/astro filter — list the explore-map filters",
  "/astro filter clear — clear current filters",
  "/astro filter TL=[0-F] — highlight worlds at or above TL",
  "/astro filter SP=[A-E] — highlight worlds with that starport or better",
  `/astro filter Trade=${FIND_TRADE_CODES.join(",")} — highlight worlds with selected trade codes`,
].join("\n");

/** The /astro command list. */
export function helpText(): string {
  return HELP;
}

/** Turn the text after /astro into one action, or an error the player can read. */
export function parseAstro(input: string): AstroAction {
  const text = input.trim();
  if (!text || /^help$/i.test(text)) return { type: "help" };
  const find = text.match(/^find(?:\s+([\s\S]+))?$/i);
  if (find) {
    const name = find[1]?.trim() ?? "";
    if (name.length < 2) return { type: "error", message: "Usage: /astro find <world>. The name needs at least 2 characters." };
    return { type: "find", name };
  }
  const route = text.match(/^route(?:\s+([\s\S]+))?$/i);
  if (route) return parseRoute(route[1]?.trim() ?? "");
  const borders = text.match(/^borders(?:\s+([\s\S]*))?$/i);
  if (borders) {
    if (borders[1]?.trim()) return { type: "error", message: "Usage: /astro borders" };
    return { type: "borders" };
  }
  const gm = text.match(/^gm(?:\s+([\s\S]*))?$/i);
  if (gm) return parseGm(gm[1]?.trim() ?? "");
  const actor = text.match(/^actor(?:\s+([\s\S]*))?$/i);
  if (actor) return parseActor(actor[1]?.trim() ?? "");
  const filter = text.match(/^filter(?:\s+([\s\S]+))?$/i);
  if (!filter) return { type: "error", message: "Unknown /astro command. Use /astro help." };
  const rest = filter[1]?.trim() ?? "";
  if (!rest) return { type: "list" };
  if (/^clear$/i.test(rest)) return { type: "clear" };
  return parseFilterAssignments(rest);
}

/** Whisper text for the filters the explore map is using. */
export function describeFilters(filters: ExploreFilters): string {
  const tech = filters.tech ? `${filters.tech} and higher` : "off";
  const starport = filters.starport ? `${filters.starport} or better` : "off";
  const trade = filters.trade.length > 0 ? filters.trade.join(", ") : "off";
  return `Explore map filters\nTech level: ${tech}\nStarport: ${starport}\nTrade codes: ${trade}`;
}

/** Apply the assignments from one /astro filter command. Omitted fields stay as they are. */
export function mergeFilters(
  current: ExploreFilters,
  patch: { tech?: string; starport?: string; trade?: string[] },
): ExploreFilters {
  return {
    tech: patch.tech ?? current.tech,
    starport: patch.starport ?? current.starport,
    trade: patch.trade ? [...patch.trade] : [...current.trade],
  };
}

/** An actor command. A blank name means the selected world. */
function parseActor(rest: string): AstroAction {
  if (!rest) return { type: "actor", name: null };
  if (rest.length < 2) {
    return { type: "error", message: "Usage: /astro actor <world>. The name needs at least 2 characters, or omit it to use the selected world." };
  }
  return { type: "actor", name: rest };
}

/** GM snap or GM filters. Anything else is a usage error. */
function parseGm(rest: string): AstroAction {
  if (/^snap$/i.test(rest)) return { type: "snap" };
  if (/^filters$/i.test(rest)) return { type: "sync-filters" };
  return { type: "error", message: "Usage: /astro gm snap, or /astro gm filters. These commands are for the GM." };
}

/** A route command. j= sets the jump range; omitting it uses the configured range. */
function parseRoute(rest: string): AstroAction {
  if (!rest) {
    return { type: "error", message: "Usage: /astro route j=[1-6] <world>. The jump range is optional." };
  }
  if (/^j=/i.test(rest)) {
    const match = rest.match(/^j=([1-6])(?:\s+(\S[\s\S]*))?$/i);
    if (!match) return { type: "error", message: "Jump range must be a whole number from 1 through 6." };
    const name = match[2]?.trim() ?? "";
    if (name.length < 2) {
      return { type: "error", message: "Usage: /astro route j=[1-6] <world>. The name needs at least 2 characters." };
    }
    return { type: "route", jump: Number(match[1]), name };
  }
  if (rest.length < 2) {
    return { type: "error", message: "Usage: /astro route <world>. The name needs at least 2 characters." };
  }
  return { type: "route", jump: null, name: rest };
}

/** Read TL=, SP=, and Trade= from one filter command. One bad token rejects the whole command. */
function parseFilterAssignments(rest: string): AstroAction {
  const parts = rest.split(/\s+(?=(?:tl|sp|trade)=)/i);
  const patch: { tech?: string; starport?: string; trade?: string[] } = {};
  for (const part of parts) {
    const match = part.match(/^(tl|sp|trade)=(.+)$/i);
    if (!match) return { type: "error", message: `Could not read “${part}”. Use /astro help.` };
    const key = match[1].toLowerCase();
    const raw = match[2].trim();
    if (key === "tl") {
      const code = raw.toUpperCase();
      if (!TECH_CODES.includes(code as typeof TECH_CODES[number])) {
        return { type: "error", message: "Tech level must be a single digit from 0 through F." };
      }
      patch.tech = code;
    } else if (key === "sp") {
      const code = raw.toUpperCase();
      if (!STARPORT_CODES.includes(code as typeof STARPORT_CODES[number])) {
        return { type: "error", message: "Starport must be a letter from A through E." };
      }
      patch.starport = code;
    } else {
      const codes = raw.split(",").map((code) => code.trim()).filter(Boolean);
      if (codes.length === 0) return { type: "error", message: "Name at least one trade code, for example Trade=Ag,Hi." };
      const canonical: string[] = [];
      for (const code of codes) {
        const known = FIND_TRADE_CODES.find((item) => item.toLowerCase() === code.toLowerCase());
        if (!known) {
          return { type: "error", message: `Unknown trade code “${code}”. Use ${FIND_TRADE_CODES.join(", ")}.` };
        }
        if (!canonical.includes(known)) canonical.push(known);
      }
      patch.trade = canonical;
    }
  }
  return { type: "set", ...patch };
}

/** The explore-map filters for this client. */
let filters: ExploreFilters = { ...EMPTY_FILTERS, trade: [] };
/** True while allegiance borders are drawn. */
let borders = true;
/** World a chat command asked the map to center, until the map consumes it. */
let focus: MapFocus | null = null;
/** Bumped each time focus changes, so the map notices a second request for the same world. */
let focusId = 0;
/** The world the explore map is centered on. */
let view: MapFocus | null = null;
/** The world selected on the explore map. */
let selected: MapFocus | null = null;
/** True while the Astrogation scene is showing the map. */
let open = false;
/** Screens that redraw when filters, borders, or the aimed world change. */
const listeners = new Set<() => void>();

/** A copy of the current filters. Callers cannot mutate the stored list. */
export function exploreFilters(): ExploreFilters {
  return { tech: filters.tech, starport: filters.starport, trade: [...filters.trade] };
}

/** Whether allegiance borders are drawn. */
export function bordersShown(): boolean {
  return borders;
}

/** Show or hide allegiance borders and tell the screen. */
export function setBorders(shown: boolean): void {
  if (borders === shown) return;
  borders = shown;
  emit();
}

/** Flip allegiance borders and tell the screen. Returns the new value. */
export function toggleBorders(): boolean {
  borders = !borders;
  emit();
  return borders;
}

/** The world a command asked the map to center, and the id of that request. */
export function mapFocus(): { focus: MapFocus | null; focusId: number } {
  return { focus, focusId };
}

/** The world the explore map last reported as its center. */
export function mapView(): MapFocus | null {
  return view ? { ...view } : null;
}

/** Remember the centered world. An unchanged world does not schedule a save. */
export function reportMapView(next: MapFocus): void {
  if (
    view
    && view.name === next.name
    && view.sector === next.sector
    && view.hex === next.hex
    && view.worldX === next.worldX
    && view.worldY === next.worldY
  ) return;
  view = { ...next };
  noteExplore();
}

/** The world the explore map last reported as selected. */
export function selectedWorld(): MapFocus | null {
  return selected ? { ...selected } : null;
}

/** Remember the selected world. An unchanged world does not schedule a save. */
export function reportSelection(next: MapFocus): void {
  if (
    selected
    && selected.name === next.name
    && selected.sector === next.sector
    && selected.hex === next.hex
    && selected.worldX === next.worldX
    && selected.worldY === next.worldY
  ) return;
  selected = { ...next };
  noteExplore();
  const hooks = (globalThis as {
    Hooks?: { callAll?: (event: string, payload: MapFocus) => void };
  }).Hooks;
  hooks?.callAll?.("traveller-astrogation.selection", { ...selected });
}

/** True while the Astrogation scene is on screen. */
export function mapIsOpen(): boolean {
  return open;
}

/** Record whether the Astrogation scene is showing the map. */
export function setMapOpen(value: boolean): void {
  open = value;
}

/** Redraw when filters, borders, or the aimed world change. Returns the unsubscribe. */
export function subscribeExplore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replace the explore-map filters. An unchanged set does not notify. */
export function replaceFilters(next: { tech: string | null; starport: string | null; trade: readonly string[] }): void {
  const trade = [...next.trade];
  if (filters.tech === next.tech && filters.starport === next.starport && sameCodes(filters.trade, trade)) return;
  filters = { tech: next.tech, starport: next.starport, trade };
  emit();
}

/** Turn off tech, starport, and trade highlighting. */
export function clearFilters(): void {
  replaceFilters({ tech: null, starport: null, trade: [] });
}

/** Ask the open map to center on this world. */
export function focusMap(target: MapFocus): void {
  focus = target;
  focusId += 1;
  emit();
}

/** The map has centered. Clear the request so it does not run again. */
export function consumeMapFocus(): void {
  if (!focus) return;
  focus = null;
  emit();
}

/** True when two trade-code lists are the same codes in the same order. */
function sameCodes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

/** Told when filters, borders, the center, or the selection should be saved. */
let exploreNote: (() => void) | null = null;

/** Called after the filters, borders, centered world, or selected world change. */
export function onExploreChange(listener: () => void): void {
  exploreNote = listener;
}

/** Restore filters, borders, center, and selection without notifying listeners. */
export function hydrateExplore(next: {
  filters: ExploreFilters;
  borders: boolean;
  view: MapFocus | null;
  selected: MapFocus | null;
}): void {
  filters = { tech: next.filters.tech, starport: next.filters.starport, trade: [...next.filters.trade] };
  borders = next.borders;
  view = next.view ? { ...next.view } : null;
  selected = next.selected ? { ...next.selected } : null;
}

/** Ask the scene memory to save. Listeners are not redrawn. */
function noteExplore(): void {
  exploreNote?.();
}

/** Redraw listeners, then ask the scene memory to save. */
function emit(): void {
  for (const listener of listeners) listener();
  noteExplore();
}
