import { render } from "preact";
import { Fragment, jsx, jsxs } from "preact/jsx-runtime";
import { useEffect, useRef, useState } from "preact/hooks";
import { createMap, EXPLORE_ZOOM_MAX, EXPLORE_ZOOM_MIN, type MapRoute, type MapWorld } from "../mod.ts";

/** The map this preview page renders. */
const map = createMap({
  jsxRuntime: { Fragment, jsx, jsxs },
  hooks: { useEffect, useRef, useState },
});

/** The status line under the preview controls. */
const status = document.querySelector("#dev-status");
/** The jump-range control outside the map. */
const jump = document.querySelector("#jump");
/** The explore-map zoom floor control. */
const zoomMinInput = document.querySelector("#zoom-min");
/** The explore-map zoom ceiling control. */
const zoomMaxInput = document.querySelector("#zoom-max");

/** A positive number from an input, or null when the field is empty or not a number. */
function zoomValue(input: HTMLInputElement): number | null {
  const value = input.valueAsNumber;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Replace the status line. */
function note(text: string) {
  if (status) status.textContent = text;
}

/** Preview screen. It keeps the ship's world and feeds the jump and zoom controls into the map. */
function Screen() {
  const [jumpRating, setJumpRating] = useState(2);
  const [zoomMin, setZoomMin] = useState(EXPLORE_ZOOM_MIN);
  const [zoomMax, setZoomMax] = useState(EXPLORE_ZOOM_MAX);
  const zoomMinRef = useRef(EXPLORE_ZOOM_MIN);
  const zoomMaxRef = useRef(EXPLORE_ZOOM_MAX);
  const [currentWorld, setCurrentWorld] = useState<MapWorld | null>(null);
  const [destination, setDestination] = useState<MapWorld | null>(null);
  const [route, setRoute] = useState<MapRoute | null>(null);

  useEffect(() => {
    const stopLocation = map.on("setLocation", (world) => {
      setCurrentWorld(world);
      note(`${world.name} is the current location.`);
      document.title = `${world.name} · Astrogation`;
    });
    const stopDestination = map.on("setDestination", (event) => {
      setDestination(event.world);
      setRoute(event.route);
      note(event.world ? `Destination set to ${event.world.name}.` : "Destination cleared.");
    });
    return () => {
      stopLocation();
      stopDestination();
    };
  }, []);

  useEffect(() => {
    if (!(jump instanceof HTMLSelectElement)) return;
    const onChange = () => setJumpRating(Number(jump.value));
    jump.addEventListener("change", onChange);
    return () => jump.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!(zoomMinInput instanceof HTMLInputElement) || !(zoomMaxInput instanceof HTMLInputElement)) return;
    zoomMinInput.value = String(EXPLORE_ZOOM_MIN);
    zoomMaxInput.value = String(EXPLORE_ZOOM_MAX);

    const commit = (edited: "min" | "max") => {
      const nextMin = zoomValue(zoomMinInput);
      const nextMax = zoomValue(zoomMaxInput);
      if (nextMin === null || nextMax === null) return;
      let min = nextMin;
      let max = nextMax;
      if (min > max) {
        if (edited === "min") {
          min = max;
          zoomMinInput.value = String(min);
        } else {
          max = min;
          zoomMaxInput.value = String(max);
        }
      }
      zoomMinRef.current = min;
      zoomMaxRef.current = max;
      setZoomMin(min);
      setZoomMax(max);
    };
    const onMin = () => commit("min");
    const onMax = () => commit("max");
    const restore = () => {
      if (zoomValue(zoomMinInput) === null) zoomMinInput.value = String(zoomMinRef.current);
      if (zoomValue(zoomMaxInput) === null) zoomMaxInput.value = String(zoomMaxRef.current);
    };
    zoomMinInput.addEventListener("input", onMin);
    zoomMaxInput.addEventListener("input", onMax);
    zoomMinInput.addEventListener("blur", restore);
    zoomMaxInput.addEventListener("blur", restore);
    return () => {
      zoomMinInput.removeEventListener("input", onMin);
      zoomMaxInput.removeEventListener("input", onMax);
      zoomMinInput.removeEventListener("blur", restore);
      zoomMaxInput.removeEventListener("blur", restore);
    };
  }, []);

  const occupied = currentWorld && !currentWorld.manual && currentWorld.sector
    ? [currentWorld.sector]
    : [];
  const View = map.View;
  return (
    <View
      jumpRating={jumpRating}
      zoomMin={zoomMin}
      zoomMax={zoomMax}
      currentWorld={currentWorld}
      destination={destination}
      route={route}
      inJump={false}
      occupiedSectors={occupied}
    />
  );
}

/** The element the map is rendered into. */
const root = document.querySelector("#map");
if (!root) throw new Error("Missing #map");
render(<Screen />, root);
