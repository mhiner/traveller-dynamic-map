import { worldId } from "./codes.ts";
import type { RouteStop, World } from "./world.ts";

/** The world record a route stop draws and searches as. */
export function worldFromStop(stop: RouteStop): World {
  return {
    id: worldId({ sector: stop.sector, hex: stop.hex, name: stop.name }),
    name: stop.name,
    sector: stop.sector,
    hex: stop.hex,
    uwp: stop.uwp,
    tradeCodes: [...stop.tradeCodes],
    zone: stop.zone,
    worldX: stop.worldX,
    worldY: stop.worldY,
    manual: false,
  };
}
