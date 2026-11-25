import { loadSurveyedWorld } from "../../src/mapRoute.ts";
import type { ChartShip } from "../../src/ui/shipMark.ts";
import { shipsShown } from "./astro.ts";
import "./types.ts";

/** Koko's Traveller Ship Design. The previous one-L id is not this module. */
const SHIP_MODULE = "traveller-blueprint";
const SHIP_TYPE = `${SHIP_MODULE}.ship`;

/** True when the ship design module is enabled in this world. */
export function shipDesignActive(): boolean {
  return game.modules?.get(SHIP_MODULE)?.active === true;
}

/** Blueprint ships on the chart. Hidden, and empty, unless ship design is active. */
export async function resolveShipMarks(): Promise<ChartShip[]> {
  if (!shipDesignActive() || !shipsShown()) return [];
  const actors = game.actors?.contents ?? [];
  const ships = actors.filter((actor) => actor.type === SHIP_TYPE && !actor.pack);
  const carried = carriedIds(ships);
  const groups = new Map<string, ChartShip>();
  for (const actor of ships) {
    if (carried.has(actor.id)) continue;
    const place = readPlace(actor);
    if (!place) continue;
    const key = `${place.sector}|${place.hex}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.worldX === null && place.worldX !== null && place.worldY !== null) {
        existing.worldX = place.worldX;
        existing.worldY = place.worldY;
      }
      continue;
    }
    groups.set(key, { ...place, count: 1 });
  }
  const marks = [...groups.values()];
  await Promise.all(marks.map((mark) => fillCoordinates(mark)));
  return marks;
}

/** Redraw ship marks when a blueprint actor is created, moved, or deleted. */
export function watchShipActors(onChange: () => void): () => void {
  const created = Hooks.on("createActor", onChange);
  const updated = Hooks.on("updateActor", onChange);
  const deleted = Hooks.on("deleteActor", onChange);
  return () => {
    Hooks.off("createActor", created);
    Hooks.off("updateActor", updated);
    Hooks.off("deleteActor", deleted);
  };
}

/** Actor ids stored in another ship's module bay or breakaway bay. */
function carriedIds(ships: readonly FoundryActor[]): Set<string> {
  const ids = new Set<string>();
  for (const ship of ships) {
    for (const bay of [ship.system?.moduleBay, ship.system?.breakawayBay]) {
      if (!bay) continue;
      for (const [id, value] of Object.entries(bay)) {
        if (!id || value == null || value === false || value === 0) continue;
        ids.add(id);
      }
    }
  }
  return ids;
}

function readPlace(actor: FoundryActor): Omit<ChartShip, "count"> | null {
  const raw = actor.getFlag?.(SHIP_MODULE, "currentSystem") ?? actor.flags?.[SHIP_MODULE]?.currentSystem;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sector = String(value.sector ?? "").trim();
  const hex = String(value.hex ?? "").trim();
  if (!sector || !hex) return null;
  const worldX = Number(value.worldX);
  const worldY = Number(value.worldY);
  return {
    sector,
    hex,
    worldX: Number.isFinite(worldX) ? worldX : null,
    worldY: Number.isFinite(worldY) ? worldY : null,
  };
}

async function fillCoordinates(mark: ChartShip): Promise<void> {
  if (mark.worldX !== null && mark.worldY !== null) return;
  try {
    const world = await loadSurveyedWorld(mark.sector, mark.hex);
    if (world.worldX !== null && world.worldY !== null) {
      mark.worldX = world.worldX;
      mark.worldY = world.worldY;
    }
  } catch {
    // No catalog hit. A world already on the chart can still place this hex.
  }
}
