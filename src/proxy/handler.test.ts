import { assertEquals } from "@std/assert";
import { travellerMapProxy } from "./handler.ts";

Deno.test("traveller map proxy", async (test) => {
  await test.step("refuses the jumpmap image and leaves the cache untouched", async () => {
    const handle = travellerMapProxy({
      cacheRoot: new URL("file:///tmp/traveller-dynamic-map-unused/"),
    });
    const response = await handle(new Request("http://127.0.0.1/travellermap/api/jumpmap?sector=Spinward%20Marches"));
    assertEquals(response.status, 404);
    assertEquals(await response.text(), "");
  });
});
