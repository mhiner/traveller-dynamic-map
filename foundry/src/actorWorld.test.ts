/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import type { CachedWorld } from "../../src/worldCache.ts";
import {
  actorDisplayName,
  actorUpdateMatters,
  applyActorWorld,
  sectorSyncAction,
  baseCodes,
  matchingWorld,
  planetHex,
  sectorHex,
  worldActorFields,
  worldCoordinates,
  worldFolderNames,
  type ExistingWorld,
} from "./actorWorld.ts";

const regina = {
  name: "Regina",
  sector: "Spinward Marches",
  subsector: "Regina",
  hex: "1910",
  uwp: "A788899-C",
  tradeCodes: ["Ri", "Pa", "Ph", "Hi", "In", "Cp"],
  zone: "green" as const,
  worldX: -110,
  worldY: -70,
  pbg: "703",
  bases: "NS",
  allegiance: "ImDd",
  allegianceName: "Third Imperium, Domain of Deneb",
};

Deno.test("world actor", async (test) => {
  await test.step("names an unnamed unknown world by sector and hex", () => {
    assertEquals(actorDisplayName({ name: "", sector: "Foreven", hex: "1808", uwp: "???????-?" }), "Foreven 1808");
    assertEquals(actorDisplayName({ name: "  ", sector: "Foreven", hex: "1808", uwp: "???????-?" }), "Foreven 1808");
    assertEquals(actorDisplayName({ name: "Blank", sector: "Foreven", hex: "2136", uwp: "???????-?" }), "Blank");
    assertEquals(actorDisplayName({ name: "Regina", sector: "Spinward Marches", hex: "1910", uwp: "A788899-C" }), "Regina");
  });

  await test.step("files the world under the sector and the subsector", () => {
    assertEquals(worldFolderNames("Spinward Marches", "Regina"), ["Spinward Marches", "Regina"]);
    assertEquals(worldFolderNames("  ", ""), ["Unknown sector", "Unknown subsector"]);
  });

  await test.step("maps Regina onto the Mongoose Traveller 2e world fields", () => {
    assertEquals(sectorHex(-110, -70, "1910"), { sectorX: -4, sectorY: -1, x: 19, y: 10 });
    const fields = worldActorFields(regina);
    assertEquals(fields?.port, "A");
    assertEquals(fields?.size, 7);
    assertEquals(fields?.atmosphere, 8);
    assertEquals(fields?.hydrographics, 8);
    assertEquals(fields?.population, 8);
    assertEquals(fields?.government, 9);
    assertEquals(fields?.lawLevel, 9);
    assertEquals(fields?.techLevel, 12);
    assertEquals(fields?.zone, null);
    assertEquals(fields?.bases, "N, S");
    assertEquals(fields?.codes, "Ri, Pa, Ph, Hi, In, Cp");
    assertEquals(fields?.popDigit, 7);
    assertEquals(fields?.allegiance, "Third Imperium, Domain of Deneb");
    assertEquals(fields?.sectorX, -4);
    assertEquals(fields?.x, 19);
    assertEquals(fields?.y, 10);
  });

  await test.step("keeps an amber zone and splits written base lists", () => {
    const fields = worldActorFields({ ...regina, zone: "amber", bases: "N, S", pbg: "003" });
    assertEquals(fields?.zone, "Amber");
    assertEquals(baseCodes("N, S"), "N, S");
    assertEquals(fields?.popDigit, 1);
  });

  await test.step("treats the same world, or the same name in the destination folder, as already created", () => {
    const actors: ExistingWorld[] = [
      { name: "Regina", type: "world", sector: "Spinward Marches", x: 19, y: 10, folderId: "other" },
      { name: "Regina", type: "world", sector: "", x: 0, y: 0, folderId: "subsector" },
    ];
    assertEquals(matchingWorld(actors, { name: "regina", sector: "Spinward Marches", x: 19, y: 10 }, null)?.folderId, "other");
    assertEquals(matchingWorld(actors, { name: "Regina", sector: "Solomani Rim", x: 1, y: 1 }, "subsector")?.folderId, "subsector");
    assertEquals(matchingWorld(actors, { name: "Regina", sector: "Solomani Rim", x: 1, y: 1 }, "elsewhere"), null);
    assertEquals(matchingWorld([{ ...actors[0], type: "traveller" }], { name: "Regina", sector: "Spinward Marches", x: 19, y: 10 }, null), null);
  });

  await test.step("writes the actor survey onto the sector world at the same planet", () => {
    assertEquals(planetHex(19, 10), "1910");
    assertEquals(worldCoordinates(-4, -1, 19, 10), { worldX: -110, worldY: -70 });
    const stored: CachedWorld = {
      id: "Spinward Marches|1910",
      name: "Regina",
      sector: "Spinward Marches",
      hex: "1910",
      uwp: "A788899-C",
      tradeCodes: ["Ri"],
      zone: "green",
      worldX: -110,
      worldY: -70,
      manual: false,
      remarks: "Pa",
      pbg: "703",
      bases: "NS",
      allegiance: "ImDd",
      allegianceName: "Third Imperium, Domain of Deneb",
      subsector: "Regina",
    };
    const next = applyActorWorld(stored, {
      name: "Regina Prime",
      sector: "Spinward Marches",
      sectorX: -4,
      sectorY: -1,
      x: 19,
      y: 10,
      port: "B",
      size: 7,
      atmosphere: 8,
      hydrographics: 8,
      population: 8,
      government: 9,
      lawLevel: 9,
      techLevel: 12,
      zone: "Amber",
      bases: "N, W",
      codes: "Ri, Ag",
      popDigit: 8,
      allegiance: "Domain of Deneb",
    });
    assertEquals(next.name, "Regina Prime");
    assertEquals(next.hex, "1910");
    assertEquals(next.uwp, "B788899-C");
    assertEquals(next.tradeCodes, ["Ri", "Ag"]);
    assertEquals(next.zone, "amber");
    assertEquals(next.bases, "NW");
    assertEquals(next.pbg, "803");
    assertEquals(next.allegiance, "ImDd");
    assertEquals(next.allegianceName, "Domain of Deneb");
    assertEquals(next.remarks, "Pa");
    assertEquals(next.worldX, -110);
    assertEquals(next.worldY, -70);
    assertEquals(actorUpdateMatters({ name: "Regina Prime" }), true);
    assertEquals(actorUpdateMatters({ system: {} }), true);
    assertEquals(actorUpdateMatters({ sort: 1 }), false);
    assertEquals(actorUpdateMatters(null), false);
    assertEquals(sectorSyncAction(true), "defer");
    assertEquals(sectorSyncAction(false), "write");
  });
});
