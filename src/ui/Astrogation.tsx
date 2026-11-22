import { useEffect, useRef, useState } from "../runtime.ts";
import { cacheSector, jumpRoute, loadWorld, loadWorldProfile, searchWorlds, worldsWithin, type SearchHit } from "../travellerMap.ts";
import { ExploreMap } from "./ExploreMap.tsx";
import { ExploreFilters, shadeFromControl, type MapShade } from "./ExploreFilters.tsx";
import { JumpRouteColumn, PlottedRoute, WorldsWithinJump } from "./RouteColumn.tsx";
import { DEFAULT_SECTOR_LIMIT } from "../worldCache.ts";
import type { WorldProfile as Profile } from "../worldProfile.ts";
import { WorldProfile } from "./WorldProfile.tsx";
import { hostPrefersDarkMap } from "../mapInk.ts";
import { worldFromStop } from "../route.ts";
import { askConfirm, emitSetDestination, emitSetLocation } from "../session.ts";
import type { MapRoute, World } from "../world.ts";

export interface AstrogationProps {
  jumpRating: number;
  currentWorld: World | null;
  destination: World | null;
  route: MapRoute | null;
  inJump: boolean;
  /** Sectors a ship already occupies. The explore view adds the world it is showing. */
  occupiedSectors: readonly string[];
  /** Host-rendered trade table for the two worlds shown on the route view. */
  trade?: (origin: World, destination: World) => unknown;
  /** Explore-map magnification floor. Omitted values use the package default. */
  zoomMin?: number;
  /** Explore-map magnification ceiling. Omitted values use the package default. */
  zoomMax?: number;
  /**
   * When set, the chart uses this ink and the Dark view control is omitted.
   * Omitted values keep the on-screen toggle, starting from the host color scheme.
   */
  dark?: boolean;
  /**
   * When set, the screen opens on the explore map.
   * `false` also hides the route-planning switch. Omit this to open on route planning.
   */
  routePlanning?: boolean;
  /**
   * When true, the selected world's hex border is yellow.
   * Omitted and false leave every hex border unchanged.
   */
  selectedOutline?: boolean;
  /**
   * When set, the find bar and world sheets render into this element instead of beside the map.
   * `portal` is the host renderer’s createPortal. The library does not depend on Preact.
   */
  tools?: {
    element: HTMLElement;
    portal: (children: unknown, element: HTMLElement) => unknown;
  } | null;
  /**
   * When set, explore-map filters and the centered world follow this control.
   * Chat commands in the Foundry host write it. Omit it to keep the filters local.
   */
  mapControl?: ExploreMapControl | null;
}

export interface ExploreMapControl {
  filters: { tech: string | null; starport: string | null; trade: readonly string[] };
  borders: boolean;
  setBorders: (shown: boolean) => void;
  focus: { sector: string; hex: string; worldX: number | null; worldY: number | null } | null;
  focusId: number;
  setFilters: (filters: { tech: string | null; starport: string | null; trade: readonly string[] }) => void;
  consumeFocus: () => void;
  /** Records the world the explore map is centered on. The dev page omits this. */
  reportView?: (focus: { name: string; sector: string; hex: string; worldX: number | null; worldY: number | null }) => void;
  /** Records the world shown in the profile. The dev page omits this. */
  reportSelection?: (focus: { name: string; sector: string; hex: string; worldX: number | null; worldY: number | null }) => void;
  /**
   * View restored from the last session. Read once, when the screen first mounts.
   * The dev page omits this.
   */
  restore?: {
    query: string;
    selected: World | null;
    center: World | null;
    camera: { zoom: number; x: number; y: number } | null;
  } | null;
  /** Records the find-box text. The dev page omits this. */
  reportQuery?: (query: string) => void;
  /** Records the explore-map zoom and pan. The dev page omits this. */
  reportCamera?: (view: { zoom: number; x: number; y: number }) => void;
  /** Hex the first chart was built around. The dev page omits this. */
  chartHex?: { worldX: number; worldY: number } | null;
}

