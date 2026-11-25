/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { hexPixel } from "../../src/jumpChart.ts";
import { loginChartCenter, parseLocal, parseScene, preferScene, sceneOrigin, type SavedScene } from "./sceneState.ts";

function scene(revision: number, name = "Regina"): SavedScene {
  return {
    revision,
    zoom: 1.5,
    x: 10,
    y: -20,
    center: { name, sector: "Spinward Marches", hex: "1910", worldX: -110, worldY: -70 },
    selected: { name, sector: "Spinward Marches", hex: "1910", worldX: -110, worldY: -70 },
    filters: { tech: "C", starport: null, trade: ["Ag", "Cp"] },
    borders: false,
    ships: false,
    query: "reg",
  };
}

Deno.test("scene state", async (test) => {
  await test.step("reads a stored view and drops unknown trade codes", () => {
    const saved = parseScene({
      revision: 5,
      zoom: 9,
      x: 4,
      y: 8,
      center: { name: "Regina", sector: "Spinward Marches", hex: "1910", worldX: -110, worldY: -70 },
      selected: { name: "Efate", sector: "Spinward Marches", hex: "1705", worldX: -112, worldY: -75 },
      filters: { tech: "C", starport: "Q", trade: ["Ag", "Nope", "He"] },
      borders: false,
      query: "ef",
    });
    assertEquals(saved?.zoom, 3);
    assertEquals(saved?.filters, { tech: "C", starport: null, trade: ["Ag", "He"] });
    assertEquals(saved?.borders, false);
    assertEquals(saved?.ships, false);
    assertEquals(saved?.selected?.name, "Efate");
  });

  await test.step("accepts a view stored as a JSON string", () => {
    const saved = parseScene(JSON.stringify(scene(2)));
    assertEquals(saved?.center?.hex, "1910");
    assertEquals(saved?.query, "reg");
  });

  await test.step("keeps the newer copy for this user", () => {
    const older = scene(1);
    const newer = scene(4, "Efate");
    assertEquals(preferScene(older, { userId: "ada", scene: newer }, "ada")?.center?.name, "Efate");
    assertEquals(preferScene(newer, { userId: "ada", scene: older }, "ada")?.revision, 4);
    assertEquals(preferScene(older, { userId: "bea", scene: newer }, "ada")?.revision, 1);
    assertEquals(preferScene(null, { userId: "ada", scene: newer }, "ada")?.center?.name, "Efate");
  });

  await test.step("uses the live world when no view is saved", () => {
    assertEquals(loginChartCenter({ worldX: -110, worldY: -70, sector: "Spinward Marches" }), {
      worldX: -110,
      worldY: -70,
      sector: "Spinward Marches",
    });
    assertEquals(loginChartCenter({ worldX: null, worldY: -70, sector: "Foreven" }), null);
    assertEquals(loginChartCenter(null), null);
  });

  await test.step("aims a saved view at the camera, then the centered world", () => {
    const saved = scene(8);
    const pixel = hexPixel(-108, -68);
    assertEquals(sceneOrigin({ ...saved, x: pixel.x, y: pixel.y }), {
      worldX: -108,
      worldY: -68,
      sector: "Spinward Marches",
    });
    assertEquals(sceneOrigin({ ...saved, x: null, y: null }), {
      worldX: -110,
      worldY: -70,
      sector: "Spinward Marches",
    });
    assertEquals(sceneOrigin({ ...saved, x: null, y: null, center: null }), null);
  });

  await test.step("reads the browser copy only when it names a user and a view", () => {
    assertEquals(parseLocal({ userId: "ada", scene: scene(3) })?.userId, "ada");
    assertEquals(parseLocal({ userId: "", scene: scene(3) }), null);
    assertEquals(parseLocal({ userId: "ada", scene: { revision: "nope" } }), null);
  });
});
