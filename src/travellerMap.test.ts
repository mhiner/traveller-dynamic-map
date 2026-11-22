import { assertEquals } from "@std/assert";
import { memorySectorCache } from "./cache.ts";
import { hexDistance } from "./hex.ts";
import { buildJumpChart } from "./jumpChart.ts";
import { routeSectorGrids } from "./mapRoute.ts";
import { mapSession } from "./session.ts";
import { dropChartMemory, forgetExploreChart, parseRoute, peekExploreChart, rememberExploreChart, remoteRouteAllowed, replaceCachedWorld, searchCoordinates, withinSearchRange } from "./travellerMap.ts";
import { SECTOR_CACHE_KEY, type CachedWorld } from "./worldCache.ts";
import { forgetWorldIndex, worldCatalog } from "./worldStore.ts";

Deno.test("world search", async (test) => {
  await test.step("keeps worlds within 160 parsecs of the current location", () => {
    const origin = searchCoordinates(-4, -1, 20, 36);
    if (!origin) throw new Error("Glisten coordinates");
    const edge = { name: "edge", worldX: origin.worldX, worldY: origin.worldY + 160 };
    const past = { name: "past", worldX: origin.worldX, worldY: origin.worldY + 161 };
    const unplaced = { name: "unplaced", worldX: null, worldY: null };
    assertEquals(hexDistance(origin.worldX, origin.worldY, edge.worldX, edge.worldY), 160);
    assertEquals(hexDistance(origin.worldX, origin.worldY, past.worldX, past.worldY), 161);
    assertEquals(withinSearchRange(origin.worldX, origin.worldY, [edge, past, unplaced]).map((hit) => hit.name), ["edge"]);
  });

  await test.step("asks Traveller Map only when cached sectors have no route inside 160 parsecs", () => {
    assertEquals(remoteRouteAllowed(false, 160, 2), true);
    assertEquals(remoteRouteAllowed(false, 161, 2), false);
    assertEquals(remoteRouteAllowed(true, 40, 2), false);
    assertEquals(remoteRouteAllowed(false, null, 2), false);
    assertEquals(remoteRouteAllowed(false, 12, 0), false);
  });
});

Deno.test("prepared explore chart", async (test) => {
  await test.step("returns the chart only for the world it was built around", () => {
    const chart = buildJumpChart({ centerX: 1, centerY: 2, worlds: [], sectors: [] });
    rememberExploreChart(1.2, 2.4, 12, chart);
    assertEquals(peekExploreChart(1, 2)?.radius, 12);
    assertEquals(peekExploreChart(1, 2)?.chart, chart);
    assertEquals(peekExploreChart(3, 2), null);
    forgetExploreChart();
    assertEquals(peekExploreChart(1, 2), null);
  });

  await test.step("drops the prepared chart with the other chart memory", () => {
    const chart = buildJumpChart({ centerX: 0, centerY: 0, worlds: [], sectors: [] });
    rememberExploreChart(0, 0, 12, chart);
    dropChartMemory();
    assertEquals(peekExploreChart(0, 0), null);
  });
});

Deno.test("jump route", async (test) => {
  await test.step("reads each stop and the parsecs between them", () => {
    const stops = parseRoute([
      {
        Name: "Regina",
        Sector: "Spinward Marches",
        Subsector: "Regina",
        Hex: "1910",
        UWP: "A788899-C",
        Zone: "",
        AllegianceName: "Third Imperium, Domain of Deneb",
        PBG: "703",
        SectorX: -4,
        SectorY: -1,
        HexX: 19,
        HexY: 10,
      },
      {
        Name: "Jenghe",
        Sector: "Spinward Marches",
        Subsector: "Regina",
        Hex: "1810",
        UWP: "c799663-9",
        Zone: "A",
        AllegianceName: "Third Imperium, Domain of Deneb",
        PBG: "323",
        SectorX: -4,
        SectorY: -1,
        HexX: 18,
        HexY: 10,
      },
    ]);
    assertEquals(stops.map((stop) => stop.name), ["Regina", "Jenghe"]);
    assertEquals(stops[1]?.uwp, "C799663-9");
    assertEquals(stops[0]?.zone, "green");
    assertEquals(stops[1]?.zone, "amber");
    assertEquals(hexDistance(stops[0]!.worldX!, stops[0]!.worldY!, stops[1]!.worldX!, stops[1]!.worldY!), 1);
  });
});

