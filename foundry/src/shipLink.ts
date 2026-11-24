import { worldId } from "../../src/codes.ts";
import { worldsWithin, loadSurveyedWorld } from "../../src/mapRoute.ts";
import type { CachedWorld } from "../../src/worldCache.ts";
import type { World } from "../../src/world.ts";
import { selectedWorld, type MapFocus } from "./astro.ts";

/** A world the ship sheet can store and jump between. */
export interface AstroSystem {
  name: string;
  sector: string;
  hex: string;
  worldX: number | null;
  worldY: number | null;
}

/** The world selected on the Astrogation map. */
export function selectedSystem(): AstroSystem | null {
  const selected = selectedWorld();
  if (!selected?.sector || !selected.hex) return null;
  return toSystem(selected);
}

/** Systems the map has loaded within `jump` parsecs of `origin`, nearest first. */
export async function systemsWithin(
  origin: AstroSystem,
  jump: number,
): Promise<Array<AstroSystem & { parsecs: number }>> {
  const world = toWorld(origin);
  if (!world) return [];
  const found = await worldsWithin(world, jump);
  return found.map((row) => ({
    name: row.name,
    sector: row.sector,
    hex: row.hex,
    worldX: row.worldX,
    worldY: row.worldY,
    parsecs: row.parsecs,
  }));
}

/** A surveyed world, with the digits the trade list needs. */
export interface WorldProfile {
  name: string;
  sector: string;
  hex: string;
  uwp: string;
  tradeCodes: string[];
  zone: "green" | "amber" | "red";
  port: string;
  /** Population digit, or null when that digit is unknown. */
  population: number | null;
}

const UWP_PATTERN = /^([A-HYX?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?])$/i;

/** Profile fields from a cached world. An unreadable UWP returns null. */
export function profileFromSurvey(world: CachedWorld): WorldProfile | null {
  const match = UWP_PATTERN.exec(world.uwp.trim());
  if (!match) return null;
  const popCode = match[5].toUpperCase();
  const population = popCode === "?" ? null : Number.parseInt(popCode, 16);
  return {
    name: world.name,
    sector: world.sector,
    hex: world.hex,
    uwp: match[0].toUpperCase(),
    tradeCodes: [...(world.tradeCodes ?? [])],
    zone: world.zone,
    port: match[1].toUpperCase() === "?" ? "X" : match[1].toUpperCase(),
    population: Number.isNaN(population) ? null : population,
  };
}

/** The surveyed world at this sector and hex, or null when it has no usable profile. */
export async function worldProfile(sector: string, hex: string): Promise<WorldProfile | null> {
  if (!sector.trim() || !hex.trim()) return null;
  const world = await loadSurveyedWorld(sector, hex);
  return profileFromSurvey(world);
}

function toSystem(focus: MapFocus): AstroSystem {
  return {
    name: focus.name,
    sector: focus.sector,
    hex: focus.hex,
    worldX: focus.worldX,
    worldY: focus.worldY,
  };
}

function toWorld(system: AstroSystem): World | null {
  if (!system.sector || !system.hex) return null;
  return {
    id: worldId(system),
    name: system.name,
    sector: system.sector,
    hex: system.hex,
    uwp: "",
    tradeCodes: [],
    zone: "green",
    worldX: system.worldX,
    worldY: system.worldY,
    manual: false,
  };
}
