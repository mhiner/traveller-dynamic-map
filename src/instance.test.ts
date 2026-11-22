import { assertEquals } from "@std/assert";
import { memorySectorCache } from "./cache.ts";
import { createMap } from "./instance.tsx";
import type { MapHooks, MapJsxRuntime } from "./runtime.ts";
import { emitSetDestination } from "./session.ts";
import { SECTOR_CACHE_KEY } from "./worldCache.ts";

const jsxRuntime: MapJsxRuntime = {
  Fragment: () => null,
  jsx: () => null,
  jsxs: () => null,
};

const hooks: MapHooks = {
  useState: (initial) => [typeof initial === "function" ? (initial as () => unknown)() : initial, () => undefined] as never,
  useEffect: () => undefined,
  useRef: (initial) => ({ current: initial }),
};

Deno.test("map instance", async (test) => {
  await test.step("replaces the default cache and reads the sector limit from the replacement", async () => {
    const first = memorySectorCache();
    const map = createMap({ jsxRuntime, hooks, cache: first });
    const replacement = memorySectorCache();
    let stored = 0;
    const stop = map.on("setDestination", () => {
      stored += 1;
    });
    map.setCache(replacement);
    assertEquals(map.cache(), replacement);
    await map.setSectorCacheLimit(4);
    assertEquals(await map.sectorCacheLimitValue(), 4);
    assertEquals(await replacement.get(SECTOR_CACHE_KEY), { limit: 4, sectors: [] });
    assertEquals(await first.get(SECTOR_CACHE_KEY), undefined);
    await emitSetDestination({ world: null, route: null });
    assertEquals(stored, 1);
    stop();
    await emitSetDestination({ world: null, route: null });
    assertEquals(stored, 1);
  });
});
