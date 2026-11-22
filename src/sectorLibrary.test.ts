import { assertEquals } from "@std/assert";
import { asSectorGrid, asStoredSector, asWorldIndex, gridPoint, indexRows, libraryMode, worldsMatching, type SectorLibrary, type StoredSector } from "./sectorLibrary.ts";
import type { CachedWorld } from "./worldCache.ts";

function world(name: string, sector: string, hex: string): CachedWorld {
  return {
    id: `${sector}|${hex}`,
    name,
    sector,
    hex,
    uwp: "A788899-C",
    tradeCodes: [],
    zone: "green",
    worldX: 1,
    worldY: 2,
    manual: false,
    remarks: "",
    pbg: "000",
    bases: "",
    allegiance: "Im",
    allegianceName: "Imperium",
    subsector: "Regina",
  };
}

function sector(name: string, worlds: CachedWorld[]): StoredSector {
  return {
    kind: "sector",
    name,
    x: -4,
    y: -1,
    worlds,
    routes: [{ Start: "1910", End: "1808" }],
    borders: [],
    stylesheet: "",
    allegiances: [{ code: "Im", name: "Imperium" }],
    subsectors: [{ index: "A", name: "Regina" }],
  };
}

function idleLibrary(enabled: boolean, exclusive: boolean): SectorLibrary {
  return {
    enabled,
    exclusive,
    sector: () => Promise.resolve(null),
    sectorAt: () => Promise.resolve(null),
    search: () => Promise.resolve([]),
    list: () => Promise.resolve([]),
  };
}

Deno.test("sector library", async (test) => {
  await test.step("stays off unless a library is enabled or exclusive", () => {
    assertEquals(libraryMode(null), { on: false, exclusive: false });
    assertEquals(libraryMode(idleLibrary(false, false)), { on: false, exclusive: false });
    assertEquals(libraryMode(idleLibrary(false, true)).on, true);
  });

  await test.step("keeps a sector document and drops a world index", () => {
    const stored = sector("Spinward Marches", [world("Regina", "Spinward Marches", "1910")]);
    assertEquals(asStoredSector(stored)?.name, "Spinward Marches");
    assertEquals(asStoredSector({ kind: "world-index" }), null);
    assertEquals(asWorldIndex({ kind: "world-index", worlds: [{ name: "Regina", sector: "Spinward Marches" }, { name: "", sector: "X" }] }), [
      { name: "Regina", sector: "Spinward Marches" },
    ]);
  });

  await test.step("reads a sector grid without the sector body", () => {
    assertEquals(asSectorGrid({
      kind: "sector-grid",
      sectors: [{ name: "Spinward Marches", x: -4, y: -1 }, { name: "", x: 0, y: 0 }],
    }), [{ name: "Spinward Marches", x: -4, y: -1 }]);
    assertEquals(gridPoint({
      flags: { "traveller-astrogation": { data: { x: -4, y: -1, worlds: [] } } },
    }, "traveller-astrogation"), { x: -4, y: -1 });
    assertEquals(gridPoint({ flags: { "traveller-astrogation": { data: { kind: "world-index" } } } }, "traveller-astrogation"), null);
  });
  await test.step("indexes world names and matches a search", () => {
    const marches = sector("Spinward Marches", [world("Regina", "Spinward Marches", "1910"), world("Ruie", "Spinward Marches", "1809")]);
    const rows = indexRows([marches]);
    assertEquals(rows.map((row) => row.name), ["Regina", "Ruie"]);
    assertEquals(worldsMatching(marches, "reg").map((item) => item.hex), ["1910"]);
    assertEquals(worldsMatching(marches, "r"), []);
  });
});
