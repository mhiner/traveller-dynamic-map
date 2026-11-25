/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { describeFilters, helpText, mergeFilters, parseAstro, type ExploreFilters } from "./astro.ts";

const current: ExploreFilters = { tech: "C", starport: "A", trade: ["Ag"] };

Deno.test("/astro", async (test) => {
  await test.step("treats a bare command and help as the command list", () => {
    assertEquals(parseAstro(""), { type: "help" });
    assertEquals(parseAstro("HELP"), { type: "help" });
  });

  await test.step("plots a route with an optional jump range from 1 through 6", () => {
    assertEquals(parseAstro("route Regina"), { type: "route", jump: null, name: "Regina" });
    assertEquals(parseAstro("route j=2 Rhylanor"), { type: "route", jump: 2, name: "Rhylanor" });
    assertEquals(parseAstro("ROUTE J=6 New Home"), { type: "route", jump: 6, name: "New Home" });
    assertEquals(parseAstro("route").type, "error");
    assertEquals(parseAstro("route j=2").type, "error");
    assertEquals(parseAstro("route j=0 Regina").type, "error");
    assertEquals(parseAstro("route j=7 Regina").type, "error");
  });

  await test.step("toggles borders with a bare command", () => {
    assertEquals(parseAstro("borders"), { type: "borders" });
    assertEquals(parseAstro("BORDERS"), { type: "borders" });
    assertEquals(parseAstro("borders on").type, "error");
  });

  await test.step("toggles ships with a bare command", () => {
    assertEquals(parseAstro("ships"), { type: "ships" });
    assertEquals(parseAstro("SHIPS"), { type: "ships" });
    assertEquals(parseAstro("ships on").type, "error");
  });

  await test.step("lists ships in help only when ship design is active", () => {
    assertEquals(helpText().includes("/astro ships"), false);
    assertEquals(helpText({ ships: true }).includes("/astro ships — show or hide blueprint ships"), true);
  });

  await test.step("accepts the GM snap and filter commands", () => {
    assertEquals(parseAstro("gm snap"), { type: "snap" });
    assertEquals(parseAstro("GM FILTERS"), { type: "sync-filters" });
    assertEquals(parseAstro("gm").type, "error");
    assertEquals(parseAstro("gm snap now").type, "error");
  });

  await test.step("creates a world actor from a name, or from the selected world when the name is omitted", () => {
    assertEquals(parseAstro("actor"), { type: "actor", name: null });
    assertEquals(parseAstro("actor Regina"), { type: "actor", name: "Regina" });
    assertEquals(parseAstro("ACTOR New Home"), { type: "actor", name: "New Home" });
    assertEquals(parseAstro("actor R").type, "error");
  });

  await test.step("requires a world name of at least two characters", () => {
    assertEquals(parseAstro("find"), {
      type: "error",
      message: "Usage: /astro find <world>. The name needs at least 2 characters.",
    });
    assertEquals(parseAstro("find Regina"), { type: "find", name: "Regina" });
  });

  await test.step("lists, clears, and sets one filter without clearing the others", () => {
    assertEquals(parseAstro("filter"), { type: "list" });
    assertEquals(parseAstro("filter clear"), { type: "clear" });
    assertEquals(parseAstro("filter TL=c"), { type: "set", tech: "C" });
    assertEquals(mergeFilters(current, { tech: "C" }), current);
    assertEquals(mergeFilters(current, { starport: "B" }).starport, "B");
    assertEquals(mergeFilters(current, { starport: "B" }).trade, ["Ag"]);
  });

  await test.step("accepts a tech level from 0 through F and a starport from A through E", () => {
    assertEquals(parseAstro("filter tl=0"), { type: "set", tech: "0" });
    assertEquals(parseAstro("filter SP=e"), { type: "set", starport: "E" });
    assertEquals(parseAstro("filter TL=G").type, "error");
    assertEquals(parseAstro("filter SP=X").type, "error");
  });

  await test.step("reads a comma-separated trade list, including spaces, and rejects unknown codes", () => {
    assertEquals(parseAstro("filter Trade=ag, hi"), { type: "set", trade: ["Ag", "Hi"] });
    assertEquals(parseAstro("filter Trade=cp, he, pa"), { type: "set", trade: ["Cp", "He", "Pa"] });
    assertEquals(parseAstro("filter Trade=Nope").type, "error");
    assertEquals(parseAstro("filter TL=A SP=C Trade=Ri,Ag"), { type: "set", tech: "A", starport: "C", trade: ["Ri", "Ag"] });
  });

  await test.step("describes the filters the explore map is using", () => {
    assertEquals(
      describeFilters({ tech: null, starport: null, trade: [] }),
      "Explore map filters\nTech level: off\nStarport: off\nTrade codes: off",
    );
    assertEquals(
      describeFilters(current),
      "Explore map filters\nTech level: C and higher\nStarport: A or better\nTrade codes: Ag",
    );
  });
});
