import type { WorldProfile as Profile } from "../worldProfile.ts";

/** The surveyed world: name, profile digits, trade codes, and bases. */
export function WorldProfile({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  return (
    <div className={`world-profile zone-${profile.zone}`}>
      <header className="world-profile-head">
        <div>
          <h2>{profile.name}</h2>
          <p className="meta">Traveller Map · {profile.milieu}</p>
        </div>
        <span className="zone-badge">{profile.zoneLabel}</span>
      </header>
      <dl className="world-facts">
        <dt>Sector / hex</dt>
        <dd>{profile.sectorHex || "—"}</dd>
        <dt>Subsector</dt>
        <dd>{profile.subsector}</dd>
        <dt>Allegiance</dt>
        <dd>{profile.allegiance}</dd>
        <dt>Travel zone</dt>
        <dd>{profile.zoneDetail}</dd>
        <dt>Population</dt>
        <dd>
          {profile.population
            ? <>{profile.population.multiplier} × 10<sup>{profile.population.exponent}</sup> = {profile.population.total}</>
            : "Unknown"}
        </dd>
      </dl>
      <div className="uwp-head">
        <h3>{compact ? "UWP" : "Universal World Profile"}</h3>
        <span className="uwp-code">{profile.uwp || "—"}</span>
      </div>
      {profile.rows.length > 0 ? (
        <table className="uwp-table">
          <thead>
            <tr>
              <th>Field</th>
              {compact ? null : <th>Code</th>}
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {profile.rows.map((row) => (
              <tr key={row.field}>
                <td>{compact ? `${row.field} (${row.code})` : row.field}</td>
                {compact ? null : <td className="uwp-digit">{row.code}</td>}
                <td>{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <dl className="world-facts world-tail">
        <dt>Gas giants</dt>
        <dd>{profile.gasGiants}</dd>
        <dt>Bases</dt>
        <dd>{profile.bases}</dd>
      </dl>
      <h3>Calculator trade codes</h3>
      {profile.tradeCodes.length > 0 ? (
        <p className="trade-codes">{profile.tradeCodes.map((code) => <span key={code} className="trade-code">{code}</span>)}</p>
      ) : <p className="meta">{profile.uwp === "???????-?" ? "Unknown" : "None recorded"}</p>}
    </div>
  );
}
