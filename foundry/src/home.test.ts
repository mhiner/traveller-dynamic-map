/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import type { SearchHit } from "../../src/travellerMap.ts";
import { pickHomeHit } from "./home.ts";

function hit(name: string, sector: string, hex: string): SearchHit {
  return { name, sector, hex, uwp: "A000000-0", worldX: 0, worldY: 0 };
}

Deno.test("home world", async (test) => {
  const regina = hit("Regina", "Spinward Marches", "1910");
  const other = hit("Regina", "Solomani Rim", "0101");

  await test.step("prefers the Spinward Marches world when the name is shared", () => {
    assertEquals(pickHomeHit("Regina", [other, regina]), regina);
  });

  await test.step("keeps an exact name from another sector when that is the only exact match", () => {
    assertEquals(pickHomeHit("Regina", [other, hit("Rhylanor", "Spinward Marches", "2716")]), other);
  });

  await test.step("uses the first hit when nothing matches the name or Spinward Marches", () => {
    const terra = hit("Terra", "Solomani Rim", "1827");
    assertEquals(pickHomeHit("Terra", [terra]), terra);
  });

  await test.step("returns nothing for a blank name or an empty search", () => {
    assertEquals(pickHomeHit("  ", [regina]), null);
    assertEquals(pickHomeHit("Regina", []), null);
  });
});
