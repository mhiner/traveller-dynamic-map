import { parseZone, tradeCodesFromRemarks } from "./codes.ts";
import type { Zone } from "./world.ts";

/** One world record from Traveller Map `/data/{sector}/{hex}`. */
export interface MapWorldRecord {
  Name?: string;
  Hex?: string;
  UWP?: string;
  PBG?: string;
  Zone?: string;
  Bases?: string;
  Allegiance?: string;
  Remarks?: string;
  Sector?: string;
  SubsectorName?: string;
  AllegianceName?: string;
}

export interface ProfilePopulation {
  multiplier: number;
  exponent: number;
  total: string;
}

export interface ProfileRow {
  field: string;
  code: string;
  meaning: string;
}

export interface WorldProfile {
  name: string;
  /** Traveller Map's default milieu. The world endpoint does not name another one. */
  milieu: string;
  sectorHex: string;
  subsector: string;
  allegiance: string;
  zone: Zone;
  zoneLabel: string;
  zoneDetail: string;
  population: ProfilePopulation | null;
  uwp: string;
  rows: ProfileRow[];
  gasGiants: string;
  bases: string;
  tradeCodes: string[];
}

/** Starport letter to the quality shown on the profile. */
const STARPORT: Record<string, string> = {
  A: "Excellent",
  B: "Good",
  C: "Routine",
  D: "Poor",
  E: "Frontier",
  F: "Good",
  G: "Poor",
  H: "Primitive",
  X: "No starport",
  Y: "None",
};

/** Diameter in km and surface gravity, from the Second Survey size table. Size 0 is an asteroid belt. */
const SIZE: Array<{ km: number; gravity: number } | null> = [
  null,
  { km: 1600, gravity: 0.122 },
  { km: 3200, gravity: 0.24 },
  { km: 4800, gravity: 0.377 },
  { km: 6400, gravity: 0.5 },
  { km: 8000, gravity: 0.625 },
  { km: 9600, gravity: 0.84 },
  { km: 11200, gravity: 0.875 },
  { km: 12800, gravity: 1 },
  { km: 14400, gravity: 1.12 },
  { km: 16000, gravity: 1.25 },
  { km: 18800, gravity: 1.375 },
  { km: 19200, gravity: 1.5 },
  { km: 20800, gravity: 1.625 },
  { km: 22400, gravity: 1.75 },
  { km: 24000, gravity: 1.875 },
];

/** Atmosphere digit to the air the profile describes. */
const ATMOSPHERE: Record<string, string> = {
  "0": "None",
  "1": "Trace",
  "2": "Very thin, tainted",
  "3": "Very thin",
  "4": "Thin, tainted",
  "5": "Thin",
  "6": "Standard",
  "7": "Standard, tainted",
  "8": "Dense",
  "9": "Dense, tainted",
  A: "Exotic",
  B: "Corrosive",
  C: "Insidious",
  D: "Dense, high",
  E: "Thin, low",
  F: "Unusual",
};

/** Hydrographics digit to the water the profile describes. */
const HYDROGRAPHICS: Record<string, string> = {
  "0": "Desert World",
  "1": "10% water",
  "2": "20% water",
  "3": "30% water",
  "4": "40% water",
  "5": "50% water",
  "6": "60% water",
  "7": "70% water",
  "8": "80% water",
  "9": "90% water",
  A: "Water World",
};

/** Population digit to the inhabitants the profile describes. */
const POPULATION: Record<string, string> = {
  "0": "None",
  "1": "Tens",
  "2": "Hundreds",
  "3": "Thousands",
  "4": "Tens of thousands",
  "5": "Hundreds of thousands",
  "6": "Millions",
  "7": "Tens of millions",
  "8": "Hundreds of millions",
  "9": "Billions",
  A: "Tens of billions",
  B: "Hundreds of billions",
  C: "Trillions",
  D: "Tens of trillions",
  E: "Hundreds of trillions",
  F: "Quadrillions",
};

