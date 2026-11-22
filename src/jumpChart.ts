import type { LineDash } from "./borderStyle.ts";
import { bordersInWindow, clipRoute } from "./chartBorder.ts";
import { hexDistance } from "./hex.ts";
import type { Zone } from "./world.ts";
import { parseZone, tradeCodesFromRemarks } from "./codes.ts";
import { isUnknownUwp, worldProfile, type WorldProfile } from "./worldProfile.ts";

/** Flat-top hex. SIZE is center-to-vertex; columns step by 1.5 SIZE and odd columns drop half a row. */
export const SIZE = 36;
/** Pixel height of one flat-top hex. */
export const HEX_H = SIZE * Math.sqrt(3);
/** Distance from the hex center to the top or bottom face. */
export const HEX_FLAT_HALF = HEX_H / 2;

export interface ChartWorldRecord {
  Name?: string;
  Hex?: string;
  UWP?: string;
  PBG?: string;
  Zone?: string;
  Bases?: string;
  Allegiance?: string;
  AllegianceName?: string;
  Remarks?: string;
  Sector?: string;
  SubsectorName?: string;
  WorldX?: number;
  WorldY?: number;
  /** Surveyed trade codes. When set, the chart uses these instead of scanning remarks. */
  TradeCodes?: readonly string[];
}

export interface SectorRoute {
  Start: string;
  End: string;
  StartOffsetX?: number;
  StartOffsetY?: number;
  EndOffsetX?: number;
  EndOffsetY?: number;
}

export interface SectorBorder {
  Path?: string;
  Allegiance?: string;
  Color?: string;
  Style?: string;
  Label?: string;
  ShowLabel?: boolean;
  WrapLabel?: boolean;
  LabelPosition?: string;
  LabelOffsetX?: number;
  LabelOffsetY?: number;
}

export interface SectorAllegiance {
  code: string;
  name: string;
}

export interface SectorChartData {
  x: number;
  y: number;
  routes?: SectorRoute[];
  borders?: SectorBorder[];
  /** Traveller Map stylesheet. Sector rules override the OTU border colors. */
  stylesheet?: string;
  allegiances?: SectorAllegiance[];
}

export interface ChartHex {
  points: string;
  label: string;
  labelX: number;
  labelY: number;
  numbered: boolean;
}

export interface ChartLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ChartBorder {
  /** Hexes inside the polity, one subpath per hex. */
  fillPath: string;
  /** Hex edges between the polity and its neighbors. */
  strokePath: string;
  color: string;
  dash: LineDash;
  label: { x: number; y: number; lines: string[] } | null;
}

export interface ChartWorld {
  name: string;
  sector: string;
  hex: string;
  starport: string;
  glyph: "filled" | "open" | "asteroid" | "unknown";
  gasGiant: boolean;
  naval: boolean;
  scout: boolean;
  /** Scout way station. The scout triangle is drawn in red. */
  wayStation: boolean;
  zone: Zone;
  x: number;
  y: number;
  /** Universal World Profile text. The tech filter reads the digit after the hyphen. */
  uwp: string;
  tradeCodes: readonly string[];
  /** Fields for a profile. The profile is built when this world is selected or hovered. */
  source: ChartWorldRecord;
}

/** The astrogation profile for one chart world. The map does not build this while it draws. */
export function chartProfile(world: ChartWorld): WorldProfile | null {
  return worldProfile(world.source);
}

