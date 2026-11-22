import { useEffect, useRef, useState } from "../runtime.ts";
import { chartCovers, chartOpenHex, chartRadiusForView, clampExploreZoom, exploreZoomBounds, HEX_FLAT_HALF, hexOutline, hexPixel, viewportParsecs, worldNearPixel, type ChartWorld, type JumpChartView } from "../jumpChart.ts";
import { mapInk } from "../mapInk.ts";
import { loadExploreChart, peekExploreChart, releaseExploreSectors } from "../travellerMap.ts";
import { WorldIcon } from "./JumpChartMap.tsx";

/** Width of the hex grid stroke, in map pixels. */
const GRID_STROKE = 1;

interface Drag {
  id: number;
  x: number;
  y: number;
  camX: number;
  camY: number;
  moved: boolean;
}

/** A is the best starport and E is the worst on this scale. */
const STARPORTS = "ABCDE";

/** Tech level digit from a UWP such as A788899-C. Unknown and missing codes are skipped. */
function techLevel(world: ChartWorld): number | null {
  const code = world.uwp.match(/-([0-9A-F])/i)?.[1];
  if (!code) return null;
  const value = Number.parseInt(code, 16);
  return Number.isNaN(value) ? null : value;
}

/** Tech level and starport each apply when set. Selected trade codes match if the world has any one of them. */
export function highlightWorld(world: ChartWorld, minTech: number | null, minStarport: string | null, tradeCodes: readonly string[]): boolean {
  if (minTech === null && minStarport === null && tradeCodes.length === 0) return false;
  if (minTech !== null) {
    const tech = techLevel(world);
    if (tech === null || tech < minTech) return false;
  }
  if (minStarport !== null) {
    const letter = world.starport.toUpperCase();
    const rank = letter.length === 1 ? STARPORTS.indexOf(letter) : -1;
    const floor = STARPORTS.indexOf(minStarport.toUpperCase());
    if (rank < 0 || floor < 0 || rank > floor) return false;
  }
  if (tradeCodes.length > 0) {
    const codes = world.tradeCodes;
    if (!tradeCodes.some((code) => codes.includes(code))) return false;
  }
  return true;
}

interface LoadedDisk {
  centerX: number;
  centerY: number;
  radius: number;
  chart: JumpChartView;
}

/** The prepared chart for the hex the map opens on. A host hex wins, then the camera, then the focus world. */
function openingDisk(
  worldX: number,
  worldY: number,
  camera: { x: number; y: number } | null,
  chartHex: { worldX: number; worldY: number } | null,
): LoadedDisk | null {
  if (chartHex) {
    const hosted = peekExploreChart(chartHex.worldX, chartHex.worldY);
    if (hosted) return hosted;
  }
  const open = chartOpenHex({
    cameraX: camera?.x ?? null,
    cameraY: camera?.y ?? null,
    centerX: worldX,
    centerY: worldY,
    liveX: null,
    liveY: null,
  });
  if (!open) return null;
  const prepared = peekExploreChart(open.worldX, open.worldY);
  if (prepared) return prepared;
  if (open.worldX !== Math.round(worldX) || open.worldY !== Math.round(worldY)) return peekExploreChart(worldX, worldY);
  return null;
}

/** Width of an allegiance border stroke, in map pixels. */
const BORDER_STROKE = 2.6;
/** Yellow used for the selected world's hex. */
const SELECTED_HEX = "#f5c400";

/** Fine dots in map units, one tile per polity color. */
function stippleId(color: string): string {
  return `polity-stipple-${color.replace("#", "")}`;
}

/** SVG dash pattern for a dashed or dotted border. A solid border has none. */
function borderDash(style: JumpChartView["borders"][number]["dash"]): string | undefined {
  if (style === "dashed") return "16 10";
  if (style === "dotted") return "2 8";
  return undefined;
}

