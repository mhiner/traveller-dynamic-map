export type Zone = "green" | "amber" | "red";

/** A world the map can place, search, or route through. */
export interface World {
  id: string;
  name: string;
  sector: string;
  hex: string;
  uwp: string;
  tradeCodes: string[];
  zone: Zone;
  worldX: number | null;
  worldY: number | null;
  manual: boolean;
}

/** One system on a plotted jump route. */
export interface RouteStop {
  name: string;
  sector: string;
  subsector: string;
  hex: string;
  uwp: string;
  zone: Zone;
  allegiance: string;
  pbg: string;
  tradeCodes: string[];
  worldX: number | null;
  worldY: number | null;
}

/** Remaining jumps from the current world to the end of a plotted route. */
export interface MapRoute {
  jump: number;
  stops: RouteStop[];
}
