import { useEffect, useRef, useState } from "../runtime.ts";
import { chartProfile, HEX_FLAT_HALF, hexOutline, type ChartWorld, type JumpChartView } from "../jumpChart.ts";
import { mapInk } from "../mapInk.ts";
import { loadJumpChart, peekJumpChart } from "../travellerMap.ts";
import type { WorldProfile as Profile } from "../worldProfile.ts";
import { WorldProfile } from "./WorldProfile.tsx";

/** Grid stroke is centered on the hex edge, so half of it lies inside the hex. */
const GRID_STROKE = 1;
/** Yellow used for the selected world's hex. */
const SELECTED_HEX = "#f5c400";
/** Scout way station uses the scout triangle in this red. */
const WAY_STATION = "#d23b2f";
/** Scale the world mark around the hex center so it clears the number and the name. */
const ICON_SCALE = 0.65;
/** Starport letter sits this far above the hex center. The drawn glyph reaches STARPORT_REACH from the center. */
const STARPORT_OFFSET = 8;
/** How far the starport glyph extends from the hex center. */
const STARPORT_REACH = 19;
/** Clearance between the starport glyph and the inner edge of the zone ring. */
const ZONE_GAP = 4;

/** A red zone is drawn heavier than an amber zone. */
function zoneStroke(zone: ChartWorld["zone"]): number {
  return zone === "red" ? 2.4 : 1.3;
}

/** Red or amber for the zone ring. */
function zoneColor(zone: ChartWorld["zone"]): string {
  return zone === "red" ? "#d23b2f" : "#e09a12";
}

/** Radius whose inner edge clears the top of the starport letter. */
function zoneRadius(zone: ChartWorld["zone"]): number {
  return STARPORT_REACH + ZONE_GAP + zoneStroke(zone) / 2;
}

/** Outer radius of the naval-base star. */
const STAR_OUTER = 5.2;
/** Inner radius of the naval-base star. */
const STAR_INNER = 2.2;
/** Space between the zone ring and a base symbol sitting inside it. */
const MARKER_GAP = 1.5;
/** Farthest point of the scout triangle */
const SCOUT_EXTENT = Math.hypot(4.2, 3.1);
/** Scout triangle  */
const SCOUT_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0, -6.1],
  [4.2, 3.1],
  [-4.2, 3.1],
];

/** Points of the naval-base star, around its own center. */
const STAR_OFFSETS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 10 }, (_, index) => {
  const radius = index % 2 === 0 ? STAR_OUTER : STAR_INNER;
  const angle = -Math.PI / 2 + index * Math.PI / 5;
  return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
});

/** The naval-base star, placed at a map point. */
function starPoints(cx: number, cy: number): string {
  return STAR_OFFSETS.map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(" ");
}

/** Inner edge of the zone ring. */
function ringInner(zone: ChartWorld["zone"]): number {
  return zoneRadius(zone) - zoneStroke(zone) / 2;
}

/** 45° to the left of straight up, or 45° to the left of straight down. */
function markerAt(x: number, y: number, radius: number, edge: "top" | "bottom"): { x: number; y: number } {
  const step = radius * Math.sin(Math.PI / 4);
  return {
    x: x - step,
    y: edge === "top" ? y - step : y + step,
  };
}

/** The scout-base triangle, placed at a map point. */
function scoutPoints(cx: number, cy: number): string {
  return SCOUT_SHAPE.map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(" ");
}

