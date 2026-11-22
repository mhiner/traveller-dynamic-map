import type { SectorCache } from "./cache.ts";
import { indexedDbSectorCache } from "./cache.ts";
import {
  cachedSectors,
  cacheSector,
  clearWorldCache,
  dropChartMemory,
  ensureArrivedSector,
  forgetCachedSector,
  jumpRoute,
  loadWorld,
  loadWorldProfile,
  searchWorlds,
  sectorCacheLimitValue,
  setSectorCacheLimit,
  warmWorldCache,
  worldsWithin,
  type CachedSectorSummary,
  type SearchHit,
  type SectorCacheResult,
  type WorldSearch
} from "./travellerMap.ts";
import { Astrogation, type AstrogationProps } from "./ui/Astrogation.tsx";
import { installMapRuntime, useEffect, useState, type MapHooks, type MapJsxRuntime } from "./runtime.ts";
import { mapSession, type DestinationListener, type LocationListener } from "./session.ts";
import type { SectorLibrary } from "./sectorLibrary.ts";
import { travellerMapSource, type MapSource } from "./source.ts";
import type { MapRoute, World } from "./world.ts";

export type { MapHooks, MapJsxRuntime };

export type MapEvent = "setLocation" | "setDestination";

export interface MapListeners {
  setLocation: LocationListener;
  setDestination: DestinationListener;
}

export interface MapOptions {
  jsxRuntime: MapJsxRuntime;
  hooks: MapHooks;
  cache?: SectorCache;
  source?: MapSource;
  /**
   * Packed sectors. Omitted, or a library with `enabled` false, keeps the map source.
   * `exclusive` does not call the map source.
   */
  sectors?: SectorLibrary | null;
  confirm?: (message: string) => boolean;
}

export interface MapInstance {
  /** Replace the sector cache used by this map. Open charts reload from it. */
  setCache(cache: SectorCache): void;
  cache(): SectorCache;
  /** Replace the Traveller Map reader. The default uses `/travellermap`. */
  setSource(source: MapSource): void;
  source(): MapSource;
  /** Replace the packed-sector reader and drop charts built from the previous one. */
  setSectorLibrary(sectors: SectorLibrary | null): void;
  sectorLibrary(): SectorLibrary | null;
  on<K extends MapEvent>(event: K, listener: MapListeners[K]): () => void;
  // deno-lint-ignore no-explicit-any
  View: (props: AstrogationProps) => any;
  searchWorlds: typeof searchWorlds;
  cacheSector: typeof cacheSector;
  loadWorld: typeof loadWorld;
  loadWorldProfile: typeof loadWorldProfile;
  worldsWithin: typeof worldsWithin;
  jumpRoute: typeof jumpRoute;
  warmWorldCache: typeof warmWorldCache;
  ensureArrivedSector: typeof ensureArrivedSector;
  cachedSectors: typeof cachedSectors;
  sectorCacheLimitValue: typeof sectorCacheLimitValue;
  setSectorCacheLimit: typeof setSectorCacheLimit;
  clearWorldCache: typeof clearWorldCache;
  forgetCachedSector: typeof forgetCachedSector;
}

/** The host confirm dialog. A host without one refuses the question. */
function browserConfirm(message: string): boolean {
  const ask = (globalThis as { confirm?: (message: string) => boolean }).confirm;
  return ask ? ask(message) : false;
}

/** Install the host renderer and return the map the page renders. */
export function createMap(options: MapOptions): MapInstance {
  installMapRuntime(options.jsxRuntime, options.hooks);
  const box = {
    cache: options.cache ?? indexedDbSectorCache(),
    source: options.source ?? travellerMapSource(),
    sectors: options.sectors ?? null,
    confirm: options.confirm ?? browserConfirm,
    generation: 0,
    listeners: {
      setLocation: new Set<LocationListener>(),
      setDestination: new Set<DestinationListener>(),
    },
  };
  mapSession.current = box;
  const watchers = new Set<() => void>();

  /** The screen. It remounts when the cache, source, or sector library is replaced. */
  function View(props: AstrogationProps) {
    const [generation, setGeneration] = useState(box.generation);
    useEffect(() => {
      const listener = () => setGeneration(box.generation);
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    }, []);
    return <Astrogation key={generation} {...props} />;
  }

  return {
    setCache(cache) {
      box.cache = cache;
      box.generation += 1;
      dropChartMemory();
      for (const watcher of watchers) watcher();
    },
    cache() {
      return box.cache;
    },
    setSource(source) {
      box.source = source;
    },
    source() {
      return box.source;
    },
    setSectorLibrary(sectors) {
      box.sectors = sectors;
      dropChartMemory();
      box.generation += 1;
      for (const watcher of watchers) watcher();
    },
    sectorLibrary() {
      return box.sectors;
    },
    on(event, listener) {
      if (event === "setLocation") {
        const located = listener as LocationListener;
        box.listeners.setLocation.add(located);
        return () => box.listeners.setLocation.delete(located);
      }
      const chosen = listener as DestinationListener;
      box.listeners.setDestination.add(chosen);
      return () => box.listeners.setDestination.delete(chosen);
    },
    View,
    searchWorlds,
    cacheSector,
    loadWorld,
    loadWorldProfile,
    worldsWithin,
    jumpRoute,
    warmWorldCache,
    ensureArrivedSector,
    cachedSectors,
    sectorCacheLimitValue,
    setSectorCacheLimit,
    clearWorldCache,
    forgetCachedSector,
  };
}

export type { AstrogationProps, CachedSectorSummary, MapRoute, SearchHit, SectorCacheResult, World, WorldSearch };
