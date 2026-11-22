/** Traveller Map OTU border colors. A sector stylesheet overrides these. */
const OTU_BORDERS = `
border.ImDa, border.ImDc, border.ImDd, border.ImDg, border.ImDi, border.ImDs, border.ImDv,
border.Im { color: #E32736; }
border.ImLa, border.ImSy, border.ImLc, border.ImAp, border.ImLu, border.ImVd { color: blue; }
border.SoCf { color: orange; }
border.SoNS, border.SoRD, border.SoWu { color: blue; }
border.ZhCa, border.ZhCh, border.ZhCo, border.ZhIa, border.ZhIN,
border.ZhJp, border.ZhMe, border.ZhOb, border.ZhSh, border.ZhVQ,
border.Zh { color: blue }
border.As, border.AsXX { color: yellow }
border.HvFd { color: purple }
border.KkTw,
border.Kk { color: green }
border.JuPr { color: blue }
border.JAOz { color: teal }
border.JAsi { color: lightblue }
border.JCoK { color: cyan }
border.JHhk { color: lightblue }
border.JLum { color: cyan }
border.JMen { color: teal }
border.JPSt { color: aquamarine }
border.JRar { color: olivedrab }
border.JUkh { color: teal }
border.JVug { color: lightblue }
border.JuHl { color: steelblue }
border.JuRu { color: cyan }
`;

/** CSS color keywords used by sector stylesheets. */
const NAMED: Record<string, string> = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
};

export type LineDash = "solid" | "dashed" | "dotted" | "none";

interface Selector {
  element: string;
  code: string | null;
}

interface Declaration {
  property: string;
  value: string;
}

interface Rule {
  selectors: Selector[];
  declarations: Declaration[];
}

export interface StyleSheet {
  parent: StyleSheet | null;
  rules: Rule[];
}

/** `#RRGGBB` or a CSS color keyword. */
export function cssColor(value: string | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const hex = /^#([0-9a-fA-F]{6})$/.exec(text);
  if (hex) return `#${hex[1].toLowerCase()}`;
  return NAMED[text.toLowerCase()] ?? null;
}

/** Reads one sector stylesheet. A broken sheet is rejected by the caller. */
class StyleParser {
  private index = 0;

  /** Read from the start of the sheet. */
  constructor(private source: string) {}

  /** Every rule in the sheet. */
  parse(): Rule[] {
    const rules: Rule[] = [];
    this.space();
    while (this.index < this.source.length) {
      const rule = this.rule();
      if (!rule) break;
      rules.push(rule);
      this.space();
    }
    if (this.index < this.source.length) throw new Error("Unrecognized stylesheet text");
    return rules;
  }

  /** One rule, or null at a blank spot. */
  private rule(): Rule | null {
    const selectors = this.selectors();
    if (!selectors) return null;
    return { selectors, declarations: this.declarations() };
  }

  /** The selectors before a declaration block. */
  private selectors(): Selector[] | null {
    const first = this.selector();
    if (!first) return null;
    const selectors = [first];
    this.space();
    while (this.peek() === ",") {
      this.index += 1;
      this.space();
      const next = this.selector();
      if (!next) throw new Error("Expected a selector");
      selectors.push(next);
      this.space();
    }
    return selectors;
  }

  /** One element, optionally with an allegiance code. */
  private selector(): Selector | null {
    const element = this.ident();
    if (!element) return null;
    if (this.peek() !== ".") return { element, code: null };
    this.index += 1;
    const code = this.ident();
    if (!code) throw new Error("Expected an allegiance");
    return { element, code };
  }

  /** The declarations inside a block. */
  private declarations(): Declaration[] {
    this.expect("{");
    this.space();
    const declarations: Declaration[] = [];
    const first = this.declaration();
    if (first) declarations.push(first);
    while (this.peek() === ";") {
      this.index += 1;
      this.space();
      const next = this.declaration();
      if (next) declarations.push(next);
    }
    this.expect("}");
    this.space();
    return declarations;
  }

  /** One property and its value. */
  private declaration(): Declaration | null {
    const property = this.ident();
    if (!property) return null;
    this.space();
    this.expect(":");
    this.space();
    const value = this.value();
    if (!value) throw new Error("Expected a style value");
    this.space();
    return { property, value };
  }

  /** The text of a declaration value. */
  private value(): string | null {
    return this.ident() ?? this.number() ?? this.color();
  }

