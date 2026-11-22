import { FIND_TRADE_CODES } from "../../src/codes.ts";
import { jumpRoute, searchWorlds, type SearchHit } from "../../src/travellerMap.ts";
import type { World } from "../../src/world.ts";
import { createTravellerWorld } from "./actorWorld.ts";
import {
  clearFilters,
  describeFilters,
  exploreFilters,
  focusMap,
  helpText,
  mapIsOpen,
  mapView,
  mergeFilters,
  parseAstro,
  replaceFilters,
  selectedWorld,
  STARPORT_CODES,
  TECH_CODES,
  toggleBorders,
  type ExploreFilters,
  type MapFocus,
} from "./astro.ts";
import { DEFAULT_HOME, DEFAULT_JUMP, GM_FILTERS, GM_SNAP, HOME_SYSTEM, JUMP_RATING, MODULE_ID } from "./constants.ts";
import { loadHomeWorld } from "./home.ts";
import { currentMapWorld } from "./screen.tsx";
import "./types.ts";

/** Search hits whispered for one /astro find. */
const FIND_LIMIT = 12;
/** True after the chat-message hook is registered. The command itself can be registered again. */
let hooked = false;
/** Drops a search reply that a newer find has already replaced. */
let findTicket = 0;
/** Drops a route reply that a newer route has already replaced. */
let routeTicket = 0;
/** Cancels the jump-route request still in flight. */
let routeAbort: AbortController | null = null;
/** Drops an actor reply that a newer actor command has already replaced. */
let actorTicket = 0;
/** True after startup has noted the GM settings already in the world, so those are not replayed. */
let syncLive = false;
/** Nonce of the GM snap this client has already applied. */
let seenSnap = "";
/** Nonce of the GM filters this client has already applied. */
let seenFilters = "";
/** Nonce of the snap this GM just published, so their own setting change is ignored. */
let sentSnap = "";
/** Nonce of the filters this GM just published, so their own setting change is ignored. */
let sentFilters = "";

/** Ignores the GM sync already stored in the world, so joining does not replay it. */
export function noteGmSync(): void {
  syncLive = true;
  seenSnap = nonceOf(game.settings.get(MODULE_ID, GM_SNAP));
  seenFilters = nonceOf(game.settings.get(MODULE_ID, GM_FILTERS));
}

/** Center this client when another GM publishes a snap. Our own publish and the stored value are ignored. */
export function onGmSnapSetting(value: unknown): void {
  const message = readSnap(value);
  if (!message) return;
  if (!syncLive || message.nonce === seenSnap || message.nonce === sentSnap) {
    seenSnap = message.nonce;
    return;
  }
  seenSnap = message.nonce;
  focusMap(message.focus);
}

/** Copy another GM's filters onto this client and whisper what changed. */
export function onGmFiltersSetting(value: unknown): void {
  const message = readFilters(value);
  if (!message) return;
  if (!syncLive || message.nonce === seenFilters || message.nonce === sentFilters) {
    seenFilters = message.nonce;
    return;
  }
  seenFilters = message.nonce;
  replaceFilters(message.filters);
  void whisper(`The GM matched your explore map filters to theirs.\n${describeFilters(message.filters)}`);
}

/** GM only. Store the centered world so every other client moves there. */
async function publishSnap(): Promise<void> {
  if (!game.user?.isGM) {
    await whisper("Only the GM can use that command.");
    return;
  }
  if (!mapIsOpen()) {
    await whisper("Open the Astrogation scene before snapping other players to the map.");
    return;
  }
  const focus = mapView();
  if (!focus) {
    await whisper("The map has not centered on a world yet.");
    return;
  }
  sentSnap = crypto.randomUUID();
  seenSnap = sentSnap;
  await game.settings.set(MODULE_ID, GM_SNAP, JSON.stringify({ nonce: sentSnap, ...focus }));
  await whisper(`Centered every other player on ${focus.name} (${focus.sector} ${focus.hex}).`);
}

/** GM only. Store these filters so every other client matches them. */
async function publishFilters(): Promise<void> {
  if (!game.user?.isGM) {
    await whisper("Only the GM can use that command.");
    return;
  }
  const filters = exploreFilters();
  sentFilters = crypto.randomUUID();
  seenFilters = sentFilters;
  await game.settings.set(MODULE_ID, GM_FILTERS, JSON.stringify({ nonce: sentFilters, ...filters }));
  await whisper(`Set every other player's filters to match yours.\n${describeFilters(filters)}`);
}

