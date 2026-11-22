/**
 * Public map API. The work lives in three modules:
 * worldStore keeps the sector cache and its write queue,
 * mapRoute searches and plots jumps,
 * chartLoad builds and remembers charts.
 * Importing this module registers chart invalidation on the cache.
 */
import "./chartLoad.ts";

export type { RouteStop } from "./world.ts";

export {
  cacheSector,
  cachedSectors,
  clearWorldCache,
  ensureArrivedSector,
  forgetCachedSector,
  replaceCachedWorld,
  releaseExploreSectors,
  sectorCacheLimitValue,
  setSectorCacheLimit,
  warmWorldCache,
  type CachedSectorSummary,
  type SectorCacheResult,
} from "./worldStore.ts";

export {
  jumpRoute,
  loadSurveyedWorld,
  loadWorld,
  loadWorldProfile,
  parseRoute,
  remoteRouteAllowed,
  SEARCH_PARSEC_LIMIT,
  searchCoordinates,
  searchWorlds,
  withinSearchRange,
  worldsWithin,
  type SearchHit,
  type WorldSearch,
} from "./mapRoute.ts";

export {
  dropChartMemory,
  forgetExploreChart,
  loadExploreChart,
  loadJumpChart,
  peekExploreChart,
  peekJumpChart,
  rememberExploreChart,
} from "./chartLoad.ts";
