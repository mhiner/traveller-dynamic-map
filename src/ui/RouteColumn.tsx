import { hexDistance } from "../hex.ts";
import type { MapRoute, World } from "../world.ts";
import { JumpChartMap } from "./JumpChartMap.tsx";

/** Worlds already inside the ship's jump rating. Choosing one sets the destination without plotting. */
export function WorldsWithinJump({
  jumpRating,
  worlds,
  onChoose,
}: {
  jumpRating: number;
  worlds: ReadonlyArray<World & { parsecs: number }>;
  onChoose: (world: World & { parsecs: number }) => void;
}) {
  return (
    <details className="within">
      <summary>Within jump-{jumpRating}</summary>
      {worlds.length === 0 ? <p className="meta">No mapped worlds in range yet.</p> : (
        <ul className="jump-route">
          {worlds.map((world) => (
            <li key={world.id}>
              <span className="leg">{world.parsecs} pc</span>
              <button type="button" className="route-stop" onClick={() => onChoose(world)}>
                {world.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** The plotted stops. The selected stop is the pair of worlds shown beside the chart. */
export function PlottedRoute({
  route,
  pending,
  open,
  selected,
  from,
  to,
  onToggle,
  onSelect,
}: {
  route: MapRoute | null;
  pending: boolean;
  open: boolean;
  selected: number | null;
  from: string;
  to: string;
  onToggle: (open: boolean) => void;
  onSelect: (index: number) => void;
}) {
  if (route) {
    return (
      <details className="within" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
        <summary>Jump-{route.jump} Route From {from} to {to}</summary>
        <ol className="jump-route">
          {route.stops.map((stop, index) => {
            const previous = route.stops[index - 1];
            const leg = previous && previous.worldX !== null && previous.worldY !== null && stop.worldX !== null && stop.worldY !== null
              ? hexDistance(previous.worldX, previous.worldY, stop.worldX, stop.worldY)
              : null;
            return (
              <li key={`${stop.sector}|${stop.hex}|${index}`}>
                {index > 0 ? (
                  <span className="route-link" aria-hidden="true">
                    <span className="route-link-line" />
                    <span className="route-link-arrow" />
                  </span>
                ) : null}
                {leg !== null ? <span className="leg">{leg} pc</span> : null}
                <button
                  type="button"
                  className="route-stop"
                  aria-current={selected === index ? "true" : undefined}
                  onClick={() => onSelect(index)}
                >
                  {stop.name}
                </button>
              </li>
            );
          })}
        </ol>
      </details>
    );
  }
  if (pending) return <p className="meta">Plotting the jump route…</p>;
  return null;
}

/** The jump chart. `column` places it beside the world sheets instead of under them. */
export function JumpRouteColumn({
  sector,
  hex,
  name,
  dark,
  outline,
  column,
}: {
  sector: string;
  hex: string;
  name: string;
  dark: boolean;
  outline: boolean;
  column: boolean;
}) {
  const chart = (
    <div className="jump-map-stack">
      <JumpChartMap key={`${sector}|${hex}`} sector={sector} hex={hex} name={name} dark={dark} outline={outline} />
    </div>
  );
  return column ? <div className="jump-route-column">{chart}</div> : chart;
}