/** Starport, zone, bases, gas giants, and the world glyph for one hex. */
export function WorldIcon({ world, dark, onEnter, onLeave }: {
  world: ChartWorld;
  dark: boolean;
  onEnter?: (world: ChartWorld) => void;
  onLeave?: () => void;
}) {
  const ink = mapInk("#111", dark);
  const paper = mapInk("#fff", dark);
  const ring = world.zone === "green" ? null : (
    <circle cx={world.x} cy={world.y} r={zoneRadius(world.zone)} fill="none" stroke={zoneColor(world.zone)} strokeWidth={zoneStroke(world.zone)} />
  );
  const navalAt = markerAt(world.x, world.y, ringInner(world.zone) - STAR_OUTER - MARKER_GAP, "top");
  const scoutAt = markerAt(world.x, world.y, ringInner(world.zone) - SCOUT_EXTENT - MARKER_GAP, "bottom");
  const body = world.glyph === "asteroid"
    ? (
      <>
        <circle cx={world.x - 4} cy={world.y - 2} r={1.7} fill={ink} />
        <circle cx={world.x + 3} cy={world.y - 3} r={1.5} fill={ink} />
        <circle cx={world.x + 1} cy={world.y + 3} r={1.8} fill={ink} />
        <circle cx={world.x - 2} cy={world.y + 1} r={1.2} fill={ink} />
      </>
    )
    : world.glyph === "open"
    ? <circle cx={world.x} cy={world.y} r={5.2} fill={paper} stroke={ink} strokeWidth={1.6} />
    : <circle cx={world.x} cy={world.y} r={4.6} fill={ink} />;
  return (
    <g onMouseEnter={onEnter ? () => onEnter(world) : undefined} onMouseLeave={onLeave} style={{ cursor: "pointer" }}>
      <circle cx={world.x} cy={world.y} r={HEX_FLAT_HALF} fill="transparent" />
      {world.glyph === "unknown" ? (
        <text
          x={world.x}
          y={world.y}
          style={{ textAnchor: "middle", dominantBaseline: "central", fontSize: 16, fontWeight: 700 }}
          fill={ink}
        >
          ?
        </text>
      ) : null}
      <g transform={`translate(${world.x} ${world.y}) scale(${ICON_SCALE}) translate(${-world.x} ${-world.y})`}>
        {world.glyph === "unknown" ? null : ring}
        {world.glyph === "unknown" ? null : world.gasGiant ? <circle cx={world.x + 12} cy={world.y - 10} r={3.3} fill={paper} stroke={ink} strokeWidth={1.2} /> : null}
        {world.glyph === "unknown" ? null : world.naval ? <polygon points={starPoints(navalAt.x, navalAt.y)} fill={ink} /> : null}
        {world.glyph === "unknown" ? null : world.scout || world.wayStation ? (
          <polygon points={scoutPoints(scoutAt.x, scoutAt.y)} fill={world.wayStation ? WAY_STATION : ink} />
        ) : null}
        {world.glyph === "unknown" ? null : body}
        {world.starport ? (
          <text
            x={world.x}
            y={world.y - STARPORT_OFFSET}
            style={{ textAnchor: "middle", fontSize: 11, fontWeight: 700 }}
            fill={ink}
          >
            {world.starport}
          </text>
        ) : null}
      </g>
      <text
        x={world.x}
        y={world.y + HEX_FLAT_HALF - GRID_STROKE / 2}
        style={{ textAnchor: "middle", dominantBaseline: "text-after-edge", fontSize: 12 }}
        fill={ink}
      >
        {world.name}
      </text>
    </g>
  );
}

/** Jump chart centered on this world. */
export function JumpChartMap({ sector, hex, name, dark, outline = false }: {
  sector: string;
  hex: string;
  name: string;
  dark: boolean;
  /** When true, this world's hex border is yellow. */
  outline?: boolean;
}) {
  const id = `${sector}|${hex}`;
  const [loaded, setLoaded] = useState<{ id: string; chart: JumpChartView } | null>(() => {
    const cached = peekJumpChart(sector, hex);
    return cached ? { id, chart: cached } : null;
  });
  const [hover, setHover] = useState<Profile | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
    setHover(null);
    const cached = peekJumpChart(sector, hex);
    if (cached) {
      setLoaded({ id, chart: cached });
      return;
    }
    const controller = new AbortController();
    loadJumpChart(sector, hex, controller.signal)
      .then((chart) => {
        if (!controller.signal.aborted) setLoaded({ id, chart });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(null);
      });
    return () => controller.abort();
  }, [sector, hex, id]);

  const chart = loaded?.id === id ? loaded.chart : peekJumpChart(sector, hex);

  useEffect(() => () => {
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
  }, []);

  /** After a short hover, show the profile for this world. */
  function showProfile(world: ChartWorld) {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    hideTimer.current = null;
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      setHover(chartProfile(world));
    }, 250);
  }

  /** The pointer is on the profile, so the hover stays. */
  function holdProfile() {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  /** The pointer left. Hide the profile after a short pause. */
  function hideProfile() {
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    showTimer.current = null;
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setHover(null);
    }, 160);
  }

  if (!chart) return null;
  const marked = outline ? chart.worlds.find((world) => world.sector === sector && world.hex === hex) : undefined;
  return (
    <div className="jump-map-frame">
      {hover ? (
        <div className="hex-profile-pop" onMouseEnter={holdProfile} onMouseLeave={hideProfile}>
          <WorldProfile profile={hover} />
        </div>
      ) : null}
      <svg className={dark ? "jump-chart dark" : "jump-chart"} viewBox={chart.viewBox} preserveAspectRatio="xMidYMin meet" role="img" aria-label={`Hex map centered on ${name}`}>
      <path d={chart.fillPath} fill={mapInk("#fff", dark)} />
      <path d={chart.gridPath} fill="none" stroke="#b0c7f8" strokeWidth={1} />
      {marked ? (
        <polygon points={hexOutline(marked.x, marked.y)} fill="none" stroke={SELECTED_HEX} strokeWidth={2.6} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
      ) : null}
      {chart.routePath ? <path d={chart.routePath} fill="none" stroke="#2f9e4f" strokeWidth={1.6} strokeLinecap="round" /> : null}
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
        <WorldIcon key={`${world.name}-${world.x}`} world={world} dark={dark} onEnter={showProfile} onLeave={hideProfile} />
      ))}
      </svg>
    </div>
  );
}