/** A snap setting, or null when the stored value is not a world. */
function readSnap(value: unknown): { nonce: string; focus: MapFocus } | null {
  const parsed = readJson(value);
  if (!parsed) return null;
  const { nonce, name, sector, hex, worldX, worldY } = parsed;
  if (typeof nonce !== "string" || typeof name !== "string" || typeof sector !== "string" || typeof hex !== "string") return null;
  if (!name || !sector || !hex) return null;
  return {
    nonce,
    focus: {
      name,
      sector,
      hex,
      worldX: typeof worldX === "number" ? worldX : null,
      worldY: typeof worldY === "number" ? worldY : null,
    },
  };
}

/** A filter setting. Unknown trade codes are dropped. A bad tech or starport rejects the message. */
function readFilters(value: unknown): { nonce: string; filters: ExploreFilters } | null {
  const parsed = readJson(value);
  if (!parsed || typeof parsed.nonce !== "string") return null;
  const tech = parsed.tech === null ? null : typeof parsed.tech === "string" && isTech(parsed.tech) ? parsed.tech : undefined;
  const starport = parsed.starport === null ? null : typeof parsed.starport === "string" && isStarport(parsed.starport) ? parsed.starport : undefined;
  if (tech === undefined || starport === undefined || !Array.isArray(parsed.trade)) return null;
  const trade: string[] = [];
  for (const code of parsed.trade) {
    if (typeof code !== "string") return null;
    const known = FIND_TRADE_CODES.find((item) => item === code);
    if (!known || trade.includes(known)) continue;
    trade.push(known);
  }
  return { nonce: parsed.nonce, filters: { tech, starport, trade } };
}

/** True for a tech digit from 0 through F. */
function isTech(code: string): boolean {
  return TECH_CODES.includes(code as typeof TECH_CODES[number]);
}

/** True for a starport letter from A through E. */
function isStarport(code: string): boolean {
  return STARPORT_CODES.includes(code as typeof STARPORT_CODES[number]);
}

/** Parse a setting string. A blank or broken value is ignored. */
function readJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The nonce on a stored GM message, or an empty string when there is none. */
function nonceOf(value: unknown): string {
  const parsed = readJson(value);
  return typeof parsed?.nonce === "string" ? parsed.nonce : "";
}

/** Registers /astro on the chat log. Safe to call again once the chat class exists. */
export function installAstroChat(): void {
  for (const log of chatLogs()) {
    log.CHAT_COMMANDS.astro = {
      rgx: /^\/astro(?:\s+([\s\S]*))?$/i,
      fn: (_command, match) => {
        void handleAstro((match[1] ?? "").trim());
        return false;
      },
    };
  }
  if (hooked) return;
  hooked = true;
  Hooks.on("renderChatMessageHTML", (...args: unknown[]) => {
    const html = args[1];
    if (!(html instanceof HTMLElement)) return;
    attachFinds(args[0], html);
  });
}

/** Run one /astro command and whisper the result. The typed command is not posted. */
async function handleAstro(text: string): Promise<void> {
  try {
    const action = parseAstro(text);
    if (action.type === "help") {
      await whisper(helpText());
      return;
    }
    if (action.type === "error") {
      await whisper(action.message);
      return;
    }
    if (action.type === "list") {
      await whisper(describeFilters(exploreFilters()));
      return;
    }
    if (action.type === "clear") {
      clearFilters();
      await whisper("Explore map filters cleared.");
      return;
    }
    if (action.type === "set") {
      const next = mergeFilters(exploreFilters(), action);
      replaceFilters(next);
      await whisper(describeFilters(next));
      return;
    }
    if (action.type === "borders") {
      const shown = toggleBorders();
      await whisper(shown ? "Borders on." : "Borders off.");
      return;
    }
    if (action.type === "snap") {
      await publishSnap();
      return;
    }
    if (action.type === "sync-filters") {
      await publishFilters();
      return;
    }
    if (action.type === "actor") {
      await whisperActor(action.name);
      return;
    }
    if (action.type === "route") {
      await whisperRoute(action.name, action.jump);
      return;
    }
    await whisperFinds(action.name);
  } catch (reason) {
    if (isAbort(reason)) return;
    const message = reason instanceof Error ? reason.message : "The astrogation command failed.";
    await whisper(message);
  }
}

/** Search by name and whisper up to twelve worlds. Each button centers the map. */
async function whisperFinds(name: string): Promise<void> {
  const ticket = ++findTicket;
  const found = await searchWorlds(name, null);
  if (ticket !== findTicket) return;
  const hits = found.hits;
  if (hits.length === 0) {
    await whisper(`No worlds found for “${name}”.`);
    return;
  }
  const shown = hits.slice(0, FIND_LIMIT);
  const extra = hits.length > shown.length ? ` Showing ${shown.length} of ${hits.length}.` : "";
  await whisper(
    `Worlds matching “${name}”.${extra}\nChoose one to center the map.`,
    shown.map(choiceFromHit),
  );
}