/** Government digit to the authority the profile describes. */
const GOVERNMENT: Record<string, string> = {
  "0": "No Government Structure",
  "1": "Company/Corporation",
  "2": "Participating Democracy",
  "3": "Self-Perpetuating Oligarchy",
  "4": "Representative Democracy",
  "5": "Feudal Technocracy",
  "6": "Captive Government / Colony",
  "7": "Balkanization",
  "8": "Civil Service Bureaucracy",
  "9": "Impersonal Bureaucracy",
  A: "Charismatic Dictator",
  B: "Non-Charismatic Dictator",
  C: "Charismatic Oligarchy",
  D: "Religious Dictatorship",
  E: "Religious Autocracy",
  F: "Totalitarian Oligarchy",
  G: "Small Station or Facility",
  H: "Split Clan Control",
  J: "Single On-world Clan Control",
  K: "Single Multi-world Clan Control",
  L: "Major Clan Control",
  M: "Vassal Clan Control",
  N: "Major Vassal Clan Control",
  P: "Small Station or Facility",
  Q: "Krurruna or Krumanak Rule for Off-world Steppelord",
  R: "Steppelord On-world Rule",
  S: "Sept",
  T: "Unsupervised Anarchy",
  U: "Supervised Anarchy",
  W: "Committee",
  X: "Droyne Hierarchy",
};

/** Law digit to the restriction the profile describes. */
const LAW: Record<string, string> = {
  "0": "No prohibitions",
  "1": "Body pistols, explosives, and poison gas prohibited",
  "2": "Portable energy weapons prohibited",
  "3": "Machine guns, automatic rifles prohibited",
  "4": "Light assault weapons prohibited",
  "5": "Personal concealable weapons prohibited",
  "6": "All firearms except shotguns prohibited",
  "7": "Shotguns prohibited",
  "8": "Long bladed weapons controlled; open possession prohibited",
  "9": "Possession of weapons outside the home prohibited",
  A: "Weapon possession prohibited",
  B: "Rigid control of civilian movement",
  C: "Unrestricted invasion of privacy",
  D: "Paramilitary law enforcement",
  E: "Full-fledged police state",
  F: "All facets of daily life regularly legislated and controlled",
  G: "Severe punishment for petty infractions",
  H: "Legalized oppressive practices",
  J: "Routinely oppressive and restrictive",
  K: "Excessively oppressive and restrictive",
  L: "Totally oppressive and restrictive",
  S: "Special/Variable situation",
};

/** Tech digit to the technology the profile describes. */
const TECH: Record<string, string> = {
  "0": "Stone Age",
  "1": "Bronze, Iron",
  "2": "Printing Press",
  "3": "Basic Science",
  "4": "External Combustion",
  "5": "Mass Production",
  "6": "Nuclear Power",
  "7": "Miniaturized Electronics",
  "8": "Quality Computers",
  "9": "Anti-Gravity",
  A: "Interstellar community",
  B: "Lower Average Imperial",
  C: "Average Imperial",
  D: "Above Average Imperial",
  E: "Above Average Imperial",
  F: "Technical Imperial Maximum",
  G: "Robots",
  H: "Artificial Intelligence",
  J: "Personal Disintegrators",
  K: "Plastic Metals",
  L: "Comprehensible only as technological magic",
};

/** Base letter to the base the profile names. */
const BASES: Record<string, string> = {
  C: "Corsair base",
  D: "Naval depot",
  E: "Embassy",
  K: "Naval base",
  M: "Military base",
  N: "Naval base",
  R: "Clan base",
  S: "Scout base",
  T: "Tlaukhu base",
  V: "Exploration base",
  W: "Way station",
};

/** The eight profile digits. An unknown digit is a question mark. */
const UWP_PATTERN = /^([A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?])$/i;

/** The table text for a digit, or a generic unknown when the digit is not in the table. */
function meaning(table: Record<string, string>, code: string): string {
  if (code === "?") return "Unknown";
  return table[code] ?? "Unknown";
}

/** Extended-hex value of one digit, or null for a blank or unknown digit. */
function ehex(char: string | undefined): number | null {
  if (!char || char === "?") return null;
  const value = Number.parseInt(char, 16);
  return Number.isNaN(value) ? null : value;
}

/** Diameter and gravity for a size digit. */
function sizeMeaning(code: string): string {
  const size = ehex(code);
  if (size === null) return "Unknown";
  if (size === 0) return "Asteroid";
  const row = SIZE[size];
  if (!row) return "Unknown";
  return `${row.km.toLocaleString("en-US")}km (${row.gravity.toFixed(2)}g)`;
}

