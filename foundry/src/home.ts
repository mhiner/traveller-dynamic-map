import { cacheSector, loadWorld, searchWorlds, type SearchHit } from "../../src/travellerMap.ts";
import type { World as MapWorld } from "../../src/world.ts";
import { DEFAULT_HOME } from "./constants.ts";

/**
 * Exact names win. Among those, a Spinward Marches world wins, which is Regina
 * (1910) when the configured name is the default.
 */
export function pickHomeHit(name: string, hits: readonly SearchHit[]): SearchHit | null {
  const query = name.trim().toLowerCase();
  if (!query || hits.length === 0) return null;
  const exact = hits.filter((hit) => hit.name.toLowerCase() === query);
  const pool = exact.length > 0 ? exact : hits;
  return pool.find((hit) => hit.sector === "Spinward Marches") ?? pool[0] ?? null;
}

/** Search Traveller Map for the configured home world and cache its sector. */
export async function loadHomeWorld(name: string, signal?: AbortSignal): Promise<MapWorld> {
  const query = name.trim() || DEFAULT_HOME;
  const found = await searchWorlds(query, null, signal);
  const hit = pickHomeHit(query, found.hits);
  if (!hit) throw new Error(`No world named ${query} is on Traveller Map.`);
  let stored = await cacheSector(hit.sector, [hit.sector], { signal });
  if (stored.status === "needs-permission") {
    stored = await cacheSector(hit.sector, [hit.sector], { allowGrow: true, signal });
  }
  if (stored.status !== "ready") {
    throw new Error(`The ${hit.sector} sector could not be cached.`);
  }
  const world = await loadWorld(hit.sector, hit.hex, signal);
  if (world.worldX !== null && world.worldY !== null) return world;
  if (hit.worldX === null || hit.worldY === null) return world;
  return { ...world, worldX: hit.worldX, worldY: hit.worldY };
}
