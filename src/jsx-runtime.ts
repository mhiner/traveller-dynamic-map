import { fragment, jsx, jsxs } from "./runtime.ts";

export { fragment as Fragment, jsx, jsxs };

type DomEvent<T extends EventTarget, E extends Event> = E & { currentTarget: T };

interface Common<T extends EventTarget> {
  children?: unknown;
  key?: string | number;
  className?: string;
  hidden?: boolean;
  id?: string;
  role?: string;
  title?: string;
  tabIndex?: number;
  style?: Record<string, string | number>;
  ref?: { current: T | null } | ((instance: T | null) => void) | null;
  "aria-label"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-pressed"?: boolean | "true" | "false" | "mixed";
  "aria-expanded"?: boolean | "true" | "false";
  "aria-current"?: boolean | "page" | "step" | "location" | "date" | "time" | "true" | "false";
  onClick?: (event: DomEvent<T, MouseEvent>) => void;
  onMouseDown?: (event: DomEvent<T, MouseEvent>) => void;
  onMouseEnter?: (event: DomEvent<T, MouseEvent>) => void;
  onMouseLeave?: (event: DomEvent<T, MouseEvent>) => void;
  onPointerDown?: (event: DomEvent<T, PointerEvent>) => void;
  onPointerMove?: (event: DomEvent<T, PointerEvent>) => void;
  onPointerUp?: (event: DomEvent<T, PointerEvent>) => void;
  onChange?: (event: DomEvent<T, Event>) => void;
  onBlur?: (event: DomEvent<T, FocusEvent>) => void;
  onToggle?: (event: DomEvent<T, Event>) => void;
}

interface InputAttrs extends Common<HTMLInputElement> {
  type?: string;
  name?: string;
  value?: string | number | readonly string[];
  checked?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  placeholder?: string;
}

interface SelectAttrs extends Common<HTMLSelectElement> {
  value?: string | number | readonly string[];
  disabled?: boolean;
  name?: string;
}

interface ButtonAttrs extends Common<HTMLButtonElement> {
  type?: string;
  disabled?: boolean;
}

interface OptionAttrs extends Common<HTMLOptionElement> {
  value?: string | number;
  selected?: boolean;
  disabled?: boolean;
}

interface DetailsAttrs extends Common<HTMLDetailsElement> {
  open?: boolean;
}

interface SvgAttrs extends Common<SVGSVGElement> {
  viewBox?: string;
  width?: string | number;
  height?: string | number;
  preserveAspectRatio?: string;
}

interface PathAttrs extends Common<SVGPathElement> {
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  strokeLinecap?: "butt" | "round" | "square" | "inherit";
  strokeLinejoin?: "miter" | "round" | "bevel" | "inherit";
  strokeDasharray?: string;
}

interface ShapeAttrs extends Common<SVGElement> {
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  strokeLinejoin?: "miter" | "round" | "bevel" | "inherit";
  points?: string;
  cx?: number | string;
  cy?: number | string;
  r?: number | string;
  transform?: string;
}

interface TextAttrs extends Common<SVGTextElement> {
  x?: number | string;
  y?: number | string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  dy?: number | string;
}

interface ImageAttrs extends Common<SVGImageElement> {
  href?: string;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
}

interface PatternAttrs extends Common<SVGPatternElement> {
  width?: number | string;
  height?: number | string;
  patternUnits?: "userSpaceOnUse" | "objectBoundingBox";
}

// TypeScript requires this namespace name for the JSX automatic runtime.
// deno-lint-ignore no-namespace
export namespace JSX {
  export interface IntrinsicAttributes {
    key?: string | number;
  }
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export interface IntrinsicElements {
    button: ButtonAttrs;
    circle: ShapeAttrs;
    dd: Common<HTMLElement>;
    details: DetailsAttrs;
    div: Common<HTMLDivElement>;
    dl: Common<HTMLDListElement>;
    dt: Common<HTMLElement>;
    g: ShapeAttrs;
    h2: Common<HTMLHeadingElement>;
    h3: Common<HTMLHeadingElement>;
    header: Common<HTMLElement>;
    image: ImageAttrs;
    input: InputAttrs;
    label: Common<HTMLLabelElement>;
    li: Common<HTMLLIElement>;
    ol: Common<HTMLOListElement>;
    option: OptionAttrs;
    p: Common<HTMLParagraphElement>;
    defs: Common<SVGDefsElement>;
    path: PathAttrs;
    pattern: PatternAttrs;
    polygon: ShapeAttrs;
    section: Common<HTMLElement>;
    select: SelectAttrs;
    span: Common<HTMLSpanElement>;
    summary: Common<HTMLElement>;
    sup: Common<HTMLElement>;
    svg: SvgAttrs;
    table: Common<HTMLTableElement>;
    tbody: Common<HTMLTableSectionElement>;
    td: Common<HTMLTableCellElement>;
    text: TextAttrs;
    tspan: TextAttrs;
    th: Common<HTMLTableCellElement>;
    thead: Common<HTMLTableSectionElement>;
    tr: Common<HTMLTableRowElement>;
    ul: Common<HTMLUListElement>;
  }
}