  /** An identifier, number, or color. */
  private ident(): string | null {
    const start = this.peek();
    if (!start || !/[A-Za-z_]/.test(start)) return null;
    let text = this.source[this.index];
    this.index += 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === "\\") {
        this.index += 1;
        if (this.index >= this.source.length) throw new Error("Dangling escape");
        text += this.source[this.index];
        this.index += 1;
        continue;
      }
      if (!/[A-Za-z0-9_]/.test(char)) break;
      text += char;
      this.index += 1;
    }
    return text;
  }

  /** A numeric token. */
  private number(): string | null {
    const start = this.peek();
    if (start !== "-" && (start < "0" || start > "9")) return null;
    const from = this.index;
    if (this.peek() === "-") this.index += 1;
    if (this.peek() < "0" || this.peek() > "9") throw new Error("Expected a digit");
    while (this.peek() >= "0" && this.peek() <= "9") this.index += 1;
    if (this.peek() === ".") {
      this.index += 1;
      if (this.peek() < "0" || this.peek() > "9") throw new Error("Expected a digit");
      while (this.peek() >= "0" && this.peek() <= "9") this.index += 1;
    }
    if (this.peek() === "e" || this.peek() === "E") {
      this.index += 1;
      if (this.peek() === "+" || this.peek() === "-") this.index += 1;
      if (this.peek() < "0" || this.peek() > "9") throw new Error("Expected a digit");
      while (this.peek() >= "0" && this.peek() <= "9") this.index += 1;
    }
    return this.source.slice(from, this.index);
  }

  /** A #rgb or #rrggbb token. */
  private color(): string | null {
    if (this.peek() !== "#") return null;
    const from = this.index;
    this.index += 1;
    for (let count = 0; count < 6; count += 1) {
      const char = this.peek();
      if (!/[0-9A-Fa-f]/.test(char)) throw new Error("Expected a hex digit");
      this.index += 1;
    }
    return this.source.slice(from, this.index);
  }

  /** Skip whitespace and comments. */
  private space(): void {
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        this.index += 1;
        continue;
      }
      if (char === "/" && this.source[this.index + 1] === "*") {
        this.index += 2;
        while (this.index < this.source.length && !(this.source[this.index] === "*" && this.source[this.index + 1] === "/")) {
          this.index += 1;
        }
        this.index += 2;
        continue;
      }
      return;
    }
  }

  /** The next character, or an empty string at the end. */
  private peek(): string {
    return this.source[this.index] ?? "";
  }

  /** Require the next character. */
  private expect(char: string): void {
    if (this.peek() !== char) throw new Error(`Expected ${char}`);
    this.index += 1;
  }
}

/** Rules from one stylesheet, with an optional parent sheet underneath. */
export function parseStyleSheet(source: string, parent: StyleSheet | null = null): StyleSheet {
  return { parent, rules: new StyleParser(source).parse() };
}

/** The OTU border colors, used when a sector has no stylesheet or the sheet does not parse. */
const DEFAULT_STYLE = parseStyleSheet(OTU_BORDERS);

/** Sector rules sit on top of the OTU border colors. A broken sheet keeps the defaults. */
export function sectorStyle(source: string | undefined): StyleSheet {
  const text = source?.trim();
  if (!text) return DEFAULT_STYLE;
  try {
    return parseStyleSheet(text, DEFAULT_STYLE);
  } catch {
    return DEFAULT_STYLE;
  }
}

/** Declarations for one element and allegiance. A matching code beats a code-less rule. A child sheet beats its parent. */
function lookup(sheet: StyleSheet, element: string, code: string | null): Record<string, string> {
  const found = new Map<string, { rank: number; value: string }>();
  const chain: StyleSheet[] = [];
  for (let current: StyleSheet | null = sheet; current; current = current.parent) chain.unshift(current);
  for (const layer of chain) {
    for (const rule of layer.rules) {
      for (const selector of rule.selectors) {
        if (selector.element !== element) continue;
        const rank = selector.code === null ? 1 : selector.code === code ? 2 : 0;
        if (rank === 0) continue;
        for (const declaration of rule.declarations) {
          const key = declaration.property.toLowerCase();
          const current = found.get(key);
          if (!current || rank >= current.rank) found.set(key, { rank, value: declaration.value });
        }
      }
    }
  }
  const result: Record<string, string> = {};
  for (const [key, row] of found) result[key] = row.value;
  return result;
}

/** A stroke style the map draws, or null when the text is not one. */
function lineDash(value: string | undefined): LineDash | null {
  const name = value?.trim().toLowerCase();
  if (name === "solid" || name === "dashed" || name === "dotted" || name === "none") return name;
  return null;
}

/** Color and stroke from the border element, then its stylesheet, then black. */
export function borderPaint(
  border: { Allegiance?: string; Color?: string; Style?: string },
  sheet: StyleSheet,
): { color: string; dash: LineDash } {
  const styled = lookup(sheet, "border", border.Allegiance?.trim() || null);
  return {
    color: cssColor(border.Color) ?? cssColor(styled.color) ?? "#000000",
    dash: lineDash(border.Style) ?? lineDash(styled.style) ?? "solid",
  };
}
