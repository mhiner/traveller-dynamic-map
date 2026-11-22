import { assertEquals } from "@std/assert";
import { admitSector, findJumpRoute, holdExtraSector, resizeSectorCache, sectorCacheKeys, sectorCacheLimit, sectorLoadPlan, sectorTabText, sectorWorldCounts, sectorsInUse, withoutSectors, worldCoordinates, worldsFromTab, type SectorCacheMeta } from "./worldCache.ts";

const empty: SectorCacheMeta = { limit: 6, sectors: [] };

function stored(names: string[], limit = 6): SectorCacheMeta {
  return {
    limit,
    sectors: names.map((name, index) => ({ name, cachedAt: index + 1 })),
  };
}

Deno.test("world cache", async (test) => {
  await test.step("keeps a configured sector count and uses six when the stored value is missing", () => {
    assertEquals(sectorCacheLimit(4), 4);
    assertEquals(sectorCacheLimit(6), 6);
    assertEquals(sectorCacheLimit(8), 8);
    assertEquals(sectorCacheLimit(Number.NaN), 6);
    assertEquals(sectorCacheLimit(0), 1);
  });

  await test.step("stores a sector until six are cached", () => {
    const first = admitSector(empty, "Spinward Marches", new Set(), 1);
    assertEquals(first.status, "ready");
    if (first.status !== "ready") return;
    assertEquals(first.meta.sectors.map((row) => row.name), ["Spinward Marches"]);
    const full = ["A", "B", "C", "D", "E", "F"].reduce((meta, name, index) => {
      const next = admitSector(meta, name, new Set(), index + 1);
      if (next.status !== "ready") throw new Error(next.status);
      return next.meta;
    }, empty);
    assertEquals(full.sectors.map((row) => row.name), ["A", "B", "C", "D", "E", "F"]);
    assertEquals(full.limit, 6);
  });

  await test.step("drops the oldest sector that has no ship when a seventh sector is added", () => {
    const next = admitSector(stored(["A", "B", "C", "D", "E", "F"]), "G", new Set(["E", "F"]), 10);
    assertEquals(next.status, "ready");
    if (next.status !== "ready") return;
    assertEquals(next.evict, ["A"]);
    assertEquals(next.meta.sectors.map((row) => row.name), ["B", "C", "D", "E", "F", "G"]);
  });

  await test.step("holds a sector past the limit without changing the limit", () => {
    const full = stored(["A", "B", "C", "D", "E", "F"]);
    const held = holdExtraSector(full, "G", 20);
    assertEquals(held.limit, 6);
    assertEquals(held.sectors.map((row) => row.name), ["A", "B", "C", "D", "E", "F", "G"]);
    assertEquals(holdExtraSector(held, "G", 21), held);
  });

  await test.step("asks before growing the cache when every stored sector has a ship", () => {
    const next = admitSector(stored(["A", "B", "C", "D", "E", "F"]), "G", new Set(["A", "B", "C", "D", "E", "F"]), 10);
    assertEquals(next, { status: "needs-permission", limit: 6, sector: "G" });
  });

  await test.step("grows the limit by one after permission", () => {
    const next = admitSector(stored(["A", "B", "C", "D", "E", "F"]), "G", new Set(["A", "B", "C", "D", "E", "F"]), 10, true);
    assertEquals(next.status, "ready");
    if (next.status !== "ready") return;
    assertEquals(next.evict, []);
    assertEquals(next.meta.limit, 7);
    assertEquals(next.meta.sectors.map((row) => row.name), ["A", "B", "C", "D", "E", "F", "G"]);
  });

  await test.step("on startup clears a cache that is not a sector list and keeps the current sector", () => {
    const plan = sectorLoadPlan(null, "Spinward Marches", 5);
    assertEquals(plan.clear, true);
    assertEquals(plan.evict, []);
    assertEquals(plan.meta, { limit: 6, sectors: [{ name: "Spinward Marches", cachedAt: 5 }] });
  });

  await test.step("on startup refreshes a sector that is already stored", () => {
    const plan = sectorLoadPlan(stored(["A", "B"]), "A", 20);
    assertEquals(plan.clear, false);
    assertEquals(plan.evict, []);
    assertEquals(plan.meta.sectors.map((row) => row.name), ["A", "B"]);
    assertEquals(plan.meta.sectors[0]?.cachedAt, 20);
  });

  await test.step("on startup adds the current sector when the list has room", () => {
    const plan = sectorLoadPlan({ limit: 5, sectors: stored(["A", "B", "C", "D"]).sectors }, "E", 9);
    assertEquals(plan.clear, false);
    assertEquals(plan.evict, []);
    assertEquals(plan.meta.limit, 5);
    assertEquals(plan.meta.sectors.map((row) => row.name), ["A", "B", "C", "D", "E"]);
  });

  await test.step("on startup drops the oldest sector when the current sector is new and the list is full", () => {
    const plan = sectorLoadPlan(stored(["A", "B", "C", "D", "E", "F"]), "G", 10);
    assertEquals(plan.clear, false);
    assertEquals(plan.evict, ["A"]);
    assertEquals(plan.meta.sectors.map((row) => row.name), ["B", "C", "D", "E", "F", "G"]);
  });

  await test.step("leaves a sector that is already cached", () => {
    const meta = stored(["A"]);
    const next = admitSector(meta, "A", new Set(), 99);
    assertEquals(next.status, "ready");
    if (next.status !== "ready") return;
    assertEquals(next.meta, meta);
    assertEquals(next.evict, []);
  });

  await test.step("keeps a higher sector count without dropping sectors", () => {
    const next = resizeSectorCache(stored(["A", "B"]), 6);
    assertEquals(next.evict, []);
    assertEquals(next.meta.limit, 6);
    assertEquals(next.meta.sectors.map((row) => row.name), ["A", "B"]);
  });

  await test.step("drops the oldest unoccupied sector when the count is lowered", () => {
    const next = resizeSectorCache(stored(["A", "B", "C", "D"]), 2, new Set(["A"]));
    assertEquals(next.evict, ["B", "C"]);
    assertEquals(next.meta.limit, 2);
    assertEquals(next.meta.sectors.map((row) => row.name), ["A", "D"]);
  });

  await test.step("drops an occupied sector only after every other sector is gone", () => {
    const next = resizeSectorCache(stored(["A", "B"]), 1, new Set(["A", "B"]));
    assertEquals(next.evict, ["A"]);
    assertEquals(next.meta.sectors.map((row) => row.name), ["B"]);
  });

  await test.step("drops named sectors and the worlds stored under them", () => {
    const meta = stored(["Spinward Marches", "Trojan Reach", "Deneb"]);
    assertEquals(withoutSectors(meta, ["Trojan Reach"]).sectors.map((row) => row.name), ["Spinward Marches", "Deneb"]);
    assertEquals(withoutSectors(meta, ["Trojan Reach"]).limit, meta.limit);
    assertEquals(withoutSectors(meta, []).sectors.map((row) => row.name), ["Spinward Marches", "Trojan Reach", "Deneb"]);
    assertEquals(sectorCacheKeys([
      "Spinward Marches|1910",
      "Trojan Reach|2036",
      "Trojan Reach|1937",
      "manual|Free Trader",
      "\0sectors",
    ], ["Trojan Reach"]), ["Trojan Reach|2036", "Trojan Reach|1937"]);
  });

  await test.step("counts UWPs in each cached sector", () => {
    assertEquals(sectorWorldCounts(
      ["Spinward Marches", "Deneb"],
      [
        { sector: "Spinward Marches", uwp: "A000986-F" },
        { sector: "Spinward Marches", uwp: "B55467A-9" },
        { sector: "Deneb", uwp: "  " },
        { sector: "Foreven", uwp: "A788899-C" },
      ],
    ), [
      { name: "Spinward Marches", worlds: 2 },
      { name: "Deneb", worlds: 0 },
    ]);
  });

  await test.step("collects the sectors ships currently occupy", () => {
    assertEquals(sectorsInUse([
      { sector: "Spinward Marches", manual: false },
      { sector: "Spinward Marches", manual: false },
      { sector: "Deneb", manual: false },
      { sector: "Foreven", manual: true },
      null,
    ]), ["Spinward Marches", "Deneb"]);
  });

  await test.step("places Regina from the Spinward Marches sector origin", () => {
    assertEquals(worldCoordinates(-4, -1, "1910"), { worldX: -110, worldY: -70 });
  });

  await test.step("reads a sector tab into worlds", () => {
    const tab = [
      "Sector\tSS\tHex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance",
      "Spin\tC\t1910\tRegina\tA788899-C\tNS\tRi Pa Ph\t\t703\tImDd",
      "Spin\tC\t1809\tRuie\tC776977-7\t\t\tR\t903\tImDd",
      "Spin\tC\t1808\t\t???????-?\t\t\t\t???\tImDd",
      "Spin\tC\t1807\t\tX000000-0\t\t\t\t000\tImDd",
    ].join("\n");
    const worlds = worldsFromTab("Spinward Marches", tab, {
      x: -4,
      y: -1,
      subsectors: new Map([["C", "Regina"]]),
      allegiances: new Map([["ImDd", "Third Imperium, Domain of Deneb"]]),
    });
    assertEquals(worlds.map((world) => world.name), ["Regina", "Ruie", ""]);
    assertEquals(worlds[2]?.uwp, "???????-?");
    assertEquals(worlds[2]?.hex, "1808");
    assertEquals(worlds[0]?.id, "Spinward Marches|1910");
    assertEquals(worlds[0]?.worldX, -110);
    assertEquals(worlds[0]?.subsector, "Regina");
    assertEquals(worlds[0]?.allegianceName, "Third Imperium, Domain of Deneb");
    assertEquals(worlds[0]?.tradeCodes, ["Ri", "Pa", "Ph"]);
    assertEquals(worlds[1]?.zone, "red");
  });

  await test.step("reads a sector tab delivered as a JSON string", () => {
    const tab = [
      "Sector\tSS\tHex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance",
      "Spin\tO\t2036\tGlisten\tA000986-F\t\tHi Ht\t\t303\tImDd",
    ].join("\r\n");
    const worlds = worldsFromTab("Spinward Marches", JSON.stringify(tab), {
      x: -4,
      y: -1,
      subsectors: new Map([["O", "Glisten"]]),
      allegiances: new Map([["ImDd", "Third Imperium, Domain of Deneb"]]),
    });
    assertEquals(sectorTabText(JSON.stringify(tab)).split("\t")[2], "Hex");
    assertEquals(worlds.map((world) => world.name), ["Glisten"]);
    assertEquals(worlds[0]?.hex, "2036");
    assertEquals(worlds[0]?.subsector, "Glisten");
  });
});

