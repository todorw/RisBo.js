
export declare const version: string;

export interface Signal<T> {
  (): T;
  set(value: T | ((prev: T) => T)): T;
  update(fn: (prev: T) => T): T;
  peek(): T;
}

export interface Computed<T> {
  (): T;
  peek(): T;
}

export interface SignalOptions<T> {
  /** Custom equality check, or `false` to always notify. */
  equals?: ((a: T, b: T) => boolean) | false;
}

export function signal<T>(value: T, options?: SignalOptions<T>): Signal<T>;
export function signal<T = undefined>(): Signal<T | undefined>;

export function computed<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Computed<T>;

/** Run a side effect and re-run it when its dependencies change. */
export function effect(fn: () => void | (() => void)): () => void;

/** Batch multiple writes so dependents update once. */
export function batch<T>(fn: () => T): T;

/** Read reactive values without subscribing. */
export function untrack<T>(fn: () => T): T;

/** Register a callback for when the current scope is disposed/re-run. */
export function onCleanup(fn: () => void): () => void;

/** Create an explicit disposal boundary. */
export function createRoot<T>(fn: (dispose: () => void) => T): T;

export function getOwner(): unknown;
export function runWithOwner<T>(owner: unknown, fn: () => T): T;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => Child)
  | Child[];

export type Props = Record<string, unknown> & { children?: Child };

export const Fragment: unique symbol;

export function h(type: string, props?: Props | null, ...children: Child[]): Node;
export function h<P>(type: (props: P) => Node | Child, props?: P | null, ...children: Child[]): Node | Child;
export function h(type: typeof Fragment, props?: Props | null, ...children: Child[]): Child;

/** Mount a component or node into a container. Returns a disposer. */
export function render(component: ((props?: any) => Child) | Node, container: Element): () => void;

export function insert(parent: Node, value: Child, before?: Node | null): void;
export function createComponent<P>(component: (props: P) => Child, props: P): Child;

/** Run after the current render is committed. */
export function onMount(fn: () => void): void;

// Control flow
export function Show(props: {
  when: unknown | (() => unknown);
  fallback?: Child | (() => Child);
  children?: Child | (() => Child);
}): Child;

export function Switch(props: { fallback?: Child | (() => Child); children?: any }): Child;
export function Match(props: { when: unknown | (() => unknown); children?: Child | (() => Child) }): unknown;

export function For<T>(props: {
  each: T[] | (() => T[]);
  by?: (item: T, index: number) => unknown;
  children?: (item: T, index: number) => Node | Child;
  render?: (item: T, index: number) => Node | Child;
}): Node;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface Route {
  path: string;
  component: (props: { params: Record<string, string>; navigate: Navigate }) => Child;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

export type Navigate = (to: string, options?: { replace?: boolean }) => void;

export function matchRoute(routes: Route[], path: string): RouteMatch | null;

export interface Router {
  path: Signal<string>;
  navigate: Navigate;
  matched: Computed<RouteMatch | null>;
  View: () => Child;
  Link: (props: { href: string; children?: Child; [key: string]: unknown }) => Node;
}

export function createRouter(
  routes: Route[],
  options?: { fallback?: () => Child; base?: string }
): Router;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function createStore<S extends object, A extends Record<string, (...args: any[]) => any>>(
  initial: S,
  actions?: A
): S & { [K in keyof A]: A[K] extends (s: any, ...args: infer P) => any ? (...args: P) => void : never };
