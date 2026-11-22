export interface MapJsxRuntime {
  // The host's vnode type stays unnamed so this package does not depend on Preact.
  // deno-lint-ignore no-explicit-any
  jsx: (type: any, props: any, key?: any) => any;
  // deno-lint-ignore no-explicit-any
  jsxs: (type: any, props: any, key?: any) => any;
  // deno-lint-ignore no-explicit-any
  Fragment: any;
}

export interface MapHooks {
  useState: <T>(initial: T | (() => T)) => [T, (value: T | ((prev: T) => T)) => void];
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useRef: <T>(initial: T) => { current: T };
}

interface Installed {
  jsxRuntime: MapJsxRuntime;
  hooks: MapHooks;
}

/** The host JSX runtime and hooks. Empty until createMap runs. */
let installed: Installed | null = null;

/** Stand-in for the host Fragment, so this package does not import Preact. */
export const fragment = Symbol("map.fragment");

/** Remember the host JSX runtime and hooks. */
export function installMapRuntime(jsxRuntime: MapJsxRuntime, hooks: MapHooks): void {
  installed = { jsxRuntime, hooks };
}

/** The installed host runtime. Rendering before createMap fails here. */
function runtime(): Installed {
  if (!installed) throw new Error("Call createMap() with the host Preact runtime before rendering.");
  return installed;
}

/** The host Fragment for this package's fragment symbol. */
function hostType(type: unknown): unknown {
  return type === fragment ? runtime().jsxRuntime.Fragment : type;
}

/** Host jsx. This package's fragment symbol becomes the host Fragment. */
// deno-lint-ignore no-explicit-any
export function jsx(type: any, props: any, key?: any): any {
  const jsxRuntime = runtime().jsxRuntime;
  return jsxRuntime.jsx(hostType(type), props, key);
}

/** Host jsxs. This package's fragment symbol becomes the host Fragment. */
// deno-lint-ignore no-explicit-any
export function jsxs(type: any, props: any, key?: any): any {
  const jsxRuntime = runtime().jsxRuntime;
  return jsxRuntime.jsxs(hostType(type), props, key);
}

/** The host useState. */
export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] {
  return runtime().hooks.useState(initial);
}

/** The host useEffect. */
export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void {
  runtime().hooks.useEffect(effect, deps);
}

/** The host useRef. */
export function useRef<T>(initial: T): { current: T } {
  return runtime().hooks.useRef(initial);
}
