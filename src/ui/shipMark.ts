import { HEX_FLAT_HALF, hexPixel, SIZE, type JumpChartView } from "../jumpChart.ts";

/** One blueprint-ship mark. Several ships on a hex share a count. */
export interface ChartShip {
  sector: string;
  hex: string;
  worldX: number | null;
  worldY: number | null;
  count: number;
}

/** A mark whose hex is on this chart, in chart pixels. */
export interface PlacedShip {
  key: string;
  x: number;
  y: number;
  count: number;
}

/**
 * Placement tuned on a diagram hex of this radius, then scaled onto SIZE.
 * The hull is 1.98 times the first fit, shifted 5px down-left from straight up, then 10px right.
 */
const TUNED_RADIUS = 52;
const FIRST_WIDTH = 24;
/** Content box of ship_image.svg after the white field is removed, height over width. */
const IMAGE_HEIGHT_RATIO = 1163 / 2543;
const HULL_SCALE = 1.98;

/** Offset of the ship drawing from a hex center, and the unrotated image size, in chart pixels. */
export function shipMarkPlacement(): { dx: number; dy: number; width: number; height: number } {
  const unit = SIZE / TUNED_RADIUS;
  const firstW = FIRST_WIDTH;
  const firstH = FIRST_WIDTH * IMAGE_HEIGHT_RATIO;
  const firstX = 20;
  const firstY = 18;
  const turn = (120 * Math.PI) / 180;
  const turnCos = Math.cos(turn);
  const turnSin = Math.sin(turn);
  const bottomX = firstX + (firstW / 2) * turnCos + (firstH / 2) * turnSin;
  const bottomY = firstY + (firstW / 2) * turnSin - (firstH / 2) * turnCos;
  const placedX = HULL_SCALE * firstX + (1 - HULL_SCALE) * bottomX;
  const placedY = HULL_SCALE * firstY + (1 - HULL_SCALE) * bottomY;
  const nudge = (5 * Math.SQRT2) / 2;
  return {
    dx: (placedX - nudge + 10) * unit,
    dy: (placedY + nudge) * unit,
    width: firstW * HULL_SCALE * unit,
    height: firstH * HULL_SCALE * unit,
  };
}

/** Ships whose hex is drawn on this chart. A missing coordinate uses a world glyph already on the chart. */
export function placedShips(chart: JumpChartView, ships: readonly ChartShip[]): PlacedShip[] {
  const centers = chart.hexes.map((cell) => ({ x: cell.labelX, y: cell.labelY + HEX_FLAT_HALF }));
  const placed: PlacedShip[] = [];
  for (const ship of ships) {
    if (!(ship.count > 0) || !ship.sector || !ship.hex) continue;
    const at = shipPoint(chart, ship);
    if (!at || !centers.some((center) => Math.abs(center.x - at.x) < 1 && Math.abs(center.y - at.y) < 1)) continue;
    placed.push({ key: `${ship.sector}|${ship.hex}`, x: at.x, y: at.y, count: ship.count });
  }
  return placed;
}

function shipPoint(chart: JumpChartView, ship: ChartShip): { x: number; y: number } | null {
  if (ship.worldX !== null && ship.worldY !== null && Number.isFinite(ship.worldX) && Number.isFinite(ship.worldY)) {
    return hexPixel(ship.worldX, ship.worldY);
  }
  const world = chart.worlds.find((row) => row.sector === ship.sector && row.hex === ship.hex);
  return world ? { x: world.x, y: world.y } : null;
}
