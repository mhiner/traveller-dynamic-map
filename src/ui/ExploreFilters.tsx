import { useEffect, useState } from "../runtime.ts";
import { FIND_TRADE_CODES } from "../codes.ts";

/** Values the explore map reads. The checkbox details stay in this panel. */
export interface MapShade {
  minTech: number | null;
  minStarport: string | null;
  tradeCodes: string[];
  drawBorders: boolean;
}

interface FilterControl {
  filters: { tech: string | null; starport: string | null; trade: readonly string[] };
  borders: boolean;
  setBorders: (shown: boolean) => void;
  setFilters: (filters: { tech: string | null; starport: string | null; trade: readonly string[] }) => void;
}

/** The shade a host control describes, before the panel has rendered. */
export function shadeFromControl(control: FilterControl | null): MapShade {
  const tech = control?.filters.tech ?? null;
  return {
    minTech: tech !== null ? Number.parseInt(tech, 16) : null,
    minStarport: control?.filters.starport ?? null,
    tradeCodes: [...(control?.filters.trade ?? [])],
    drawBorders: control?.borders ?? true,
  };
}

/**
 * Tech, starport, trade-code, and border checkboxes.
 * A host control is copied in when it changes, and each edit is written back.
 */
export function ExploreFilters({ control, onChange }: { control: FilterControl | null; onChange: (shade: MapShade) => void }) {
  const [techOn, setTechOn] = useState(() => control?.filters.tech != null);
  const [techCode, setTechCode] = useState(() => control?.filters.tech ?? "1");
  const [starportOn, setStarportOn] = useState(() => control?.filters.starport != null);
  const [starportCode, setStarportCode] = useState(() => control?.filters.starport ?? "A");
  const [tradeCodesOn, setTradeCodesOn] = useState(() => (control?.filters.trade.length ?? 0) > 0);
  const [tradeCodes, setTradeCodes] = useState<string[]>(() => [...(control?.filters.trade ?? [])]);
  const [bordersOn, setBordersOn] = useState(() => control?.borders ?? true);
  const publish = (next: { techOn: boolean; techCode: string; starportOn: boolean; starportCode: string; trade: string[] }) => {
    control?.setFilters({
      tech: next.techOn ? next.techCode : null,
      starport: next.starportOn ? next.starportCode : null,
      trade: next.trade,
    });
  };
  const filterKey = control
    ? `${control.filters.tech ?? ""}\n${control.filters.starport ?? ""}\n${control.filters.trade.join(",")}`
    : null;
  useEffect(() => {
    if (!control || filterKey === null) return;
    // Chat and another client can change the same filters. Copy them in without writing them back.
    const { tech, starport, trade: codes } = control.filters;
    setTechOn(tech !== null);
    if (tech) setTechCode(tech);
    setStarportOn(starport !== null);
    if (starport) setStarportCode(starport);
    setTradeCodesOn(codes.length > 0);
    setTradeCodes([...codes]);
  }, [filterKey]);
  useEffect(() => {
    if (!control) return;
    setBordersOn(control.borders);
  }, [control?.borders]);
  const report = (next: { techOn: boolean; techCode: string; starportOn: boolean; starportCode: string; trade: string[]; bordersOn: boolean }) => {
    onChange({
      minTech: next.techOn ? Number.parseInt(next.techCode, 16) : null,
      minStarport: next.starportOn ? next.starportCode : null,
      tradeCodes: next.trade,
      drawBorders: next.bordersOn,
    });
  };
  return (
    <div className="explore-filters">
      <div className="map-filters">
        <label className="check">
          <input
            type="checkbox"
            checked={techOn}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              setTechOn(on);
              publish({ techOn: on, techCode, starportOn, starportCode, trade: tradeCodes });
              report({ techOn: on, techCode, starportOn, starportCode, trade: tradeCodes, bordersOn });
            }}
          />
          TL
        </label>
        <select
          aria-label="Tech level"
          value={techCode}
          onChange={(event) => {
            const code = event.currentTarget.value;
            setTechCode(code);
            if (techOn) publish({ techOn: true, techCode: code, starportOn, starportCode, trade: tradeCodes });
            report({ techOn, techCode: code, starportOn, starportCode, trade: tradeCodes, bordersOn });
          }}
        >
          {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"].map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={starportOn}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              setStarportOn(on);
              publish({ techOn, techCode, starportOn: on, starportCode, trade: tradeCodes });
              report({ techOn, techCode, starportOn: on, starportCode, trade: tradeCodes, bordersOn });
            }}
          />
          Starport
        </label>
        <select
          aria-label="Starport"
          value={starportCode}
          onChange={(event) => {
            const code = event.currentTarget.value;
            setStarportCode(code);
            if (starportOn) publish({ techOn, techCode, starportOn: true, starportCode: code, trade: tradeCodes });
            report({ techOn, techCode, starportOn, starportCode: code, trade: tradeCodes, bordersOn });
          }}
        >
          {["A", "B", "C", "D", "E"].map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={tradeCodesOn}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              setTradeCodesOn(on);
              if (on) return;
              setTradeCodes([]);
              publish({ techOn, techCode, starportOn, starportCode, trade: [] });
              report({ techOn, techCode, starportOn, starportCode, trade: [], bordersOn });
            }}
          />
          Trade codes
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={bordersOn}
            onChange={(event) => {
              const on = event.currentTarget.checked;
              setBordersOn(on);
              control?.setBorders(on);
              report({ techOn, techCode, starportOn, starportCode, trade: tradeCodes, bordersOn: on });
            }}
          />
          Draw borders
        </label>
      </div>
      {tradeCodesOn ? <div className="trade-filters">
        {FIND_TRADE_CODES.map((code) => (
          <label className="check" key={code}>
            <input
              type="checkbox"
              checked={tradeCodes.includes(code)}
              onChange={(event) => {
                const on = event.currentTarget.checked;
                const next = on ? [...tradeCodes, code] : tradeCodes.filter((item) => item !== code);
                setTradeCodes(next);
                publish({ techOn, techCode, starportOn, starportCode, trade: next });
                report({ techOn, techCode, starportOn, starportCode, trade: next, bordersOn });
              }}
            />
            {code}
          </label>
        ))}
      </div> : null}
    </div>
  );
}