/** The world a find or route button will center. */
function choiceFromHit(hit: SearchHit): MapFocus & { uwp: string } {
  return {
    name: hit.name,
    sector: hit.sector,
    hex: hit.hex,
    uwp: hit.uwp,
    worldX: hit.worldX,
    worldY: hit.worldY,
  };
}

/** Plot a jump route and whisper the stops. Each button centers the map. */
async function whisperRoute(name: string, jump: number | null): Promise<void> {
  const { ticket, signal } = beginRoute();
  const rating = jump ?? configuredJump();
  const found = await searchWorlds(name, null, signal);
  if (ticket !== routeTicket || signal.aborted) return;
  const hits = destinationChoices(name, found.hits);
  if (hits.length === 0) {
    await whisper(`No worlds found for “${name}”.`);
    return;
  }
  if (hits.length > 1) {
    const shown = hits.slice(0, FIND_LIMIT);
    const extra = hits.length > shown.length ? ` Showing ${shown.length} of ${hits.length}.` : "";
    await whisper(
      `Worlds matching “${name}” for a jump-${rating} route.${extra}\nChoose a destination.`,
      shown.map(choiceFromHit),
      rating,
    );
    return;
  }
  await plotRoute(choiceFromHit(hits[0]), rating, signal, ticket);
}

/** Search for the destination, then plot from the current world at the requested jump range. */
async function plotRoute(
  destination: MapFocus & { uwp: string },
  jump: number,
  signal: AbortSignal,
  ticket: number,
): Promise<void> {
  const origin = await originWorld(signal);
  if (ticket !== routeTicket || signal.aborted) return;
  if (!origin) {
    await whisper("The current location is not on the map, so a jump route cannot be plotted.");
    return;
  }
  if (origin.sector === destination.sector && origin.hex === destination.hex) {
    await whisper(`${destination.name} is the current location.`);
    return;
  }
  let stops;
  try {
    stops = await jumpRoute(origin, destination, jump, signal);
  } catch (reason) {
    if (ticket !== routeTicket || signal.aborted || isAbort(reason)) return;
    const message = reason instanceof Error ? reason.message : "Jump route failed";
    await whisper(message === "No route found"
      ? `No jump-${jump} route from ${origin.name} to ${destination.name}.`
      : message);
    return;
  }
  if (ticket !== routeTicket || signal.aborted) return;
  await whisper(
    `Jump-${jump} route from ${origin.name} (${origin.sector} ${origin.hex}) to ${destination.name} (${destination.sector} ${destination.hex}).\nChoose a world to center the map.`,
    stops.map((stop) => ({
      name: stop.name,
      sector: stop.sector,
      hex: stop.hex,
      uwp: stop.uwp,
      worldX: stop.worldX,
      worldY: stop.worldY,
    })),
  );
}

/** Exact names first. A single exact match is the destination. */
function destinationChoices(name: string, hits: readonly SearchHit[]): SearchHit[] {
  const exact = hits.filter((hit) => hit.name.toLowerCase() === name.trim().toLowerCase());
  return exact.length > 0 ? exact : [...hits];
}

/** The ship's world, or the home world when the map has not chosen one. */
async function originWorld(signal: AbortSignal): Promise<World | null> {
  const placed = currentMapWorld();
  if (placed) return placed.manual || !placed.sector || !placed.hex ? null : placed;
  const setting = game.settings.get(MODULE_ID, HOME_SYSTEM);
  const name = typeof setting === "string" && setting.trim() ? setting.trim() : DEFAULT_HOME;
  return await loadHomeWorld(name, signal);
}

/** The module jump range, kept between 1 and 6. */
function configuredJump(): number {
  const value = game.settings.get(MODULE_ID, JUMP_RATING);
  const jump = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_JUMP;
  return Math.min(6, Math.max(1, jump));
}

/** Start a route request and cancel the previous one. */
function beginRoute(): { ticket: number; signal: AbortSignal } {
  routeAbort?.abort();
  const controller = new AbortController();
  routeAbort = controller;
  return { ticket: ++routeTicket, signal: controller.signal };
}

/** True when this route was cancelled by a newer one. */
function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