/** Hexes, routes, and world icons. Camera changes update the view box and leave this tree mounted. */
function ExploreChartBody({ chart, minTech, minStarport, tradeCodes, drawBorders, dark, selected }: {
  chart: JumpChartView;
  minTech: number | null;
  minStarport: string | null;
  tradeCodes: readonly string[];
  drawBorders: boolean;
  dark: boolean;
  selected: { sector: string; hex: string } | null;
}) {
  const shaded = new Set<string>();
  for (const world of chart.worlds) {
    if (highlightWorld(world, minTech, minStarport, tradeCodes)) shaded.add(`${world.x},${world.y}`);
  }
  const stipples = drawBorders ? [...new Set(chart.borders.map((border) => mapInk(border.color, dark)))] : [];
  const marked = selected
    ? chart.worlds.find((world) => world.sector === selected.sector && world.hex === selected.hex)
    : undefined;
  return (
    <>
      {stipples.length > 0 ? (
        <defs>
          {stipples.map((color) => (
            <pattern id={stippleId(color)} key={color} width={4} height={4} patternUnits="userSpaceOnUse">
              <circle cx={2} cy={2} r={0.5} fill={color} />
            </pattern>
          ))}
        </defs>
      ) : null}
      <path d={chart.fillPath} fill={mapInk("#fff", dark)} />
      {drawBorders ? chart.borders.map((border, index) => border.fillPath ? (
        <path key={`polity-${index}`} d={border.fillPath} fill={`url(#${stippleId(mapInk(border.color, dark))})`} stroke="none" />
      ) : null) : null}
      {chart.hexes.map((cell) => shaded.has(`${cell.labelX},${cell.labelY + HEX_FLAT_HALF}`) ? (
        <polygon key={`shade-${cell.label}-${cell.labelX}`} points={cell.points} fill="#c5dff6" style={{ fillOpacity: "0.4" }} />
      ) : null)}
      <path d={chart.gridPath} fill="none" stroke="#b0c7f8" strokeWidth={1} />
      {drawBorders ? chart.borders.map((border, index) => border.dash !== "none" && border.strokePath ? (
        <path
          key={`border-${index}`}
          d={border.strokePath}
          fill="none"
          stroke={mapInk(border.color, dark)}
          strokeWidth={BORDER_STROKE}
          strokeLinecap={border.dash === "dotted" ? "round" : "butt"}
          strokeLinejoin="round"
          strokeDasharray={borderDash(border.dash)}
        />
      ) : null) : null}
      {marked ? (
        <polygon points={hexOutline(marked.x, marked.y)} fill="none" stroke={SELECTED_HEX} strokeWidth={2.6} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
      ) : null}
      {chart.routePath ? <path d={chart.routePath} fill="none" stroke="#2f9e4f" strokeWidth={1.6} strokeLinecap="round" /> : null}
      {drawBorders ? chart.borders.map((border, index) => border.label ? (
        <text
          key={`label-${index}`}
          x={border.label.x}
          y={border.label.y}
          fill={mapInk(border.color, dark)}
          style={{ textAnchor: "middle", dominantBaseline: "central", fontSize: 14, fontWeight: 700 }}
        >
          {border.label.lines.map((line, lineIndex) => (
            <tspan key={lineIndex} x={border.label?.x} dy={lineIndex === 0 ? 0 : 16}>{line}</tspan>
          ))}
        </text>
      ) : null) : null}
      {chart.hexes.map((cell) => cell.numbered ? (
        <text
          key={`n-${cell.label}-${cell.labelX}`}
          x={cell.labelX}
          y={cell.labelY + GRID_STROKE / 2}
          style={{ textAnchor: "middle", dominantBaseline: "text-before-edge", fontSize: 10 }}
          fill="#9a9a9a"
        >
          {cell.label}
        </text>
      ) : null)}
      {chart.worlds.map((world) => (
        <WorldIcon key={`${world.sector}|${world.hex}|${world.x}`} world={world} dark={dark} />
      ))}
    </>
  );
}