export interface JumpChartView {
  viewBox: string;
  minX: number;
  minY: number;
  width: number;
  height: number;
  hexes: ChartHex[];
  grid: ChartLine[];
  routes: ChartLine[];
  borders: ChartBorder[];
  worlds: ChartWorld[];
  /** White hex interiors, one subpath. */
  fillPath: string;
  /** Shared hex edges, one subpath per edge. */
  gridPath: string;
  /** Jump routes clipped to the hexes, one subpath per segment. */
  routePath: string;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Screen position for an odd-q world coordinate.
 * Columns are vertical, odd columns sit half a hex lower, and each hex has a flat top.
 */
export function hexPixel(worldX: number, worldY: number): Point {
  return {
    x: SIZE * 1.5 * worldX,
    y: HEX_H * (worldY + ((worldX & 1) ? 0.5 : 0)),
  };
}

/** Hex whose center is nearest this chart pixel. */
export function worldNearPixel(px: number, py: number): { x: number; y: number } {
  const approxX = Math.round(px / (SIZE * 1.5));
  let best = { x: approxX, y: Math.round(py / HEX_H) };
  let bestDistance = Infinity;
  for (let x = approxX - 1; x <= approxX + 1; x += 1) {
    const approxY = Math.round(py / HEX_H - ((x & 1) ? 0.5 : 0));
    for (let y = approxY - 1; y <= approxY + 1; y += 1) {
      const pixel = hexPixel(x, y);
      const distance = (pixel.x - px) ** 2 + (pixel.y - py) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return best;
}

export interface ChartOpenInput {
  cameraX: number | null;
  cameraY: number | null;
  centerX: number | null;
  centerY: number | null;
  centerSector?: string;
  liveX: number | null;
  liveY: number | null;
  liveSector?: string;
}

/**
 * Hex the first chart is built around.
 * A saved camera wins, then the centered world, then a live world that already has coordinates.
 */
export function chartOpenHex(input: ChartOpenInput): { worldX: number; worldY: number; sector: string } | null {
  if (input.cameraX !== null && input.cameraY !== null && Number.isFinite(input.cameraX) && Number.isFinite(input.cameraY)) {
    const at = worldNearPixel(input.cameraX, input.cameraY);
    return { worldX: at.x, worldY: at.y, sector: input.centerSector ?? "" };
  }
  if (input.centerX !== null && input.centerY !== null && Number.isFinite(input.centerX) && Number.isFinite(input.centerY)) {
    return { worldX: input.centerX, worldY: input.centerY, sector: input.centerSector ?? "" };
  }
  if (input.liveX !== null && input.liveY !== null && Number.isFinite(input.liveX) && Number.isFinite(input.liveY)) {
    return { worldX: input.liveX, worldY: input.liveY, sector: input.liveSector ?? "" };
  }
  return null;
}

/** Extra parsecs beyond the viewport so a drag can move before the next load. */
export const CHART_PAN_MARGIN = 3;

/** Parsecs from the center hex to the corner of a viewport. */
export function viewportParsecs(width: number, height = width): number {
  return Math.ceil(Math.hypot(width / 2, height / 2) / HEX_H);
}

/** Parsecs from the center hex that cover a viewport, plus a margin for dragging. */
export function chartRadiusForView(width: number, height = width): number {
  return Math.max(4, viewportParsecs(width, height) + CHART_PAN_MARGIN);
}

/** Magnification of the explore map. 1 is the frame at one world pixel per screen pixel. */
export const EXPLORE_ZOOM_MIN = 0.5;
/** Default explore-map zoom ceiling. A host can set another. */
export const EXPLORE_ZOOM_MAX = 3;

/** Positive limits with min at or below max. An unusable pair falls back to the defaults. */
export function exploreZoomBounds(min = EXPLORE_ZOOM_MIN, max = EXPLORE_ZOOM_MAX): { min: number; max: number } {
  const low = Number.isFinite(min) && min > 0 ? min : EXPLORE_ZOOM_MIN;
  const high = Number.isFinite(max) && max > 0 ? max : EXPLORE_ZOOM_MAX;
  if (low > high) return { min: EXPLORE_ZOOM_MIN, max: EXPLORE_ZOOM_MAX };
  return { min: low, max: high };
}

/** Zoom kept inside the explore limits. A non-finite value starts at 1. */
export function clampExploreZoom(zoom: number, min = EXPLORE_ZOOM_MIN, max = EXPLORE_ZOOM_MAX): number {
  const bounds = exploreZoomBounds(min, max);
  const value = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/** The viewport around the camera still lies inside a chart of `loadedRadius`. */
export function chartCovers(
  loadedX: number,
  loadedY: number,
  loadedRadius: number,
  cameraX: number,
  cameraY: number,
  viewportRadius: number,
): boolean {
  return hexDistance(loadedX, loadedY, cameraX, cameraY) + viewportRadius <= loadedRadius;
}

/** Four-digit hex inside its sector. Column and row are 1-based. */
export function sectorHex(worldX: number, worldY: number): string {
  const grid = sectorGrid(worldX, worldY);
  const col = worldX - grid.x * 32 + 1;
  const row = worldY - (grid.y - 1) * 40;
  return `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
}

/** Sector grid position. X and Y match Traveller Map sector metadata. */
export function sectorGrid(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: Math.floor(worldX / 32),
    y: Math.floor((worldY - 1) / 40) + 1,
  };
}

/** Other sectors that have a hex within `parsecs` of this world. */
export function nearbySectorGrids(worldX: number, worldY: number, parsecs = 6): { x: number; y: number }[] {
  const home = sectorGrid(worldX, worldY);
  const found: { x: number; y: number }[] = [];
  for (const hex of hexesWithin(worldX, worldY, parsecs)) {
    const grid = sectorGrid(hex.x, hex.y);
    if (grid.x === home.x && grid.y === home.y) continue;
    if (found.some((row) => row.x === grid.x && row.y === grid.y)) continue;
    found.push(grid);
  }
  return found;
}

/** Odd-q offset from cube-style axial coordinates. Odd columns sit half a row lower. */
function axialToOffset(q: number, r: number): Point {
  return { x: q, y: r + Math.floor(q / 2) };
}

/** Axial coordinates from an odd-q world hex. Used so a radius is a true hex disk. */
function offsetToAxial(worldX: number, worldY: number): Point {
  return { x: worldX, y: worldY - Math.floor(worldX / 2) };
}

/** Every hex within `radius` parsecs, including the center. The disk matches hex distance. */
export function hexesWithin(centerX: number, centerY: number, radius: number): Point[] {
  const center = offsetToAxial(centerX, centerY);
  const hexes: Point[] = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      const ds = -dq - dr;
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) > radius) continue;
      const offset = axialToOffset(center.x + dq, center.y + dr);
      hexes.push(offset);
    }
  }
  return hexes;
}

/** Top-left, top-right, right, bottom-right, bottom-left, left. */
export function vertices(center: Point): Point[] {
  const halfH = HEX_H / 2;
  return [
    { x: center.x - SIZE / 2, y: center.y - halfH },
    { x: center.x + SIZE / 2, y: center.y - halfH },
    { x: center.x + SIZE, y: center.y },
    { x: center.x + SIZE / 2, y: center.y + halfH },
    { x: center.x - SIZE / 2, y: center.y + halfH },
    { x: center.x - SIZE, y: center.y },
  ];
}

/** Polygon points for the hex whose center is this chart pixel. */
export function hexOutline(centerX: number, centerY: number): string {
  return vertices({ x: centerX, y: centerY }).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

/** Neighbor deltas for even, then odd, columns. Order: E, NE, NW, W, SW, SE. */
const NEIGHBORS = [
  [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]],
  [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]],
];

/** Edge shared with that neighbor. Vertex order starts at the top-left corner. */
export const EDGE = [2, 1, 0, 5, 4, 3];

/** The hex in one of the six directions. Odd and even columns use different deltas. */
export function neighbor(worldX: number, worldY: number, direction: number): Point {
  const delta = NEIGHBORS[worldX & 1][direction];
  return { x: worldX + delta[0], y: worldY + delta[1] };
}

/** World coordinates for a sector hex. Offsets place a route endpoint in a neighboring sector. */
export function worldPoint(sectorX: number, sectorY: number, hex: string, offsetX = 0, offsetY = 0): Point | null {
  if (!/^\d{4}$/.test(hex)) return null;
  const col = Number(hex.slice(0, 2));
  const row = Number(hex.slice(2));
  // One hex outside the sector is the buffer Traveller Map uses to close a border.
  if (col < 0 || col > 33 || row < 0 || row > 41) return null;
  return {
    x: (sectorX + offsetX) * 32 + col - 1,
    y: (sectorY + offsetY - 1) * 40 + row,
  };
}

/** One ehex digit. `?` and anything that is not a digit are unknown. */
function ehex(char: string | undefined): number | null {
  if (!char || char === "?") return null;
  const value = Number.parseInt(char, 16);
  return Number.isNaN(value) ? null : value;
}

/** World mark from the UWP. Size 0 is an asteroid belt, hydrographics 0 is an open circle, otherwise filled. */
function glyphFor(uwp: string): ChartWorld["glyph"] | null {
  if (isUnknownUwp(uwp)) return "unknown";
  const match = /^[A-HX?]([0-9A-F?])[0-9A-F?]([0-9A-F?])/i.exec(uwp.trim());
  if (!match || match[1] === "?") return null;
  if (match[1].toUpperCase() === "0") return "asteroid";
  if (match[2] === "0") return "open";
  return "filled";
}

/** Starport letter drawn beside the glyph. X and an unknown port draw nothing. */
function starportLetter(uwp: string): string {
  const letter = uwp.trim()[0]?.toUpperCase() ?? "";
  return /[A-H]/.test(letter) ? letter : "";
}

/** Directed boundary of the hex cluster, or null when the edges do not form one loop. */
function traceOutline(cells: Point[]): Point[] | null {
  const present = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const next = new Map<string, string>();
  const at = new Map<string, Point>();
  const keyOf = (point: Point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  let first = "";
  for (const cell of cells) {
    const corners = vertices(hexPixel(cell.x, cell.y));
    for (let direction = 0; direction < 6; direction += 1) {
      const step = neighbor(cell.x, cell.y, direction);
      if (present.has(`${step.x},${step.y}`)) continue;
      const edge = EDGE[direction];
      const startKey = keyOf(corners[edge]);
      const endKey = keyOf(corners[(edge + 1) % 6]);
      if (next.has(startKey)) return null;
      next.set(startKey, endKey);
      at.set(startKey, corners[edge]);
      if (!first) first = startKey;
    }
  }
  if (!first) return null;
  const polygon: Point[] = [];
  let key = first;
  do {
    const point = at.get(key);
    const step = next.get(key);
    if (!point || !step) return null;
    polygon.push(point);
    key = step;
  } while (key !== first && polygon.length <= next.size);
  if (key !== first || polygon.length !== next.size) return null;
  return polygon;
}


/** Identity of a hex edge shared by two cells, so the grid draws it once. */
function edgeKey(worldX: number, worldY: number, direction: number): string {
  const next = neighbor(worldX, worldY, direction);
  if (worldX < next.x || (worldX === next.x && worldY <= next.y)) return `${worldX},${worldY},${direction}`;
  return `${next.x},${next.y},${(direction + 3) % 6}`;
}

/** Each grid edge once, so shared sides stay a single stroke. */
function gridLines(cells: Point[]): ChartLine[] {
  const lines: ChartLine[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const corners = vertices(hexPixel(cell.x, cell.y));
    for (let direction = 0; direction < 6; direction += 1) {
      const key = edgeKey(cell.x, cell.y, direction);
      if (seen.has(key)) continue;
      seen.add(key);
      const edge = EDGE[direction];
      const start = corners[edge];
      const end = corners[(edge + 1) % 6];
      lines.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    }
  }
  return lines;
}

/** One SVG path for a list of segments. */
function linesPath(lines: ChartLine[]): string {
  let path = "";
  for (const line of lines) path += `M${line.x1} ${line.y1}L${line.x2} ${line.y2}`;
  return path;
}


/** Atlas-style jump chart: hexes, routes, allegiance borders, and world icons. */
export function buildJumpChart(input: {
  centerX: number;
  centerY: number;
  worlds: readonly ChartWorldRecord[];
  sectors: readonly SectorChartData[];
  radius?: number;
}): JumpChartView {
  const radius = input.radius ?? 4;
  // The window is a hex disk. Glyphs, routes, and borders are clipped to these cells.
  const cells = hexesWithin(input.centerX, input.centerY, radius);
  const present = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const placedHexes = cells.map((cell) => {
    const center = hexPixel(cell.x, cell.y);
    return { center, polygon: vertices(center) };
  });
  const rim = traceOutline(cells);
  const placed = new Map<string, ChartWorld>();
  for (const record of input.worlds) {
    if (typeof record.WorldX !== "number" || typeof record.WorldY !== "number") continue;
    if (hexDistance(input.centerX, input.centerY, record.WorldX, record.WorldY) > radius) continue;
    const uwp = record.UWP ?? "";
    const glyph = glyphFor(uwp);
    const name = record.Name?.trim() ?? "";
    if (!glyph || (!name && glyph !== "unknown")) continue;
    const pixel = hexPixel(record.WorldX, record.WorldY);
    // Naval, scout, and way station come from base letters. Gas giants are the third PBG digit.
    const bases = (record.Bases ?? "").toUpperCase();
    const giants = ehex((record.PBG ?? "")[2]);
    const unknown = glyph === "unknown";
    placed.set(`${record.WorldX},${record.WorldY}`, {
      name,
      sector: record.Sector?.trim() ?? "",
      hex: record.Hex?.trim() ?? "",
      starport: unknown ? "" : starportLetter(uwp),
      glyph,
      gasGiant: !unknown && giants !== null && giants > 0,
      naval: !unknown && bases.includes("N"),
      scout: !unknown && bases.includes("S"),
      wayStation: !unknown && bases.includes("W"),
      zone: unknown ? "green" : parseZone(record.Zone),
      x: pixel.x,
      y: pixel.y,
      uwp: uwp.toUpperCase(),
      tradeCodes: unknown ? [] : record.TradeCodes ? [...record.TradeCodes] : tradeCodesFromRemarks(record.Remarks ?? ""),
      source: record,
    });
  }
  const occupied = new Set<string>();
  for (const world of placed.values()) occupied.add(`${world.x},${world.y}`);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const hexes: ChartHex[] = placedHexes.map((hex, index) => {
    const cell = cells[index];
    for (const corner of hex.polygon) {
      if (corner.x < minX) minX = corner.x;
      if (corner.y < minY) minY = corner.y;
      if (corner.x > maxX) maxX = corner.x;
      if (corner.y > maxY) maxY = corner.y;
    }
    return {
      points: hex.polygon.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      label: sectorHex(cell.x, cell.y),
      labelX: hex.center.x,
      labelY: hex.center.y - HEX_H / 2,
      numbered: occupied.has(`${hex.center.x},${hex.center.y}`),
    };
  });
  const routes: ChartLine[] = [];
  for (const sector of input.sectors) {
    for (const route of sector.routes ?? []) {
      const start = worldPoint(sector.x, sector.y, route.Start, route.StartOffsetX ?? 0, route.StartOffsetY ?? 0);
      const end = worldPoint(sector.x, sector.y, route.End, route.EndOffsetX ?? 0, route.EndOffsetY ?? 0);
      if (!start || !end) continue;
      const startNear = present.has(`${start.x},${start.y}`);
      const endNear = present.has(`${end.x},${end.y}`);
      if (!startNear && !endNear) continue;
      const from = hexPixel(start.x, start.y);
      const to = hexPixel(end.x, end.y);
      routes.push(...clipRoute(from, to, placedHexes));
    }
  }
  const borders = bordersInWindow(input.sectors, present);
  minX -= 18;
  minY -= 18;
  maxX += 18;
  maxY += 22;
  const grid = gridLines(cells);
  const fillPath = rim
    ? `M${rim.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("L")}Z`
    : hexes.map((hex) => `M${hex.points}Z`).join("");
  return {
    viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`,
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
    hexes,
    grid,
    routes,
    borders,
    worlds: [...placed.values()],
    fillPath,
    gridPath: linesPath(grid),
    routePath: linesPath(routes),
  };
}
