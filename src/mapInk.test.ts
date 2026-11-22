import { assertEquals } from "@std/assert";
import { hostPrefersDarkMap, mapInk } from "./mapInk.ts";

Deno.test("map ink", async (test) => {
  await test.step("trades white and black in dark view and leaves other colors", () => {
    assertEquals(mapInk("#fff", true), "#000000");
    assertEquals(mapInk("#ffffff", true), "#000000");
    assertEquals(mapInk("white", true), "#000000");
    assertEquals(mapInk("#000", true), "#ffffff");
    assertEquals(mapInk("#000000", true), "#ffffff");
    assertEquals(mapInk("#111", true), "#ffffff");
    assertEquals(mapInk("black", true), "#ffffff");
    assertEquals(mapInk("#2f9e4f", true), "#2f9e4f");
    assertEquals(mapInk("#b0c7f8", true), "#b0c7f8");
    assertEquals(mapInk("#9a9a9a", true), "#9a9a9a");
    assertEquals(mapInk("#e32736", true), "#e32736");
    assertEquals(mapInk("#c5dff6", true), "#c5dff6");
    assertEquals(mapInk("#fff", false), "#fff");
    assertEquals(mapInk("#111", false), "#111");
  });

  await test.step("stays light when the page has no color scheme", () => {
    assertEquals(hostPrefersDarkMap(), false);
  });
});
