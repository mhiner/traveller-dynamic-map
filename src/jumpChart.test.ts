import { assertEquals } from "@std/assert";
import { buildJumpChart, chartCovers, chartOpenHex, chartProfile, chartRadiusForView, clampExploreZoom, HEX_FLAT_HALF, hexesWithin, hexOutline, hexPixel, nearbySectorGrids, sectorGrid, sectorHex, viewportParsecs, worldNearPixel } from "./jumpChart.ts";

Deno.test("jump chart", async (test) => {
  await test.step("covers every hex out to four parsecs", () => {
    assertEquals(hexesWithin(0, 0, 0).length, 1);
    assertEquals(hexesWithin(0, 0, 1).length, 7);
    assertEquals(hexesWithin(-109, -44, 4).length, 61);
  });

  await test.step("outlines the six corners of one hex", () => {
    const pixel = hexPixel(0, 0);
    assertEquals(hexOutline(pixel.x, pixel.y).split(" ").length, 6);
  });

  await test.step("reads a sector hex from world coordinates", () => {
    assertEquals(sectorHex(-109, -44), "2036");
    assertEquals(sectorHex(-110, -46), "1934");
  });

  await test.step("opens the first chart on the camera, then the centered world, then the live world", () => {
    const pixel = hexPixel(-108, -68);
    assertEquals(chartOpenHex({
      cameraX: pixel.x,
      cameraY: pixel.y,
      centerX: -110,
      centerY: -70,
      centerSector: "Spinward Marches",
      liveX: 1,
      liveY: 2,
      liveSector: "Other",
    }), { worldX: -108, worldY: -68, sector: "Spinward Marches" });
    assertEquals(chartOpenHex({
      cameraX: null,
      cameraY: null,
      centerX: -110,
      centerY: -70,
      centerSector: "Spinward Marches",
      liveX: 1,
      liveY: 2,
    }), { worldX: -110, worldY: -70, sector: "Spinward Marches" });
    assertEquals(chartOpenHex({
      cameraX: null,
      cameraY: null,
      centerX: null,
      centerY: null,
      liveX: 4,
      liveY: 5,
      liveSector: "Foreven",
    }), { worldX: 4, worldY: 5, sector: "Foreven" });
    assertEquals(chartOpenHex({
      cameraX: null,
      cameraY: null,
      centerX: null,
      centerY: null,
      liveX: null,
      liveY: null,
    }), null);
  });

  await test.step("finds the hex under a chart pixel and covers a square view", () => {
    const pixel = hexPixel(-109, -44);
    assertEquals(worldNearPixel(pixel.x, pixel.y), { x: -109, y: -44 });
    assertEquals(worldNearPixel(pixel.x + 5, pixel.y - 4), { x: -109, y: -44 });
    assertEquals(chartRadiusForView(HEX_FLAT_HALF * 2 * 8) > 4, true);
    assertEquals(chartRadiusForView(400, 800) > chartRadiusForView(400), true);
    const span = viewportParsecs(400, 800);
    assertEquals(chartRadiusForView(400, 800), Math.max(4, span + 3));
    assertEquals(chartCovers(0, 0, span + 3, 0, 0, span), true);
    assertEquals(chartCovers(0, 0, span + 3, 3, 0, span), true);
    assertEquals(chartCovers(0, 0, span + 3, 4, 0, span), false);
    assertEquals(clampExploreZoom(1), 1);
    assertEquals(clampExploreZoom(3), 3);
    assertEquals(clampExploreZoom(4), 3);
    assertEquals(clampExploreZoom(0.5), 0.5);
    assertEquals(clampExploreZoom(0.25), 0.5);
    assertEquals(clampExploreZoom(Number.NaN), 1);
    assertEquals(clampExploreZoom(1, 1.25, 2.5), 1.25);
    assertEquals(clampExploreZoom(4, 1.25, 2.5), 2.5);
    assertEquals(clampExploreZoom(2, 1.25, 2.5), 2);
    assertEquals(clampExploreZoom(Number.NaN, 2, 4), 2);
    assertEquals(clampExploreZoom(2, 4, 1), 2);
    assertEquals(clampExploreZoom(0.1, 0, 3), 0.5);
  });

  await test.step("names sectors within six parsecs of the center world", () => {
    assertEquals(sectorGrid(-109, -44), { x: -4, y: -1 });
    assertEquals(nearbySectorGrids(-109, -44), [{ x: -4, y: 0 }]);
    assertEquals(nearbySectorGrids(-110, -70), []);
    assertEquals(nearbySectorGrids(-101, -60), [{ x: -3, y: -1 }]);
    assertEquals(nearbySectorGrids(-102, -60), [{ x: -3, y: -1 }]);
    assertEquals(nearbySectorGrids(-103, -60), []);
    assertEquals(nearbySectorGrids(-97, -40), [{ x: -4, y: 0 }, { x: -3, y: -1 }, { x: -3, y: 0 }]);
  });

  await test.step("stacks flat-top hexes in vertical columns", () => {
    const origin = hexPixel(0, 0);
    const east = hexPixel(1, 0);
    const below = hexPixel(0, 1);
    assertEquals(below.x, origin.x);
    assertEquals(below.y > origin.y, true);
    assertEquals((east.y - origin.y).toFixed(4), ((below.y - origin.y) / 2).toFixed(4));
    assertEquals((east.x - origin.x).toFixed(4), ((below.y - origin.y) * Math.sqrt(3) / 2).toFixed(4));
    const negative = hexPixel(-110, -46);
    const negativeEast = hexPixel(-109, -46);
    assertEquals((negativeEast.x - negative.x).toFixed(4), (east.x - origin.x).toFixed(4));
    assertEquals((negativeEast.y - negative.y).toFixed(4), (east.y - origin.y).toFixed(4));
    const chart = buildJumpChart({ centerX: 0, centerY: 0, worlds: [], sectors: [], radius: 0 });
    const [topLeft, topRight] = chart.hexes[0].points.split(" ");
    assertEquals(topLeft.split(",")[1], topRight.split(",")[1]);
    assertEquals(chart.hexes[0].labelX, 0);
    assertEquals(chart.hexes[0].labelY.toFixed(1), topLeft.split(",")[1]);
    assertEquals(chart.grid.length, 6);
  });

  await test.step("draws starports, water, belts, bases, and gas giants from the UWP", () => {
    const chart = buildJumpChart({
      centerX: -109,
      centerY: -44,
      worlds: [
        { Name: "Glisten", Hex: "2036", UWP: "A000986-F", PBG: "811", Bases: "NS", Sector: "Spinward Marches", WorldX: -109, WorldY: -44 },
        { Name: "Pixie", Hex: "1903", UWP: "A100103-D", PBG: "100", Bases: "W", Sector: "Spinward Marches", WorldX: -109, WorldY: -43 },
        { Name: "Binges", Hex: "1635", UWP: "A500231-A", PBG: "720", Bases: "", Sector: "Spinward Marches", WorldX: -113, WorldY: -45 },
        { Name: "Weiss", Hex: "1934", UWP: "A626464-B", PBG: "703", Zone: "A", Sector: "Spinward Marches", WorldX: -110, WorldY: -46 },
        { Name: "Blank", Hex: "2136", UWP: "???????-?", PBG: "123", Bases: "N", Zone: "A", Remarks: "Ag", Allegiance: "ImDd", AllegianceName: "Third Imperium", SubsectorName: "Regina", Sector: "Foreven", WorldX: -108, WorldY: -44 },
        { Name: "", Hex: "2236", UWP: "???????-?", Sector: "Foreven", WorldX: -107, WorldY: -44 },
      ],
      sectors: [{
        x: -4,
        y: -1,
        routes: [
          { Start: "2036", End: "2336" },
          { Start: "0101", End: "0132" },
        ],
        borders: [],
      }],
    });
    const glisten = chart.worlds.find((world) => world.name === "Glisten");
    const binges = chart.worlds.find((world) => world.name === "Binges");
    const weiss = chart.worlds.find((world) => world.name === "Weiss");
    assertEquals(glisten?.sector, "Spinward Marches");
    assertEquals(glisten?.hex, "2036");
    assertEquals(glisten?.glyph, "asteroid");
    assertEquals(glisten?.starport, "A");
    assertEquals(glisten?.naval, true);
    assertEquals(glisten?.scout, true);
    assertEquals(glisten?.wayStation, false);
    const pixie = chart.worlds.find((world) => world.name === "Pixie");
    assertEquals(pixie?.scout, false);
    assertEquals(pixie?.wayStation, true);
    assertEquals(glisten?.gasGiant, true);
    assertEquals(glisten?.uwp, "A000986-F");
    assertEquals(glisten?.tradeCodes, []);
    assertEquals(chartProfile(glisten!)?.rows[0]?.meaning, "Excellent");
    assertEquals(chartProfile(weiss!)?.zone, "amber");
    assertEquals(binges?.glyph, "open");
    assertEquals(binges?.gasGiant, false);
    assertEquals(weiss?.glyph, "filled");
    assertEquals(weiss?.zone, "amber");
    const blank = chart.worlds.find((world) => world.name === "Blank");
    assertEquals(blank?.glyph, "unknown");
    assertEquals(blank?.starport, "");
    assertEquals(blank?.gasGiant, false);
    assertEquals(blank?.naval, false);
    assertEquals(blank?.zone, "green");
    assertEquals(blank?.tradeCodes, []);
    const blankProfile = chartProfile(blank!);
    assertEquals(blankProfile?.subsector, "Unknown");
    assertEquals(blankProfile?.allegiance, "Unknown");
    assertEquals(blankProfile?.zoneLabel, "Unknown");
    assertEquals(blankProfile?.zoneDetail, "Unknown");
    assertEquals(blankProfile?.population, null);
    assertEquals(blankProfile?.gasGiants, "Unknown");
    assertEquals(blankProfile?.bases, "Unknown");
    assertEquals(blankProfile?.tradeCodes, []);
    assertEquals(blankProfile?.rows.every((row) => row.code === "?" && row.meaning === "Unknown"), true);
    assertEquals(chart.worlds.some((world) => world.hex === "2236" && world.name === "" && world.glyph === "unknown"), true);
    assertEquals(chart.routes.length, 1);
    const route = chart.routes[0];
    const glistenAt = hexPixel(-109, -44);
    const bendorAt = hexPixel(-106, -44);
    assertEquals(route.x1.toFixed(1), glistenAt.x.toFixed(1));
    assertEquals(route.y1.toFixed(1), glistenAt.y.toFixed(1));
    assertEquals(route.x2.toFixed(1), bendorAt.x.toFixed(1));
    assertEquals(route.y2.toFixed(1), bendorAt.y.toFixed(1));
    assertEquals(chart.hexes.length, 61);
  });

  await test.step("stops a jump route on the outer hex edge", () => {
    const chart = buildJumpChart({
      centerX: -109,
      centerY: -44,
      worlds: [],
      sectors: [{
        x: -4,
        y: -1,
        routes: [{ Start: "2036", End: "2030" }],
      }],
    });
    assertEquals(chart.routes.length, 1);
    const route = chart.routes[0];
    const inside = hexPixel(-109, -44);
    const rim = hexPixel(-109, -48);
    assertEquals(route.x1.toFixed(2), inside.x.toFixed(2));
    assertEquals(route.y1.toFixed(2), inside.y.toFixed(2));
    assertEquals(route.x2.toFixed(2), inside.x.toFixed(2));
    assertEquals(route.y2.toFixed(2), (rim.y - HEX_FLAT_HALF).toFixed(2));
  });

  await test.step("traces the outer edges of an allegiance outline", () => {
    const chart = buildJumpChart({
      centerX: 10,
      centerY: 20,
      worlds: [],
      sectors: [{
        x: 0,
        y: 1,
        borders: [{ Path: "1220 1121 1020 1019 1119 1219 1220" }],
      }],
      radius: 2,
    });
    assertEquals(chart.borders.length, 1);
    assertEquals(chart.borders[0].strokePath.match(/M/g)?.length, 18);
    assertEquals(chart.borders[0].fillPath.length > 0, true);
    assertEquals(chart.borders[0].color, "#000000");
    assertEquals(chart.borders[0].label, null);
  });

  await test.step("paints borders from the element, the sector stylesheet, and the OTU colors", () => {
    const path = "1220 1121 1020 1019 1119 1219 1220";
    const chart = buildJumpChart({
      centerX: 10,
      centerY: 20,
      worlds: [],
      sectors: [{
        x: 0,
        y: 1,
        stylesheet: "border.DaCf { color: lightblue; style: dashed; }\nborder.ImDd { color: pink; }",
        allegiances: [{ code: "DaCf", name: "Darrian Confederation" }],
        borders: [
          { Path: path, Allegiance: "DaCf", WrapLabel: true, LabelPosition: "1120" },
          { Path: path, Allegiance: "ImDd", Color: "Purple", Style: "dotted", ShowLabel: false, Label: "Third Imperium" },
          { Path: path, Allegiance: "ZhIN" },
        ],
      }],
      radius: 2,
    });
    assertEquals(chart.borders[0].color, "#add8e6");
    assertEquals(chart.borders[0].dash, "dashed");
    assertEquals(chart.borders[0].label?.lines, ["Darrian", "Confederation"]);
    assertEquals(chart.borders[1].color, "#800080");
    assertEquals(chart.borders[1].dash, "dotted");
    assertEquals(chart.borders[1].label, null);
    assertEquals(chart.borders[2].color, "#0000ff");
    assertEquals(chart.borders[2].dash, "solid");
  });

  await test.step("omits the sector edge where the same polity continues", () => {
    const left = "2918 3019 3118 3219 3318 3319 3320 3321 3322 3223 3122 3023 2922 2918";
    const right = "0018 0019 0020 0021 0022 0123 0222 0323 0322 0321 0320 0319 0318 0219 0118 0018";
    const shared = sharedEdge(31, 20);
    const same = borderChart(left, "Im", right, "Im");
    const other = borderChart(left, "Im", right, "Va");
    assertEquals(same.borders.length, 2);
    assertEquals(same.borders.every((border) => border.fillPath.length > 0), true);
    assertEquals(same.borders.some((border) => border.strokePath.includes(shared[0]) || border.strokePath.includes(shared[1])), false);
    assertEquals(other.borders.some((border) => border.strokePath.includes(shared[0]) || border.strokePath.includes(shared[1])), true);
  });
});

function borderChart(left: string, leftCode: string, right: string, rightCode: string) {
  return buildJumpChart({
    centerX: 31,
    centerY: 20,
    worlds: [],
    radius: 5,
    sectors: [
      { x: 0, y: 1, borders: [{ Path: left, Allegiance: leftCode }] },
      { x: 1, y: 1, borders: [{ Path: right, Allegiance: rightCode }] },
    ],
  });
}

/** East edge of an odd column, in both directions the stroke path may record it. */
function sharedEdge(worldX: number, worldY: number): [string, string] {
  const center = hexPixel(worldX, worldY);
  const size = (hexPixel(1, 0).x - hexPixel(0, 0).x) / 1.5;
  const right = { x: center.x + size, y: center.y };
  const bottomRight = { x: center.x + size / 2, y: center.y + HEX_FLAT_HALF };
  return [
    `M${right.x} ${right.y}L${bottomRight.x} ${bottomRight.y}`,
    `M${bottomRight.x} ${bottomRight.y}L${right.x} ${right.y}`,
  ];
}
