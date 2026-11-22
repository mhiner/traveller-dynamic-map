import { loadExploreChart, rememberExploreChart } from "../../src/travellerMap.ts";
import { DEFAULT_HOME, HOME_SYSTEM, MODULE_ID } from "./constants.ts";
import { loadHomeWorld } from "./home.ts";
import { currentMapWorld } from "./screen.tsx";
import { loginChartCenter, recallScene } from "./sceneState.ts";

/** Parsecs of chart built around the centered world before the scene opens. */
const PRERENDER_PARSEC = 12;

/** The prerender still in flight. A newer call makes an older result discard itself. */
let request = 0;

/**
 * Build the explore chart for the view the map will open on.
 * loginChartCenter chooses a saved camera, a saved world, or the live map world.
 * The home world is used when none of those has coordinates.
 * A later call drops an in-flight render so a setting change cannot publish a stale chart.
 */
export function prerenderAstrogation(): Promise<void> {
  const current = ++request;
  return renderCentered(current).catch((reason: unknown) => {
    if (current !== request) return;
    console.error(`${MODULE_ID} | Astrogation could not be pre-rendered.`, reason);
  });
}

/** Build the chart for the world the map will open on, and keep it only if this call is still current. */
async function renderCentered(current: number): Promise<void> {
  recallScene();
  const open = loginChartCenter(currentMapWorld());
  const world = open ?? await loadHomeWorld(homeName());
  if (current !== request || world.worldX === null || world.worldY === null) return;
  const keep = world.sector ? [world.sector] : [];
  const chart = await loadExploreChart(world.worldX, world.worldY, PRERENDER_PARSEC, keep, undefined, true);
  if (current !== request) return;
  rememberExploreChart(world.worldX, world.worldY, PRERENDER_PARSEC, chart);
}

/** The configured home system, or Regina when the setting is blank. */
function homeName(): string {
  const value = game.settings.get(MODULE_ID, HOME_SYSTEM);
  const text = typeof value === "string" ? value.trim() : "";
  return text || DEFAULT_HOME;
}
