import type { SectorCache } from "./cache.ts";
import type { SectorLibrary } from "./sectorLibrary.ts";
import type { MapSource } from "./source.ts";
import type { MapRoute, World } from "./world.ts";

export type LocationListener = (world: World) => string | void | Promise<string | void>;

export type DestinationListener = (event: {
  world: World | null;
  route: MapRoute | null;
}) => string | void | Promise<string | void>;

export interface MapSession {
  cache: SectorCache;
  source: MapSource;
  /** Packed sectors. Omitted means every read uses the map source. */
  sectors: SectorLibrary | null;
  confirm: (message: string) => boolean;
  listeners: {
    setLocation: Set<LocationListener>;
    setDestination: Set<DestinationListener>;
  };
}

/** The cache, source, and listeners for the map that is open. */
export const mapSession: { current: MapSession | null } = { current: null };

/** That map. Using the map before createMap fails here. */
export function liveSession(): MapSession {
  const current = mapSession.current;
  if (!current) throw new Error("Call createMap() before using the map.");
  return current;
}

/** The last string a listener returned. Empty results are success. */
async function firstError(results: Array<string | void | Promise<string | void>>): Promise<string | undefined> {
  let error: string | undefined;
  for (const result of results) {
    const value = await result;
    if (typeof value === "string" && value) error = value;
  }
  return error;
}

/** Tell listeners the ship's world changed. A string result is the refusal. */
export function emitSetLocation(world: World): Promise<string | undefined> {
  const listeners = [...liveSession().listeners.setLocation];
  return firstError(listeners.map((listener) => listener(world)));
}

/** Tell listeners the destination or route changed. A string result is the refusal. */
export function emitSetDestination(event: { world: World | null; route: MapRoute | null }): Promise<string | undefined> {
  const listeners = [...liveSession().listeners.setDestination];
  return firstError(listeners.map((listener) => listener(event)));
}

/** The question the host shows before the sector cache grows. */
export function askConfirm(message: string): boolean {
  return liveSession().confirm(message);
}
