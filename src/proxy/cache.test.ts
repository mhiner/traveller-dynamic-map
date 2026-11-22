import { assertEquals } from "@std/assert";
import { retainSectors, sectorCacheKey, sectorNameFromKey, SERVER_SECTOR_LIMIT } from "./cache.ts";

Deno.test("server sector cache", async (test) => {
  await test.step("keys the sector files a client requests", () => {
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/data/Spinward%20Marches/tab")), "sector/Spinward%20Marches/tab");
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/data/Spinward%20Marches/1910")), "sector/Spinward%20Marches/1910");
    assertEquals(
      sectorCacheKey(new URL("https://travellermap.com/api/metadata?sector=Spinward%20Marches")),
      "sector/Spinward%20Marches/metadata",
    );
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/api/metadata?sx=-4&sy=-1")), "grid/-4,-1");
  });

  await test.step("leaves search and routes uncached", () => {
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/api/search?q=Regina")), null);
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/api/route?start=A&end=B&jump=1")), null);
    assertEquals(sectorCacheKey(new URL("https://travellermap.com/api/metadata?sector=A&milieu=M1105")), null);
  });

  await test.step("keeps fifty sectors and drops the oldest when another is stored", () => {
    const stored = Array.from({ length: SERVER_SECTOR_LIMIT }, (_, index) => ({ name: `Sector ${index}`, cachedAt: index + 1 }));
    const added = retainSectors(stored, "Sector new", 100);
    assertEquals(added.evict, ["Sector 0"]);
    assertEquals(added.sectors.length, SERVER_SECTOR_LIMIT);
    assertEquals(added.sectors.some((row) => row.name === "Sector new"), true);
    assertEquals(added.sectors.some((row) => row.name === "Sector 0"), false);
    const refreshed = retainSectors(stored, "Sector 0", 100);
    assertEquals(refreshed.evict, []);
    assertEquals(refreshed.sectors.length, SERVER_SECTOR_LIMIT);
    assertEquals(refreshed.sectors.find((row) => row.name === "Sector 0")?.cachedAt, 100);
  });

  await test.step("does not count a grid lookup as a sector", () => {
    assertEquals(sectorNameFromKey("sector/Spinward%20Marches/tab"), "Spinward Marches");
    assertEquals(sectorNameFromKey("grid/-4,-1"), null);
  });
});