/** Chart centered on a world, filling the space beside the world profile. Dragging moves the view. The scroll wheel zooms. A click selects a world. */
export function ExploreMap({ worldX, worldY, focus, keep, minTech, minStarport, tradeCodes, drawBorders, dark, zoomMin, zoomMax, restore = null, chartHex = null, onView, onSelect, selected = null }: {
  worldX: number;
  worldY: number;
  /** Bumps when a search selection should center the map, including a repeat of the same world. */
  focus: number;
  keep: readonly string[];
  /** When set, the world must be at this tech level or higher. */
  minTech: number | null;
  /** When set, the world must have this starport or a better one. A is best and E is worst. */
  minStarport: string | null;
  /** When any are set, the world must have at least one of them. */
  tradeCodes: readonly string[];
  /** Polity fill, border stroke, and label. */
  drawBorders: boolean;
  /** White and black trade places. Other colors stay. */
  dark: boolean;
  /** Magnification floor. Omitted values use the package default. */
  zoomMin?: number;
  /** Magnification ceiling. Omitted values use the package default. */
  zoomMax?: number;
  /** Zoom and pan to open with. Omitted values center on the world at zoom 1. */
  restore?: { zoom: number; x: number; y: number } | null;
  /** Hex chosen for the first chart. Omitted values use the camera, then this world. */
  chartHex?: { worldX: number; worldY: number } | null;
  /** Called when the zoom or pan settles. */
  onView?: (view: { zoom: number; x: number; y: number }) => void;
  onSelect: (sector: string, hex: string) => void;
  /** When set, that world's hex border is drawn yellow. */
  selected?: { sector: string; hex: string } | null;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const keepRef = useRef(keep);
  keepRef.current = keep;
  const [view, setView] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(() => clampExploreZoom(restore?.zoom ?? 1, zoomMin, zoomMax));
  const [camera, setCamera] = useState(() => restore ? { x: restore.x, y: restore.y } : hexPixel(worldX, worldY));
  const [disk, setDisk] = useState<LoadedDisk | null>(() => openingDisk(worldX, worldY, restore, chartHex));
  const cameraRef = useRef(camera);
  const publishedRef = useRef(camera);
  const viewRef = useRef(view);
  const zoomRef = useRef(zoom);
  const boundsRef = useRef(exploreZoomBounds(zoomMin, zoomMax));
  const diskRef = useRef(disk);
  viewRef.current = view;
  zoomRef.current = zoom;
  boundsRef.current = exploreZoomBounds(zoomMin, zoomMax);
  diskRef.current = disk;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  useEffect(() => {
    onViewRef.current?.({ zoom, x: camera.x, y: camera.y });
  }, [zoom, camera.x, camera.y]);

  useEffect(() => {
    const bounds = boundsRef.current;
    const nextZoom = clampExploreZoom(zoomRef.current, bounds.min, bounds.max);
    if (nextZoom === zoomRef.current) return;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, [zoomMin, zoomMax]);

  useEffect(() => {
    return () => {
      void releaseExploreSectors(keepRef.current);
    };
  }, []);

  const opened = useRef(false);
  useEffect(() => {
    // The first camera already matches the world, or a restored pan. Later focus changes recenter.
    if (!opened.current) {
      opened.current = true;
      return;
    }
    const next = hexPixel(worldX, worldY);
    cameraRef.current = next;
    publishedRef.current = next;
    const size = viewRef.current;
    const mag = zoomRef.current;
    const worldW = size.width / mag;
    const worldH = size.height / mag;
    const svg = svgRef.current;
    if (svg && worldW > 0 && worldH > 0) {
      svg.setAttribute("viewBox", `${next.x - worldW / 2} ${next.y - worldH / 2} ${worldW} ${worldH}`);
    }
    setCamera(next);
  }, [worldX, worldY, focus]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      const width = Math.round(node.clientWidth);
      const height = Math.round(node.clientHeight);
      // A host can detach the map while switching scenes. That reports 0×0.
      // Keep the last real size so the view comes back as it was.
      if (width === 0 && height === 0) return;
      setView((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      const size = viewRef.current;
      if (size.width < 40 || size.height < 40) return;
      event.preventDefault();
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * size.height : event.deltaY;
      const bounds = boundsRef.current;
      const nextZoom = clampExploreZoom(zoomRef.current * Math.exp(-dy * 0.0015), bounds.min, bounds.max);
      if (nextZoom === zoomRef.current) return;
      const rect = (svgRef.current ?? node).getBoundingClientRect();
      const mag = zoomRef.current;
      const worldW = size.width / mag;
      const worldH = size.height / mag;
      const cam = cameraRef.current;
      const px = (event.clientX - rect.left) / (rect.width || size.width);
      const py = (event.clientY - rect.top) / (rect.height || size.height);
      const pointedX = cam.x + (px - 0.5) * worldW;
      const pointedY = cam.y + (py - 0.5) * worldH;
      const nextW = size.width / nextZoom;
      const nextH = size.height / nextZoom;
      const nextCam = { x: pointedX - (px - 0.5) * nextW, y: pointedY - (py - 0.5) * nextH };
      zoomRef.current = nextZoom;
      cameraRef.current = nextCam;
      svgRef.current?.setAttribute("viewBox", `${nextCam.x - nextW / 2} ${nextCam.y - nextH / 2} ${nextW} ${nextH}`);
      setZoom(nextZoom);
      setCamera(nextCam);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const center = worldNearPixel(camera.x, camera.y);
  const measured = view.width >= 40 && view.height >= 40;
  const worldWidth = measured ? view.width / zoom : 0;
  const worldHeight = measured ? view.height / zoom : 0;
  const radius = measured ? chartRadiusForView(worldWidth, worldHeight) : 0;
  const span = measured ? viewportParsecs(worldWidth, worldHeight) : 0;
  const covered = disk !== null && chartCovers(disk.centerX, disk.centerY, disk.radius, center.x, center.y, span);
  const holdExtra = zoom < 1;

  useEffect(() => {
    if (radius < 1 || covered) return;
    const prepared = peekExploreChart(center.x, center.y);
    if (prepared && chartCovers(prepared.centerX, prepared.centerY, prepared.radius, center.x, center.y, span)) {
      setDisk(prepared);
      return;
    }
    const controller = new AbortController();
    const hereX = center.x;
    const hereY = center.y;
    const handle = setTimeout(() => {
      loadExploreChart(hereX, hereY, radius, keepRef.current, controller.signal, holdExtra)
        .then((chart) => {
          if (!controller.signal.aborted) setDisk({ centerX: hereX, centerY: hereY, radius, chart });
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [covered, radius, center.x, center.y, holdExtra]);

  /** Move the view box while a drag is in progress. A drag that leaves the loaded chart publishes the camera. */
  function showCamera(next: { x: number; y: number }) {
    cameraRef.current = next;
    const size = viewRef.current;
    const mag = zoomRef.current;
    const worldW = size.width / mag;
    const worldH = size.height / mag;
    const svg = svgRef.current;
    if (svg && worldW > 0 && worldH > 0) {
      svg.setAttribute("viewBox", `${next.x - worldW / 2} ${next.y - worldH / 2} ${worldW} ${worldH}`);
    }
    const here = worldNearPixel(next.x, next.y);
    const published = worldNearPixel(publishedRef.current.x, publishedRef.current.y);
    if (here.x === published.x && here.y === published.y) return;
    if (worldW < 1 || worldH < 1) return;
    const loaded = diskRef.current;
    const viewSpan = viewportParsecs(worldW, worldH);
    if (loaded && chartCovers(loaded.centerX, loaded.centerY, loaded.radius, here.x, here.y, viewSpan)) return;
    publishedRef.current = next;
    setCamera(next);
  }

  /** Map coordinates under the pointer, or null when the chart cannot map the event. */
  function pointerPoint(event: PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }

  const live = cameraRef.current;
  const extentW = view.width > 0 ? view.width / zoom : 0;
  const extentH = view.height > 0 ? view.height / zoom : 0;
  const viewBox = extentW > 0 && extentH > 0
    ? `${live.x - extentW / 2} ${live.y - extentH / 2} ${extentW} ${extentH}`
    : undefined;

  return (
    <div className={dark ? "explore-map-frame dark" : "explore-map-frame"} ref={frame}>
      {viewBox && disk ? (
        <svg
          ref={svgRef}
          className="explore-map"
          viewBox={viewBox}
          role="application"
          aria-label="Explore map"
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Capture needs a live pointer. Moves over the map still scroll it.
            }
            const origin = cameraRef.current;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camX: origin.x, camY: origin.y, moved: false };
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.id !== event.pointerId) return;
            const dx = event.clientX - current.x;
            const dy = event.clientY - current.y;
            if (dx * dx + dy * dy > 16) current.moved = true;
            if (!current.moved) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const size = viewRef.current;
            const mag = zoomRef.current;
            const worldW = size.width / mag;
            const worldH = size.height / mag;
            const scaleX = worldW / (rect.width || size.width);
            const scaleY = worldH / (rect.height || size.height);
            showCamera({ x: current.camX - dx * scaleX, y: current.camY - dy * scaleY });
          }}
          onPointerUp={(event) => {
            const current = drag.current;
            drag.current = null;
            if (!current || current.id !== event.pointerId) return;
            if (current.moved) {
              const resting = cameraRef.current;
              publishedRef.current = resting;
              setCamera(resting);
              return;
            }
            const local = pointerPoint(event);
            const worlds = diskRef.current?.chart.worlds;
            if (!local || !worlds) return;
            const hit = worlds.find((world) => {
              if (!world.sector || !world.hex) return false;
              const dx = world.x - local.x;
              const dy = world.y - local.y;
              return dx * dx + dy * dy <= HEX_FLAT_HALF * HEX_FLAT_HALF;
            });
            if (hit) onSelect(hit.sector, hit.hex);
          }}
        >
          <ExploreChartBody chart={disk.chart} minTech={minTech} minStarport={minStarport} tradeCodes={tradeCodes} drawBorders={drawBorders} dark={dark} selected={selected} />
        </svg>
      ) : null}
    </div>
  );
}
