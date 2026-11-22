/**
 * Parsecs between Traveller Map world-space coordinates.
 * The map is an odd-q hex grid: odd columns sit half a hex lower.
 */
export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
  const toCube = (x: number, y: number): [number, number, number] => {
    const q = x;
    const r = y - (x - (x & 1)) / 2;
    return [q, r, -q - r];
  };
  const a = toCube(ax, ay);
  const b = toCube(bx, by);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