/** A private message. Find, route, and actor buttons are stored on the message. */
async function whisper(text: string, finds?: Array<MapFocus & { uwp: string }>, routeJump?: number, actor = false): Promise<void> {
  const userId = game.user?.id;
  if (!userId) return;
  const content = `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
  const details = finds
    ? { finds, ...(routeJump ? { routeJump } : {}), ...(actor ? { actor: true } : {}) }
    : undefined;
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker?.({ alias: "Astrogation" }) ?? { alias: "Astrogation" },
    whisper: [userId],
    flags: details ? { [MODULE_ID]: details } : undefined,
  }, { messageMode: "self" });
}

/** Create the world actor, or report the one already filed. */
async function whisperActor(name: string | null): Promise<void> {
  const ticket = ++actorTicket;
  if (!name) {
    const chosen = chosenWorld();
    if (!chosen) {
      await whisper("Select a world on the map, or name one. Usage: /astro actor <world>.");
      return;
    }
    await whisper(await createTravellerWorld(chosen));
    return;
  }
  const found = await searchWorlds(name, null);
  if (ticket !== actorTicket) return;
  const hits = destinationChoices(name, found.hits);
  if (hits.length === 0) {
    await whisper(`No worlds found for “${name}”.`);
    return;
  }
  if (hits.length > 1) {
    const shown = hits.slice(0, FIND_LIMIT);
    const extra = hits.length > shown.length ? ` Showing ${shown.length} of ${hits.length}.` : "";
    await whisper(
      `Worlds matching “${name}”.${extra}\nChoose one to create a world actor.`,
      shown.map(choiceFromHit),
      undefined,
      true,
    );
    return;
  }
  await whisper(await createTravellerWorld(hits[0]));
}

/** The selected world, or the centered world when nothing is selected. */
function chosenWorld(): { sector: string; hex: string } | null {
  const selected = selectedWorld();
  if (selected?.sector && selected.hex) return selected;
  const current = currentMapWorld();
  if (!current || current.manual || !current.sector || !current.hex) return null;
  return current;
}

/** Turn stored worlds on a whisper into buttons that center the map. */
function attachFinds(message: unknown, html: HTMLElement): void {
  const finds = readFinds(message);
  if (finds.length === 0) return;
  const routeJump = readRouteJump(message);
  const actorPick = readActorPick(message);
  const content = html.querySelector(".message-content") ?? html;
  if (content.querySelector(".astro-finds")) return;
  const list = document.createElement("div");
  list.className = "astro-finds";
  for (const hit of finds) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${hit.name} · ${hit.sector} ${hit.hex} · ${hit.uwp}`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (actorPick) {
        void createTravellerWorld(hit).then((text) => whisper(text)).catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : "The world actor could not be created.";
          void whisper(message);
        });
        return;
      }
      if (routeJump !== null) {
        const { ticket, signal } = beginRoute();
        void plotRoute(hit, routeJump, signal, ticket).catch((reason: unknown) => {
          if (signal.aborted || isAbort(reason)) return;
          const message = reason instanceof Error ? reason.message : "The astrogation command failed.";
          void whisper(message);
        });
        return;
      }
      focusMap(hit);
    });
    list.appendChild(button);
  }
  content.appendChild(list);
}

/** The jump range stored on a route whisper. */
function readRouteJump(message: unknown): number | null {
  const raw = flagValue(message, "routeJump");
  return typeof raw === "number" && raw >= 1 && raw <= 6 ? raw : null;
}

/** True when the whisper's button should create an actor. */
function readActorPick(message: unknown): boolean {
  return flagValue(message, "actor") === true;
}

/** One flag stored on a chat message by this module. */
function flagValue(message: unknown, key: "finds" | "routeJump" | "actor"): unknown {
  const flagged = message as {
    getFlag?: (scope: string, key: string) => unknown;
    flags?: Record<string, Record<string, unknown>>;
  } | null;
  return flagged?.getFlag?.(MODULE_ID, key) ?? flagged?.flags?.[MODULE_ID]?.[key];
}

/** Worlds stored on a whisper. A broken entry is skipped. */
function readFinds(message: unknown): Array<MapFocus & { uwp: string }> {
  const raw = flagValue(message, "finds");
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const hit = item as Partial<MapFocus & { uwp: string }>;
    if (!hit.name || !hit.sector || !hit.hex || !hit.uwp) return [];
    return [{
      name: hit.name,
      sector: hit.sector,
      hex: hit.hex,
      uwp: hit.uwp,
      worldX: typeof hit.worldX === "number" ? hit.worldX : null,
      worldY: typeof hit.worldY === "number" ? hit.worldY : null,
    }];
  });
}

/** Chat logs that can register /astro, including a popped-out log. */
function chatLogs(): FoundryChatLog[] {
  const logs: FoundryChatLog[] = [];
  const seen = new Set<FoundryChatLog>();
  const add = (log: FoundryChatLog | null | undefined) => {
    if (!log?.CHAT_COMMANDS || seen.has(log)) return;
    seen.add(log);
    logs.push(log);
  };
  add(CONFIG.ui?.chat);
  add(foundry.applications?.sidebar?.tabs?.ChatLog);
  const live = (globalThis as { ui?: { chat?: { constructor?: FoundryChatLog } } }).ui?.chat?.constructor;
  add(live);
  return logs;
}

/** Text safe to place inside a whisper button. */
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
