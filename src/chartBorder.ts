/**
 * Allegiance borders and route clipping for one chart.
 * Hex layout stays in jumpChart.ts. This file owns point-in-polygon cover,
 * the stylesheet paint, and the raster reused across charts of the same sector sheet.
 */
import { borderPaint, sectorStyle, type LineDash } from "./borderStyle.ts";
import {
  EDGE,
  HEX_FLAT_HALF,
  HEX_H,
  SIZE,
  hexPixel,
  neighbor,
  sectorGrid,
  vertices,
  worldPoint,
  type ChartBorder,
  type ChartLine,
  type Point,
  type SectorBorder,
  type SectorChartData
} from "./jumpChart.ts";

/** Even-odd point-in-polygon. Used to decide which hex centers a border fills. */
function contains(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses = (current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** True when the point sits on a polygon edge. A hex center on the stroke still counts as inside. */
function nearEdge(point: Point, polygon: Point[]): boolean {
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const dx = current.x - prior.x;
    const dy = current.y - prior.y;
    const length = dx * dx + dy * dy;
    const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - prior.x) * dx + (point.y - prior.y) * dy) / length));
    const px = prior.x + ratio * dx - point.x;
    const py = prior.y + ratio * dy - point.y;
    if (px * px + py * py < 1) return true;
  }
  return false;
}

/** Hexes whose centers lie inside the border outline, including the one-hex buffer past the sector. */
function borderCover(path: string, sectorX: number, sectorY: number): ((hex: Point) => boolean) | null {
  const hexes = path.trim().split(/\s+/).map((hex) => worldPoint(sectorX, sectorY, hex)).filter((point): point is Point => point !== null);
  if (hexes.length >= 2) {
    const first = hexes[0];
    const last = hexes[hexes.length - 1];
    if (first.x !== last.x || first.y !== last.y) hexes.push(first);
  }
  if (hexes.length < 4) return null;
  const polygon = hexes.map((hex) => hexPixel(hex.x, hex.y));
  const inside = new Map<string, boolean>();
  return (hex) => {
    const key = `${hex.x},${hex.y}`;
    const cached = inside.get(key);
    if (cached !== undefined) return cached;
    const pixel = hexPixel(hex.x, hex.y);
    const value = contains(pixel, polygon) || nearEdge(pixel, polygon);
    inside.set(key, value);
    return value;
  };
}

/** Closed SVG subpath for one hex, in chart pixels. */
function hexFill(hex: Point): string {
  const corners = vertices(hexPixel(hex.x, hex.y));
  return `M${corners.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("L")}Z`;
}