/** Inhabitants from the population digit and the PBG multiplier. */
function population(exponentCode: string, pbg: string): ProfilePopulation | null {
  const exponent = ehex(exponentCode);
  let multiplier = ehex(pbg[0]);
  if (exponent === null || multiplier === null) return null;
  if (multiplier === 0 && exponent > 0) multiplier = 1;
  return {
    multiplier,
    exponent,
    total: (multiplier * 10 ** exponent).toLocaleString("en-US"),
  };
}

/** Base names for the letters stored on the world. */
function bases(raw: string | undefined): string {
  const codes = (raw ?? "").trim().toUpperCase();
  if (!codes) return "None recorded";
  return [...codes].map((code) => BASES[code] ?? code).join(", ");
}

/** Amber, red, or safe, with the sentence the profile shows. */
function zoneCopy(raw: string | undefined): { zone: Zone; zoneLabel: string; zoneDetail: string } {
  const zone = parseZone(raw);
  if (zone === "amber") return { zone, zoneLabel: "Amber", zoneDetail: "Amber — caution advised" };
  if (zone === "red") return { zone, zoneLabel: "Red", zoneDetail: "Red — interdicted" };
  return { zone, zoneLabel: "Safe", zoneDetail: "Safe — no restriction recorded" };
}

/** Allegiance name and code, or a recorded absence. */
function allegiance(name: string | undefined, code: string | undefined): string {
  const title = name?.trim() ?? "";
  const abbreviation = code?.trim() ?? "";
  if (title && abbreviation) return `${title} (${abbreviation})`;
  return title || abbreviation || "None recorded";
}

/** Every digit of the profile is unsurveyed. */
export function isUnknownUwp(uwp: string): boolean {
  return uwp.trim().toUpperCase() === "???????-?";
}

/** Turn one Traveller Map world record into the Astrogation profile. */
export function worldProfile(raw: MapWorldRecord): WorldProfile | null {
  const uwp = (raw.UWP ?? "").trim().toUpperCase();
  const unknown = isUnknownUwp(uwp);
  const name = raw.Name?.trim() || (unknown ? raw.Hex?.trim() || "Unknown" : "");
  if (!name) return null;
  const match = UWP_PATTERN.exec(uwp);
  const code = (index: number) => match?.[index]?.toUpperCase() ?? "";
  const rows: ProfileRow[] = match
    ? [
      { field: "Starport", code: code(1), meaning: meaning(STARPORT, code(1)) },
      { field: "Size", code: code(2), meaning: sizeMeaning(code(2)) },
      { field: "Atmosphere", code: code(3), meaning: meaning(ATMOSPHERE, code(3)) },
      { field: "Hydrographics", code: code(4), meaning: meaning(HYDROGRAPHICS, code(4)) },
      { field: "Population", code: code(5), meaning: meaning(POPULATION, code(5)) },
      { field: "Government", code: code(6), meaning: meaning(GOVERNMENT, code(6)) },
      { field: "Law level", code: code(7), meaning: meaning(LAW, code(7)) },
      { field: "Technology level", code: code(8), meaning: meaning(TECH, code(8)) },
    ]
    : [];
  const giants = ehex((raw.PBG ?? "")[2]);
  const profile: WorldProfile = {
    name,
    milieu: "M1105",
    sectorHex: [raw.Sector?.trim(), raw.Hex?.trim()].filter(Boolean).join(" "),
    subsector: raw.SubsectorName?.trim() || "None recorded",
    allegiance: allegiance(raw.AllegianceName, raw.Allegiance),
    ...zoneCopy(raw.Zone),
    population: match ? population(code(5), raw.PBG ?? "") : null,
    uwp,
    rows,
    gasGiants: giants === null ? "Unknown" : String(giants),
    bases: bases(raw.Bases),
    tradeCodes: tradeCodesFromRemarks(raw.Remarks ?? ""),
  };
  if (!unknown) return profile;
  return {
    ...profile,
    subsector: "Unknown",
    allegiance: "Unknown",
    zone: "green",
    zoneLabel: "Unknown",
    zoneDetail: "Unknown",
    population: null,
    rows: profile.rows.map((row) => ({ ...row, meaning: "Unknown" })),
    gasGiants: "Unknown",
    bases: "Unknown",
    tradeCodes: [],
  };
}
