import { assertEquals } from "@std/assert";
import { worldProfile, type MapWorldRecord } from "./worldProfile.ts";

const SENKON: MapWorldRecord = {
  Name: "Senkon",
  Hex: "1534",
  UWP: "D510100-9",
  PBG: "623",
  Zone: "",
  Bases: "",
  Allegiance: "ImDv",
  Remarks: "Lo",
  Sector: "Vland",
  SubsectorName: "Daangiilu",
  AllegianceName: "Third Imperium, Domain of Vland",
};

Deno.test("world profile", async (test) => {
  await test.step("reads Senkon the way Traveller Map returns it", () => {
    const profile = worldProfile(SENKON);
    assertEquals(profile?.name, "Senkon");
    assertEquals(profile?.milieu, "M1105");
    assertEquals(profile?.sectorHex, "Vland 1534");
    assertEquals(profile?.subsector, "Daangiilu");
    assertEquals(profile?.allegiance, "Third Imperium, Domain of Vland (ImDv)");
    assertEquals(profile?.zoneLabel, "Safe");
    assertEquals(profile?.zoneDetail, "Safe — no restriction recorded");
    assertEquals(profile?.population, { multiplier: 6, exponent: 1, total: "60" });
    assertEquals(profile?.uwp, "D510100-9");
    assertEquals(profile?.rows.map((row) => `${row.field} ${row.code} ${row.meaning}`), [
      "Starport D Poor",
      "Size 5 8,000km (0.63g)",
      "Atmosphere 1 Trace",
      "Hydrographics 0 Desert World",
      "Population 1 Tens",
      "Government 0 No Government Structure",
      "Law level 0 No prohibitions",
      "Technology level 9 Anti-Gravity",
    ]);
    assertEquals(profile?.gasGiants, "3");
    assertEquals(profile?.bases, "None recorded");
    assertEquals(profile?.tradeCodes, ["Lo"]);
  });

  await test.step("names amber and red zones and lists bases", () => {
    const profile = worldProfile({ ...SENKON, Zone: "A", Bases: "NS", PBG: "703", UWP: "A788899-C" });
    assertEquals(profile?.zoneLabel, "Amber");
    assertEquals(profile?.zoneDetail, "Amber — caution advised");
    assertEquals(profile?.bases, "Naval base, Scout base");
    assertEquals(profile?.population, { multiplier: 7, exponent: 8, total: "700,000,000" });
    assertEquals(profile?.gasGiants, "3");
  });

  await test.step("treats a zero population multiplier as one when people are recorded", () => {
    const profile = worldProfile({ ...SENKON, PBG: "003", UWP: "A788899-C" });
    assertEquals(profile?.population?.multiplier, 1);
    assertEquals(profile?.population?.total, "100,000,000");
  });

  await test.step("returns nothing when the record has no name", () => {
    assertEquals(worldProfile({ UWP: "D510100-9" }), null);
  });

  await test.step("lists every attribute as unknown when the profile is unsurveyed", () => {
    const profile = worldProfile({
      ...SENKON,
      UWP: "???????-?",
      PBG: "123",
      Bases: "NS",
      Zone: "R",
      Remarks: "Ag Ri",
      Allegiance: "ImDv",
      AllegianceName: "Third Imperium, Domain of Vland",
      SubsectorName: "Daangiilu",
    });
    assertEquals(profile?.uwp, "???????-?");
    assertEquals(profile?.subsector, "Unknown");
    assertEquals(profile?.allegiance, "Unknown");
    assertEquals(profile?.zone, "green");
    assertEquals(profile?.zoneLabel, "Unknown");
    assertEquals(profile?.zoneDetail, "Unknown");
    assertEquals(profile?.population, null);
    assertEquals(profile?.gasGiants, "Unknown");
    assertEquals(profile?.bases, "Unknown");
    assertEquals(profile?.tradeCodes, []);
    assertEquals(profile?.rows.map((row) => `${row.field} ${row.code} ${row.meaning}`), [
      "Starport ? Unknown",
      "Size ? Unknown",
      "Atmosphere ? Unknown",
      "Hydrographics ? Unknown",
      "Population ? Unknown",
      "Government ? Unknown",
      "Law level ? Unknown",
      "Technology level ? Unknown",
    ]);
  });
});