/** Label at the metadata hex, or the center of the path when that hex is omitted. */
function borderLabel(border: SectorBorder, sectorX: number, sectorY: number, names: Map<string, string>): ChartBorder["label"] {
  if (border.ShowLabel === false) return null;
  const text = border.Label?.trim() || (border.Allegiance ? names.get(border.Allegiance) ?? "" : "");
  if (!text) return null;
  const lines = border.WrapLabel ? text.replace(/\s+(?![a-z])/g, "\n").split("\n") : [text];
  let hex = border.LabelPosition?.trim() ?? "";
  if (!hex) {
    const cols: number[] = [];
    const rows: number[] = [];
    for (const token of (border.Path ?? "").trim().split(/\s+/)) {
      if (!/^\d{4}$/.test(token)) continue;
      cols.push(Number(token.slice(0, 2)));
      rows.push(Number(token.slice(2)));
    }
    if (cols.length === 0) return null;
    const col = Math.floor((Math.min(...cols) + Math.max(...cols) + 1) / 2);
    const row = Math.floor((Math.min(...rows) + Math.max(...rows) + 1) / 2);
    hex = `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
  }
  const world = worldPoint(sectorX, sectorY, hex);
  if (!world) return null;
  const pixel = hexPixel(world.x, world.y);
  return {
    x: pixel.x + (border.LabelOffsetX ?? 0) * 0.7 * SIZE,
    y: pixel.y - (border.LabelOffsetY ?? 0) * 0.7 * HEX_H,
    lines,
  };
}

/** Portion of the segment inside one convex hex, as parameters from 0 to 1. */
function clipToHex(from: Point, to: Point, polygon: Point[], center: Point): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    let nx = start.y - end.y;
    let ny = end.x - start.x;
    if (nx * (center.x - start.x) + ny * (center.y - start.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const dist = nx * (from.x - start.x) + ny * (from.y - start.y);
    const speed = nx * (to.x - from.x) + ny * (to.y - from.y);
    if (Math.abs(speed) <= 1e-8) {
      if (dist < -1e-8) return null;
      continue;
    }
    const hit = -dist / speed;
    if (speed < 0) t1 = Math.min(t1, hit);
    else t0 = Math.max(t0, hit);
    if (t0 > t1) return null;
  }
  if (t1 - t0 <= 1e-6) return null;
  return [t0, t1];
}

/** The piece of a route between two fractions of its length. */
function segment(from: Point, to: Point, t0: number, t1: number): ChartLine {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x1: from.x + t0 * dx,
    y1: from.y + t0 * dy,
    x2: from.x + t1 * dx,
    y2: from.y + t1 * dy,
  };
}

interface PlacedHex {
  center: Point;
  polygon: Point[];
}

/** Keep the parts of a jump route that lie inside the drawn hexes. */
export function clipRoute(from: Point, to: Point, hexes: PlacedHex[]): ChartLine[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const intervals: Array<[number, number]> = [];
  for (const hex of hexes) {
    if (hex.center.x + SIZE < minX || hex.center.x - SIZE > maxX) continue;
    if (hex.center.y + HEX_FLAT_HALF < minY || hex.center.y - HEX_FLAT_HALF > maxY) continue;
    const span = clipToHex(from, to, hex.polygon, hex.center);
    if (span) intervals.push(span);
  }
  intervals.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const span of intervals) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged.map(([t0, t1]) => segment(from, to, t0, t1));
}

/** One SVG path for a list of segments. */
function linesPath(lines: ChartLine[]): string {
  let path = "";
  for (const line of lines) path += `M${line.x1} ${line.y1}L${line.x2} ${line.y2}`;
  return path;
}

interface PolityRaster {
  allegiance: string;
  members: Set<string>;
  fills: Map<string, string>;
  edges: { inside: string; outside: string; line: ChartLine }[];
  color: string;
  dash: LineDash;
  label: ChartBorder["label"];
}

/** Border geometry for a sector sheet. Dropping the sheet drops the raster. */
const allegianceRasters = new WeakMap<SectorChartData, PolityRaster[]>();

/** Map key for a world hex. The same text is used by the chart window. */
function hexKey(hex: Point): string {
  return `${hex.x},${hex.y}`;
}

/** World-coordinate box of a border path, grown by one hex so an edge hex still counts. */
function pathBounds(path: string, sectorX: number, sectorY: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const token of path.trim().split(/\s+/)) {
    const hex = worldPoint(sectorX, sectorY, token);
    if (!hex) continue;
    minX = Math.min(minX, hex.x);
    minY = Math.min(minY, hex.y);
    maxX = Math.max(maxX, hex.x);
    maxY = Math.max(maxY, hex.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX: minX - 1, minY: minY - 1, maxX: maxX + 1, maxY: maxY + 1 };
}

/** Membership, fill, and stroke for one sector. Later charts reuse this instead of tracing the outlines again. */
function rasterizeSector(sector: SectorChartData): PolityRaster[] {
  const cached = allegianceRasters.get(sector);
  if (cached) return cached;
  const style = sectorStyle(sector.stylesheet);
  const names = new Map((sector.allegiances ?? []).map((row) => [row.code, row.name]));
  const rasters: PolityRaster[] = [];
  for (const border of sector.borders ?? []) {
    if (!border.Path) continue;
    const cover = borderCover(border.Path, sector.x, sector.y);
    if (!cover) continue;
    // Only hexes of this sector, and only inside the outline's box. The rest of the sector is not tested.
    const members = new Set<string>();
    const fills = new Map<string, string>();
    const bounds = pathBounds(border.Path, sector.x, sector.y);
    if (bounds) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
          const grid = sectorGrid(x, y);
          if (grid.x !== sector.x || grid.y !== sector.y) continue;
          const hex = { x, y };
          if (!cover(hex)) continue;
          const key = hexKey(hex);
          members.add(key);
          fills.set(key, hexFill(hex));
        }
      }
    }
    // An edge is stored from the member side. The shared edge with a neighbor is drawn once.
    const edges: PolityRaster["edges"] = [];
    const seen = new Set<string>();
    for (const key of members) {
      const [xText, yText] = key.split(",");
      const hex = { x: Number(xText), y: Number(yText) };
      for (let direction = 0; direction < 6; direction += 1) {
        const next = neighbor(hex.x, hex.y, direction);
        const outside = hexKey(next);
        if (members.has(outside)) continue;
        const edge = EDGE[direction];
        const corners = vertices(hexPixel(hex.x, hex.y));
        const start = corners[edge];
        const end = corners[(edge + 1) % 6];
        const id = [start.x, start.y, end.x, end.y].map((value) => value.toFixed(1)).sort().join(":");
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ inside: key, outside, line: { x1: start.x, y1: start.y, x2: end.x, y2: end.y } });
      }
    }
    const paint = borderPaint(border, style);
    rasters.push({
      allegiance: border.Allegiance?.trim() ?? "",
      members,
      fills,
      edges,
      color: paint.color,
      dash: paint.dash,
      label: borderLabel(border, sector.x, sector.y, names),
    });
  }
  allegianceRasters.set(sector, rasters);
  return rasters;
}

/** Keep the fills and strokes that meet this window. A shared allegiance drops the edge between its sectors. */
export function bordersInWindow(sectors: readonly SectorChartData[], present: Set<string>): ChartBorder[] {
  const rasters = sectors.flatMap((sector) => rasterizeSector(sector));
  const borders: ChartBorder[] = [];
  for (const region of rasters) {
    const samePolity = (key: string) => region.allegiance !== "" && rasters.some((other) =>
      other !== region && other.allegiance === region.allegiance && other.members.has(key)
    );
    let fillPath = "";
    const lines: ChartLine[] = [];
    // Fills stay inside the window. An edge is kept when either end is visible and the neighbor is a different polity.
    for (const key of region.members) {
      if (!present.has(key)) continue;
      fillPath += region.fills.get(key) ?? "";
    }
    for (const edge of region.edges) {
      if (!present.has(edge.inside) && !present.has(edge.outside)) continue;
      if (samePolity(edge.outside)) continue;
      lines.push(edge.line);
    }
    if (!fillPath && lines.length === 0) continue;
    borders.push({
      fillPath,
      strokePath: linesPath(lines),
      color: region.color,
      dash: region.dash,
      label: region.label,
    });
  }
  return borders;
}
