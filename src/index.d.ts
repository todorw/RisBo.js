
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
export function createMemo<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Computed<T>;

/** Run a side effect and re-run it when its dependencies change. The callback
 *  receives the previous return value; returning a function registers cleanup. */
export function effect<T>(fn: (prev: T | undefined) => T | void | (() => void), value?: T): () => void;

/** Build an effect/computed body that tracks only the listed dependencies. */
export function on<T, R>(
  deps: (() => T) | Array<() => any>,
  fn: (value: T | any[], prev: R | undefined) => R,
  options?: { defer?: boolean }
): (prev: R | undefined) => R;

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

// Context
export interface Context<T> {
  id: symbol;
  defaultValue: T;
  provide<R>(value: T, fn: () => R): R;
}
export function createContext<T>(defaultValue: T): Context<T>;
export function useContext<T>(context: Context<T>): T;
export function provideContext<T, R>(context: Context<T>, value: T, fn: () => R): R;

// Resource — reactive async data
export interface Resource<T> {
  (): T | undefined;
  loading(): boolean;
  error(): unknown;
  latest(): T | undefined;
  mutate(value: T | undefined): void;
  refetch(): void;
}
export function resource<T>(fetcher: () => Promise<T> | T, options?: { initialValue?: T }): Resource<T>;
export function resource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T> | T,
  options?: { initialValue?: T }
): Resource<T>;

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

export function Index<T>(props: {
  each: T[] | (() => T[]);
  children?: (item: () => T, index: number) => Node | Child;
  render?: (item: () => T, index: number) => Node | Child;
}): Node;

export function Dynamic<P>(props: { component: ((props: P) => Child) | (() => (props: P) => Child) } & P): Child;

export function ErrorBoundary(props: {
  fallback: Child | ((error: any, reset: () => void) => Child);
  children?: Child | (() => Child);
}): Child;

export function Portal(props: { mount?: Element; children?: Child }): Node;

/** Defer loading a component until it renders (code-splitting). */
export function lazy<P>(
  loader: () => Promise<{ default: (props: P) => Child } | ((props: P) => Child)>
): (props: P & { fallback?: Child | (() => Child) }) => Child;

/** Shallow-merge prop objects (later sources win). */
export function mergeProps(...sources: Array<Record<string, unknown> | null | undefined>): Record<string, unknown>;

/** Split a props object into groups by key, returning each group plus the rest. */
export function splitProps<T extends Record<string, unknown>>(
  props: T,
  ...keyGroups: Array<Array<keyof T>>
): Record<string, unknown>[];

// Two-way binding helpers
export function model(sig: Signal<string>): { value: () => string; "on:input": (e: any) => void };
export function modelChecked(sig: Signal<boolean>): { checked: () => boolean; "on:change": (e: any) => void };

// Server-side rendering
export function renderToString(component: ((props?: any) => Child) | Node): string;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface Route {
  path: string;
  component: (props: {
    params: Record<string, string>;
    query: Record<string, string>;
    navigate: Navigate;
  }) => Child;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

export type Navigate = (to: string, options?: { replace?: boolean }) => void;

export function matchRoute(routes: Route[], path: string): RouteMatch | null;

export interface Router {
  path: Signal<string>;
  pathname: Computed<string>;
  navigate: Navigate;
  matched: Computed<RouteMatch | null>;
  params: Computed<Record<string, string>>;
  query: Computed<Record<string, string>>;
  View: () => Child;
  /** Remove the router's `popstate` listener. */
  dispose: () => void;
  Link: (props: {
    href: string;
    children?: Child;
    class?: string;
    activeClass?: string;
    end?: boolean;
    [key: string]: unknown;
  }) => Node;
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
