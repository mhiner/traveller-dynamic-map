import type { World, Zone } from "./world.ts";

/** Trade codes the map recognizes, in the order the filter offers them. */
const TRADE_CODES = [
  "Ag", "As", "Ba", "De", "Fl", "Ga", "Hi", "Ht", "Ic", "In", "Lo", "Lt", "Na", "Ni", "Po", "Ri", "Va", "Wa", "Ab", 
  "An", "Cp", "Cs", "Cx", "Cy", "Da", "Di", "Fa", "Fo", "He", "Mi", "Mr", "Pa", "Pe", "Ph", "Pi", "Pr", "Px", "Pz", 
  "Re", "Rs", "Sa"
] as const;

/** Every trade code the map recognizes. The explore-map filter offers this whole list. 
 * I used to use a subset for filters but shifted to the full list
*/
export const FIND_TRADE_CODES: readonly string[] = TRADE_CODES;

const CODE_PATTERN = new RegExp(`\\b(${TRADE_CODES.join("|")})\\b`, "gi");

/** Trade codes named in remarks, in list order, with duplicates removed. Unknown tokens are ignored. */
export function tradeCodesFromRemarks(remarks: string): string[] {
  const found: string[] = [];
  for (const match of remarks.matchAll(CODE_PATTERN)) {
    const canonical = TRADE_CODES.find((code) => code.toLowerCase() === match[1].toLowerCase());
    if (canonical && !found.includes(canonical)) found.push(canonical);
  }
  return found;
}

/** Amber, red, or green. */
export function parseZone(raw: string | undefined): Zone {
  const zone = (raw ?? "").trim().toUpperCase();
  if (zone === "A" || zone === "AMBER") return "amber";
  if (zone === "R" || zone === "RED") return "red";
  return "green";
}

/** Cache key. A placed world is `sector|hex`. A world with no sector is keyed by its name. */
export function worldId(world: Pick<World, "sector" | "hex" | "name">): string {
  if (world.sector && world.hex) return `${world.sector}|${world.hex}`;
  return `manual|${world.name}`;
}