Deno.test("route sectors", async (test) => {
  await test.step("opens the sectors on the line and the sectors that touch them", () => {
    const here = routeSectorGrids(-110, -70, -110, -70).map((grid) => `${grid.x},${grid.y}`);
    assertEquals(here.includes("-4,-1"), true);
    assertEquals(here.includes("-5,-2"), true);
    assertEquals(here.includes("-3,0"), true);
    assertEquals(here.includes("5,5"), false);
    assertEquals(here.length, 9);
    const far = new Set(routeSectorGrids(-110, -70, 0, -39).map((grid) => `${grid.x},${grid.y}`));
    assertEquals(far.has("-4,-1"), true);
    assertEquals(far.has("0,0"), true);
    assertEquals(far.has("8,8"), false);
    assertEquals(far.size < 40, true);
  });
});

Deno.test("revised world", async (test) => {
  function world(name: string, hex: string, worldX: number, worldY: number, uwp: string): CachedWorld {
    return {
      id: `Spinward Marches|${hex}`,
      name,
      sector: "Spinward Marches",
      hex,
      uwp,
      tradeCodes: ["Ri"],
      zone: "green",
      worldX,
      worldY,
      manual: false,
      remarks: "Ri",
      pbg: "703",
      bases: "N",
      allegiance: "ImDd",
      allegianceName: "Third Imperium",
      subsector: "Regina",
    };
  }

  await test.step("replaces one cached world and drops only a chart that shows that hex", async () => {
    const regina = world("Regina", "1910", -110, -70, "A788899-C");
    const jewell = world("Jewell", "1106", -118, -94, "A777999-C");
    const previous = mapSession.current;
    mapSession.current = {
      cache: memorySectorCache({
        [SECTOR_CACHE_KEY]: { limit: 6, sectors: [{ name: "Spinward Marches", cachedAt: 1 }] },
        [regina.id]: regina,
        [jewell.id]: jewell,
      }),
      source: { get: () => Promise.reject(new Error("unused")) as Promise<{ ok: boolean; status: number; text: string }> },
      sectors: null,
      confirm: () => false,
      listeners: { setLocation: new Set(), setDestination: new Set() },
    };
    forgetWorldIndex();
    try {
      const onRegina = buildJumpChart({
        centerX: -110,
        centerY: -70,
        radius: 1,
        sectors: [],
        worlds: [{ Name: "Regina", Sector: "Spinward Marches", Hex: "1910", UWP: "A788899-C", WorldX: -110, WorldY: -70 }],
      });
      rememberExploreChart(-110, -70, 1, onRegina);
      await replaceCachedWorld({ ...regina, uwp: "A788899-D", tradeCodes: ["Ri", "Cp"] });
      assertEquals(peekExploreChart(-110, -70), null);
      const catalog = await worldCatalog();
      assertEquals(catalog.bySectorHex.get(regina.id)?.world.uwp, "A788899-D");
      assertEquals(catalog.bySectorHex.get(regina.id)?.world.tradeCodes, ["Ri", "Cp"]);
      assertEquals(catalog.bySectorHex.get(jewell.id)?.world.uwp, "A777999-C");
      const elsewhere = buildJumpChart({
        centerX: -118,
        centerY: -94,
        radius: 1,
        sectors: [],
        worlds: [{ Name: "Jewell", Sector: "Spinward Marches", Hex: "1106", UWP: "A777999-C", WorldX: -118, WorldY: -94 }],
      });
      rememberExploreChart(-118, -94, 1, elsewhere);
      await replaceCachedWorld({ ...regina, uwp: "A788899-E" });
      assertEquals(peekExploreChart(-118, -94)?.chart, elsewhere);
      assertEquals((await worldCatalog()).bySectorHex.get(regina.id)?.world.uwp, "A788899-E");
    } finally {
      forgetExploreChart();
      forgetWorldIndex();
      mapSession.current = previous;
    }
  });
});
