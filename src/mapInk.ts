/** White paper and black ink trade places. Every other color stays as drawn. */
export function mapInk(color: string, dark: boolean): string {
  if (!dark) return color;
  const value = normalize(color);
  if (value === "#ffffff") return "#000000";
  if (value === "#000000" || value === "#111111") return "#ffffff";
  return color;
}

/** The host page's color scheme, so a dark page opens on the dark map. */
export function hostPrefersDarkMap(): boolean {
  if (typeof document === "undefined") return false;
  const tokens = getComputedStyle(document.documentElement).colorScheme.toLowerCase().split(/\s+/).filter(Boolean);
  const dark = tokens.includes("dark");
  const light = tokens.includes("light");
  if (dark !== light) return dark;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** A CSS color as #rrggbb, or null when it is not white, black, or hex. */
function normalize(color: string): string | null {
  const text = color.trim().toLowerCase();
  if (text === "white") return "#ffffff";
  if (text === "black") return "#000000";
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (!match) return null;
  const digits = match[1];
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return `#${full}`;
}