Deno.test("jump route", async (test) => {
  function place(id: string, worldX: number, worldY: number, zone: "green" | "amber" | "red" = "green") {
    return { id, worldX, worldY, zone };
  }

  await test.step("jumps directly when the destination is in range, even if it is red", () => {
    const worlds = [place("a", 0, 0), place("b", 2, 0, "red")];
    assertEquals(findJumpRoute(worlds, "a", "b", 2)?.map((world) => world.id), ["a", "b"]);
  });

  await test.step("goes around a red system", () => {
    const worlds = [
      place("a", 0, 0),
      place("red", -1, -1, "red"),
      place("side", -1, 0),
      place("c", -2, 0),
    ];
    assertEquals(findJumpRoute(worlds, "a", "c", 1)?.map((world) => world.id), ["a", "side", "c"]);
  });

  await test.step("finds no route when every intermediate stop is red", () => {
    const worlds = [place("a", 0, 0), place("red", -1, -1, "red"), place("c", -2, -1)];
    assertEquals(findJumpRoute(worlds, "a", "c", 1), null);
  });

  await test.step("prefers one jump over a longer chain", () => {
    const worlds = [place("a", 0, 0), place("side", 1, 0), place("b", 2, 0)];
    assertEquals(findJumpRoute(worlds, "a", "b", 2)?.map((world) => world.id), ["a", "b"]);
  });
});