/** A search hit already knows where the world sits, even when the loaded record does not. */
function placedWorld(world: World, at?: { worldX: number | null; worldY: number | null }): World {
  if (world.worldX !== null && world.worldY !== null) return world;
  if (at?.worldX == null || at.worldY == null) return world;
  return { ...world, worldX: at.worldX, worldY: at.worldY };
}

/** Load the profile for the world on screen. A manual world has none. */
function useMappedProfile(world: World | null): { profile: Profile | null; error: string } {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const sector = world && !world.manual ? world.sector : "";
  const hex = world && !world.manual ? world.hex : "";
  useEffect(() => {
    if (!sector || !hex) {
      setProfile(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setProfile(null);
    loadWorldProfile(sector, hex, controller.signal)
      .then((sheet) => {
        setProfile(sheet);
        setError("");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "World data failed");
      });
    return () => controller.abort();
  }, [sector, hex]);
  return { profile, error };
}

/** The world sheet, or a short note when the world is not on Traveller Map. */
function PlaceProfile({ world, profile, error, compact = false }: { world: World; profile: Profile | null; error: string; compact?: boolean }) {
  if (world.manual || !world.sector || !world.hex) {
    return (
      <div className="world-profile">
        <h2>{world.name}</h2>
        <p className="meta">{world.uwp} · {world.zone} · {world.tradeCodes.join(" ") || "No trade codes"}</p>
        <p className="meta">This location is not on Traveller Map.</p>
      </div>
    );
  }
  if (profile) return <WorldProfile profile={profile} compact={compact} />;
  return (
    <div className="world-profile">
      <h2>{world.name}</h2>
      {error ? <p className="error">{error}</p> : <p className="meta">Loading the world profile…</p>}
    </div>
  );
}

/** Search, the explore map, and the route view. A host with tools keeps the sheet in the dock and the chart on the board. */
export function Astrogation({ jumpRating, currentWorld, destination, route, inJump, occupiedSectors, trade, zoomMin, zoomMax, dark, routePlanning, selectedOutline = false, tools, mapControl = null }: AstrogationProps) {
  const restored = mapControl?.restore ?? null;
  const [query, setQuery] = useState(() => restored?.query ?? "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchNote, setSearchNote] = useState("");
  const [neighbors, setNeighbors] = useState<Array<World & { parsecs: number }>>([]);
  const [error, setError] = useState("");
  const [routePending, setRoutePending] = useState(false);
  const [routeIndex, setRouteIndex] = useState<number | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [exploring, setExploring] = useState(typeof routePlanning === "boolean");
  const [panelShade, setPanelShade] = useState<MapShade>(() => shadeFromControl(null));
  // Foundry changes filters through the host, and the dock does not mount the panel.
  // The chart reads that host on this render. The dev page has no host, so it uses the panel.
  const shade = mapControl ? shadeFromControl(mapControl) : panelShade;
  const [darkChoice, setDarkChoice] = useState(hostPrefersDarkMap);
  const darkMap = typeof dark === "boolean" ? dark : darkChoice;
  const [exploreWorld, setExploreWorld] = useState<World | null>(restored?.selected ?? restored?.center ?? null);
  const [mapCenter, setMapCenter] = useState<World | null>(restored?.center ?? null);
  const [mapFocus, setMapFocus] = useState(0);
  const selectTicket = useRef(0);
  const routeAbort = useRef<AbortController | null>(null);
  const here = currentWorld;
  const routeKey = route?.stops.map((stop) => `${stop.sector}|${stop.hex}`).join(">") ?? "";
  const focusedStop = route && routeIndex !== null ? route.stops[routeIndex] : undefined;
  const nextStop = route && routeIndex !== null ? route.stops[routeIndex + 1] : undefined;
  const shownHere = focusedStop ? worldFromStop(focusedStop) : here;
  const shownThere = routeIndex !== null ? (nextStop ? worldFromStop(nextStop) : null) : destination;
  const hereSheet = useMappedProfile(shownHere);
  const destinationSheet = useMappedProfile(shownThere);
  const exploreSheet = useMappedProfile(exploring ? exploreWorld : null);

  useEffect(() => {
    if (routePlanning === false) setExploring(true);
  }, [routePlanning]);

  useEffect(() => {
    const target = mapControl?.focus;
    if (!mapControl || !target) return;
    mapControl.consumeFocus();
    setExploring(true);
    void selectExplored(target.sector, target.hex, true, target);
  }, [mapControl?.focusId]);

  const reportQueryRef = useRef(mapControl?.reportQuery);
  reportQueryRef.current = mapControl?.reportQuery;
  useEffect(() => {
    reportQueryRef.current?.(query);
  }, [query]);

  useEffect(() => {
    if (!mapCenter || mapCenter.manual || !mapCenter.sector || !mapCenter.hex) return;
    if (mapCenter.worldX == null || mapCenter.worldY == null) return;
    mapControl?.reportView?.({
      name: mapCenter.name,
      sector: mapCenter.sector,
      hex: mapCenter.hex,
      worldX: mapCenter.worldX,
      worldY: mapCenter.worldY,
    });
  }, [mapCenter]);

  useEffect(() => {
    if (!exploreWorld || exploreWorld.manual || !exploreWorld.sector || !exploreWorld.hex) return;
    mapControl?.reportSelection?.({
      name: exploreWorld.name,
      sector: exploreWorld.sector,
      hex: exploreWorld.hex,
      worldX: exploreWorld.worldX,
      worldY: exploreWorld.worldY,
    });
  }, [exploreWorld]);

  useEffect(() => {
    if (!exploring || exploreWorld || !shownHere) return;
    setExploreWorld(shownHere);
    setMapCenter(shownHere);
  }, [exploring, exploreWorld, shownHere]);

  const originX = here && !here.manual ? here.worldX : null;
  const originY = here && !here.manual ? here.worldY : null;
  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(() => {
      const origin = originX !== null && originY !== null ? { worldX: originX, worldY: originY } : null;
      searchWorlds(query, origin, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setHits(found.hits);
          setSearchNote(found.noneInRange ? "No matching worlds found within 160 parsecs." : "");
          setError("");
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setSearchNote("");
          setError(reason instanceof Error ? reason.message : "Search failed");
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [query, originX, originY]);

  useEffect(() => {
    const world = currentWorld;
    if (!world || world.manual) {
      setNeighbors([]);
      return;
    }
    const controller = new AbortController();
    worldsWithin(world, jumpRating, controller.signal)
      .then(setNeighbors)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Jump map failed");
      });
    return () => controller.abort();
  }, [currentWorld, jumpRating]);

  useEffect(() => {
    setRouteIndex(null);
    setRouteOpen(false);
  }, [routeKey]);

  /** Sectors that already have a ship, plus the sector the explore map is showing. */
  function sectorsToKeep(): string[] {
    const showing = exploreWorld && !exploreWorld.manual && exploreWorld.sector ? [exploreWorld.sector] : [];
    return [...new Set([...occupiedSectors, ...showing])];
  }

  /** Switch to the explore map, centered on the world the route view is showing. */
  function openExplore() {
    setExploreWorld(shownHere);
    setMapCenter(shownHere);
    setExploring(true);
  }

  /** Cache a sector. When every cached sector has a ship, ask before growing the cache. */
  async function retainSector(sector: string): Promise<boolean> {
    const keep = sectorsToKeep();
    const first = await cacheSector(sector, keep);
    if (first.status === "ready") return true;
    const limit = first.limit ?? DEFAULT_SECTOR_LIMIT;
    const grow = askConfirm(`Caching ${sector} would exceed the limit of ${limit} sectors. Every cached sector still has a ship in it. Increase the cache by 1?`);
    if (!grow) return false;
    const second = await cacheSector(sector, keep, { allowGrow: true });
    return second.status === "ready";
  }

  /** Empty the find box and its results. */
  function clearSearch() {
    setQuery("");
    setHits([]);
    setSearchNote("");
  }

  /** Load a world onto the explore map. A newer selection drops this one. */
  async function selectExplored(sector: string, hex: string, recenter: boolean, at?: { worldX: number | null; worldY: number | null }) {
    const ticket = ++selectTicket.current;
    try {
      const loaded = await loadWorld(sector, hex);
      if (ticket !== selectTicket.current) return;
      const world = placedWorld(loaded, at);
      setExploreWorld(world);
      if (recenter && world.worldX !== null && world.worldY !== null) {
        setMapCenter(world);
        setMapFocus((current) => current + 1);
      }
      setError("");
      clearSearch();
    } catch (reason) {
      if (ticket !== selectTicket.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load that world");
    }
  }

  /** A find result. Explore selects it. Route planning sets the location, or plots a jump when a location already exists. */
  async function choose(hit: SearchHit) {
    if (exploring) {
      await selectExplored(hit.sector, hit.hex, true, hit);
      return;
    }
    if (!here) {
      if (!askConfirm(`Set the current location to ${hit.name} (${hit.sector} ${hit.hex})?`)) return;
      try {
        if (!(await retainSector(hit.sector))) {
          setError(`The ${hit.sector} sector was not cached.`);
          return;
        }
        const world = await loadWorld(hit.sector, hit.hex);
        const refused = await emitSetLocation(world);
        setError(refused ?? "");
        if (!refused) clearSearch();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not load that world");
      }
      return;
    }
    if (here.manual || !here.sector || !here.hex) {
      setError("The current location is not on the map, so a jump route cannot be plotted.");
      return;
    }
    if (here.sector === hit.sector && here.hex === hit.hex) {
      setError(`${hit.name} is the current location.`);
      return;
    }
    if (inJump) {
      setError("The ship is in jump.");
      return;
    }
    try {
      if (!(await retainSector(here.sector))) {
        setError(`The ${here.sector} sector was not cached.`);
        return;
      }
      if (!(await retainSector(hit.sector))) {
        setError(`The ${hit.sector} sector was not cached.`);
        return;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cache that sector");
      return;
    }
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRoutePending(true);
    setError("");
    try {
      const stops = await jumpRoute(here, hit, jumpRating, controller.signal);
      if (controller.signal.aborted) return;
      const nextHop = stops[1] ? worldFromStop(stops[1]) : null;
      const refused = await emitSetDestination({ world: nextHop, route: { jump: jumpRating, stops } });
      setError(refused ?? "");
      if (!refused) clearSearch();
    } catch (reason) {
      if (controller.signal.aborted) return;
      const message = reason instanceof Error ? reason.message : "Jump route failed";
      setError(message === "No route found" ? `No jump-${jumpRating} route from ${here.name} to ${hit.name} in the cached sectors.` : message);
    } finally {
      if (routeAbort.current === controller) setRoutePending(false);
    }
  }

  /** Set the destination to a world already inside the jump range, without plotting a route. */
  async function chooseNeighbor(world: World & { parsecs: number }) {
    const refused = await emitSetDestination({ world, route: null });
    setError(refused ?? "");
    if (!refused) clearSearch();
  }

  const chartWorld = shownHere && !shownHere.manual && shownHere.sector && shownHere.hex ? shownHere : null;
  const mapped = Boolean(chartWorld);
  const showSide = Boolean(shownThere && mapped);
  const sheetsClass = shownThere && showSide
    ? "world-pair with-route"
    : shownThere
      ? "world-pair"
      : showSide
        ? "world-pair route-side"
        : mapped
          ? "world-with-map"
          : undefined;
  const map = chartWorld ? (
    <JumpRouteColumn sector={chartWorld.sector} hex={chartWorld.hex} name={chartWorld.name} dark={darkMap} outline={selectedOutline} column={showSide} />
  ) : null;
  const routeFrom = focusedStop?.name ?? here?.name ?? route?.stops[0]?.name ?? "";
  const routeTo = route?.stops[route.stops.length - 1]?.name ?? "";
  const routeListBody = (
    <PlottedRoute
      route={route}
      pending={routePending}
      open={routeOpen}
      selected={routeIndex}
      from={routeFrom}
      to={routeTo}
      onToggle={setRouteOpen}
      onSelect={setRouteIndex}
    />
  );

  const exploreReady = Boolean(
    exploring && exploreWorld && mapCenter && exploreWorld.worldX !== null && mapCenter.worldX !== null && mapCenter.worldY !== null,
  );
  const exploreProfile = exploreReady && exploreWorld ? (
    <div className="explore-world">
      <PlaceProfile world={exploreWorld} profile={exploreSheet.profile} error={exploreSheet.error} compact={tools != null} />
    </div>
  ) : null;
  const exploreMap = exploreReady && mapCenter && mapCenter.worldX !== null && mapCenter.worldY !== null ? (
    <div className="explore-map-slot">
      <ExploreMap
        worldX={mapCenter.worldX}
        worldY={mapCenter.worldY}
        focus={mapFocus}
        keep={sectorsToKeep()}
        minTech={shade.minTech}
        minStarport={shade.minStarport}
        tradeCodes={shade.tradeCodes}
        drawBorders={shade.drawBorders}
        dark={darkMap}
        zoomMin={zoomMin}
        zoomMax={zoomMax}
        chartHex={mapControl?.chartHex ?? null}
        restore={restored?.camera ?? null}
        onView={mapControl?.reportCamera}
        onSelect={(sector, hex) => void selectExplored(sector, hex, false)}
        selected={selectedOutline && exploreWorld && !exploreWorld.manual && exploreWorld.sector && exploreWorld.hex
          ? { sector: exploreWorld.sector, hex: exploreWorld.hex }
          : null}
      />
    </div>
  ) : null;
  const sheetHere = shownHere ? <PlaceProfile world={shownHere} profile={hereSheet.profile} error={hereSheet.error} compact={tools != null} /> : null;
  const sheetThere = shownThere ? <PlaceProfile world={shownThere} profile={destinationSheet.profile} error={destinationSheet.error} compact={tools != null} /> : null;
  const tradeTable = trade && shownHere && shownThere ? trade(shownHere, shownThere) : null;
  const finder = (
    <div className="world-search">
      <h2>
        Find a world
        {routePlanning === false ? null : (
          <button type="button" className="mode-switch" onClick={() => exploring ? setExploring(false) : openExplore()}>
            {exploring ? "(route planning)" : "(explore map)"}
          </button>
        )}
      </h2>
      <input aria-label="Name" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      {typeof dark === "boolean" ? null : (
        <label className="check map-theme">
          <input type="checkbox" checked={darkMap} onChange={(event) => setDarkChoice(event.currentTarget.checked)} />
          Dark view
        </label>
      )}
      {exploring ? (
        <ExploreFilters control={mapControl} onChange={setPanelShade} />
      ) : (
        <div className="jump-lists">
          <WorldsWithinJump jumpRating={jumpRating} worlds={neighbors} onChoose={(world) => void chooseNeighbor(world)} />
          {routeListBody}
        </div>
      )}
      {error ? <p className="error">{error}</p> : null}
      {searchNote ? <p className="meta">{searchNote}</p> : null}
      <ul className="list">
        {hits.slice(0, 12).map((hit) => (
          <li key={`${hit.sector}|${hit.hex}`}>
            <button type="button" onClick={() => void choose(hit)}>
              {hit.name} · {hit.sector} {hit.hex} · {hit.uwp}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  if (tools) {
    const sheets = exploring ? (exploreProfile ?? <p className="meta">No world selected.</p>) : here ? (
      <>
        <div className="world-stack">
          {sheetHere}
          {sheetThere}
        </div>
        {tradeTable}
      </>
    ) : <p className="meta">No world selected.</p>;
    return (
      <>
        {tools.portal(
          <section className="panel">{sheets}</section>,
          tools.element,
        )}
        <section className={exploring ? "panel explore-screen" : "panel"}>
          {exploring ? (exploreMap ?? <p className="meta">Search for a world.</p>) : here ? (
            map
          ) : (
            <p className="meta">Search for a world.</p>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <section className="panel">{finder}</section>
      {exploring ? (
        <section className="panel explore-screen">
          {exploreProfile}
          {exploreMap ?? <p className="meta">Search for a world.</p>}
        </section>
      ) : here ? (
        <section className="panel">
          <div className={sheetsClass}>
            <div>{sheetHere}</div>
            {sheetThere ? <div>{sheetThere}</div> : null}
            {map}
          </div>
          {tradeTable}
        </section>
      ) : (
        <section className="panel">
          <p className="meta">Search for a world.</p>
        </section>
      )}
    </>
  );
}
