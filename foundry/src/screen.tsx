import { useEffect, useRef, useState } from "preact/hooks";
import type { AstrogationProps, MapInstance } from "../../src/instance.tsx";
import type { MapRoute, World as MapWorld } from "../../src/world.ts";
import { loadHomeWorld } from "./home.ts";
import type { ChartShip } from "../../src/ui/shipMark.ts";
import { bordersShown, consumeMapFocus, exploreFilters, mapFocus, replaceFilters, reportMapView, reportSelection, setBorders, subscribeExplore } from "./astro.ts";
import { loginChartCenter, recallScene, rememberCamera, rememberQuery, restoredScene } from "./sceneState.ts";
import { resolveShipMarks, watchShipActors } from "./shipMarks.ts";

interface Memory {
  currentWorld: MapWorld | null;
  destination: MapWorld | null;
  route: MapRoute | null;
  homeName: string;
}

/** Location, destination, and route kept when the screen remounts. */
const memory: Memory = {
  currentWorld: null,
  destination: null,
  route: null,
  homeName: ""
};

/** The home-world load still in flight. A newer name cancels the result of an older one. */
let homeRequest = 0;

/** The world the map is currently treating as the ship's location. */
export function currentMapWorld(): MapWorld | null {
  return memory.currentWorld;
}

/** Astrogation view for the scene. Jump range, zoom, and ink come from module settings. */
export function Screen({ view: View, listen, homeName, jumpRating, zoomMin, zoomMax, dark, selectedOutline = false, tools = null }: {
  view: MapInstance["View"];
  listen: MapInstance["on"];
  homeName: string;
  jumpRating: number;
  zoomMin: number;
  zoomMax: number;
  dark: boolean;
  selectedOutline?: boolean;
  tools?: AstrogationProps["tools"];
}) {
  recallScene();
  const [currentWorld, setCurrentWorld] = useState(memory.currentWorld);
  const [destination, setDestination] = useState(memory.destination);
  const [route, setRoute] = useState(memory.route);
  const [filters, setFilters] = useState(() => exploreFilters());
  const [borders, setBorderState] = useState(() => bordersShown());
  const [ships, setShips] = useState<ChartShip[]>([]);
  const [aimed, setAimed] = useState(() => mapFocus());
  const homeNameRef = useRef(homeName);
  homeNameRef.current = homeName;
  memory.currentWorld = currentWorld;
  memory.destination = destination;
  memory.route = route;

  useEffect(() => {
    const stopLocation = listen("setLocation", (world) => {
      homeRequest += 1;
      memory.homeName = homeNameRef.current;
      memory.currentWorld = world;
      setCurrentWorld(world);
    });
    const stopDestination = listen("setDestination", (event) => {
      setDestination(event.world);
      setRoute(event.route);
    });
    return () => {
      stopLocation();
      stopDestination();
    };
  }, [listen]);

  useEffect(() => {
    let current = true;
    let ticket = 0;
    const loadShips = () => {
      const mine = ++ticket;
      void resolveShipMarks().then((marks) => {
        if (current && mine === ticket) setShips(marks);
      });
    };
    loadShips();
    const stopExplore = subscribeExplore(() => {
      setFilters(exploreFilters());
      setBorderState(bordersShown());
      setAimed(mapFocus());
      loadShips();
    });
    const stopActors = watchShipActors(loadShips);
    return () => {
      current = false;
      stopExplore();
      stopActors();
    };
  }, []);

  useEffect(() => {
    if (memory.homeName === homeName && memory.currentWorld) return;
    const request = ++homeRequest;
    const controller = new AbortController();
    const label = homeName.trim() || "Regina";
    loadHomeWorld(label, controller.signal)
      .then((world) => {
        if (request !== homeRequest) return;
        memory.homeName = homeName;
        memory.currentWorld = world;
        memory.destination = null;
        memory.route = null;
        setCurrentWorld(world);
        setDestination(null);
        setRoute(null);
      })
      .catch((reason: unknown) => {
        if (request !== homeRequest) return;
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const message = reason instanceof Error ? reason.message : "The home system could not be loaded.";
        ui.notifications.error(message);
      });
    return () => {
      controller.abort();
      if (homeRequest === request) homeRequest += 1;
    };
  }, [homeName]);

  const occupied = currentWorld && !currentWorld.manual && currentWorld.sector
    ? [currentWorld.sector]
    : [];

  return (
    <div className={tools ? "shell tools-docked" : "shell"}>
      <div className="ship-body">
        <View
          jumpRating={jumpRating}
          zoomMin={zoomMin}
          zoomMax={zoomMax}
          dark={dark}
          routePlanning={false}
          selectedOutline={selectedOutline}
          currentWorld={currentWorld}
          destination={destination}
          route={route}
          inJump={false}
          occupiedSectors={occupied}
          tools={tools}
          mapControl={{
            filters,
            borders,
            setBorders,
            focus: aimed.focus,
            focusId: aimed.focusId,
            setFilters: replaceFilters,
            consumeFocus: consumeMapFocus,
            reportView: reportMapView,
            reportSelection,
            chartHex: loginChartCenter(currentWorld),
            ships,
            restore: restoredScene(),
            reportQuery: rememberQuery,
            reportCamera: rememberCamera,
          }}
        />
      </div>
    </div>
  );
}
