import { assertEquals } from "@std/assert";
import { HEX_FLAT_HALF, type JumpChartView } from "../jumpChart.ts";
import { placedShips, shipMarkPlacement } from "./shipMark.ts";

Deno.test("ship marks", async (test) => {
  await test.step("sits down and right of the hex center", () => {
    const mark = shipMarkPlacement();
    assertEquals(mark.dx > 0, true);
    assertEquals(mark.dy > 0, true);
    assertEquals(mark.width > mark.height, true);
  });

  await test.step("keeps a ship on a drawn hex and drops one outside it", () => {
    const chart = {
      hexes: [{ points: "", label: "1910", labelX: 0, labelY: -HEX_FLAT_HALF, numbered: true }],
      worlds: [],
    } as unknown as JumpChartView;
    const marks = placedShips(chart, [
      { sector: "Spinward Marches", hex: "1910", worldX: 0, worldY: 0, count: 2 },
      { sector: "Spinward Marches", hex: "1911", worldX: 2, worldY: 0, count: 1 },
    ]);
    assertEquals(marks.map((mark) => mark.key), ["Spinward Marches|1910"]);
    assertEquals(marks[0]?.count, 2);
  });
});
