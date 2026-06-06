// RisBo.js — Reactivity core
// -----------------------------------------------------------------------------
// A small, fine-grained reactive system: signals (state), computeds (derived
// values) and effects (side effects). Updates are synchronous, batched and
// glitch-free for the common cases. There are zero runtime dependencies.
//
//   const count = signal(0);
//   const double = computed(() => count() * 2);
//   effect(() => console.log(double()));   // logs 0
//   count.set(5);                           // logs 10
// -----------------------------------------------------------------------------

const CLEAN = 0;
const DIRTY = 1;

// The computation currently collecting dependencies (for tracking reads).
let Listener = null;
// The owner scope that new computations/cleanups attach to (for disposal).
let Owner = null;
// When inside a batch, scheduled effects are collected here and flushed once.
let BatchQueue = null;

// -----------------------------------------------------------------------------
// Scopes & disposal
// -----------------------------------------------------------------------------

class Scope {
  constructor() {
    this.owner = Owner;
    this.children = null; // Set<Scope> of nested scopes/computations
    this.cleanups = null; // Array<fn> run on disposal / re-run
    if (Owner) (Owner.children ??= new Set()).add(this);
  }
}

function cleanNode(node) {
  if (node.children) {
    for (const child of [...node.children]) disposeNode(child);
    node.children = null;
  }
  if (node.cleanups) {
    for (let i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
    node.cleanups = null;
  }
  removeSources(node);
}

function disposeNode(node) {
  cleanNode(node);
  if (node.owner && node.owner.children) node.owner.children.delete(node);
  node.disposed = true;
}

function removeSources(node) {
  if (node.sources) {
    for (const source of node.sources) source.observers.delete(node);
    node.sources.clear();
  }
}

// -----------------------------------------------------------------------------
// Dependency tracking & propagation
// -----------------------------------------------------------------------------

function track(source) {
  if (Listener) {
    source.observers.add(Listener);
    (Listener.sources ??= new Set()).add(source);
  }
}

function notify(source) {
  for (const observer of source.observers) {
    if (observer === Listener) continue; // ignore self-writes during a run
    if (observer.computed) {
      if (observer.state !== DIRTY) {
        observer.state = DIRTY;
        notify(observer); // propagate through derived values
      }
    } else if (BatchQueue) {
      BatchQueue.add(observer);
    } else {
      observer.run();
    }
  }
}

// -----------------------------------------------------------------------------
// Signal — a writable reactive value
// -----------------------------------------------------------------------------

class Signal {
  constructor(value, equals) {
    this.value = value;
    this.equals = equals;
    this.observers = new Set();
  }
  read() {
    track(this);
    return this.value;
  }
  write(value) {
    if (this.equals && this.equals(this.value, value)) return value;
    this.value = value;
    batch(() => notify(this));
    return value;
  }
}

// -----------------------------------------------------------------------------
// Computation — backs both effects and computeds
// -----------------------------------------------------------------------------

class Computation extends Scope {
  constructor(fn, value, computed) {
    super();
    this.fn = fn;
    this.value = value;
    this.computed = computed;
    this.state = DIRTY;
    this.sources = null;
    if (computed) {
      this.observers = new Set();
      this.equals = Object.is;
    }
  }

  run() {
    if (this.disposed) return this.value;
    cleanNode(this);
    const prevListener = Listener;
    const prevOwner = Owner;
    Listener = this;
    Owner = this;
    try {
      this.value = this.fn(this.value);
    } finally {
      Listener = prevListener;
      Owner = prevOwner;
    }
    return this.value;
  }

  read() {
    if (this.state === DIRTY && !this.disposed) {
      const prev = this.value;
      this.state = CLEAN;
      this.run();
      // If our value is unchanged, downstream effects already scheduled will
      // simply read the same value — correct, if occasionally over-eager.
      void prev;
    }
    track(this);
    return this.value;
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Create a writable reactive value.
 * @template T
 * @param {T} value initial value
 * @param {{ equals?: (a:T,b:T)=>boolean | false }} [options]
 * @returns {(() => T) & { set(v:T):T, update(fn:(v:T)=>T):T, peek():T }}
 */
export function signal(value, options = {}) {
  const equals = options.equals === false ? null : options.equals || Object.is;
  const node = new Signal(value, equals);
  const accessor = () => node.read();
  accessor.set = (next) =>
    node.write(typeof next === "function" ? next(node.value) : next);
  accessor.update = (fn) => node.write(fn(node.value));
  accessor.peek = () => node.value;
  return accessor;
}

/**
 * Create a memoized derived value. Recomputes lazily when its dependencies
 * change and caches the result.
 * @template T
 * @param {() => T} fn
 * @param {{ equals?: (a:T,b:T)=>boolean }} [options]
 * @returns {(() => T) & { peek():T }}
 */
export function computed(fn, options = {}) {
  const node = new Computation(fn, undefined, true);
  if (options.equals) node.equals = options.equals;
  const accessor = () => node.read();
  accessor.peek = () => {
    if (node.state === DIRTY) {
      node.state = CLEAN;
      node.run();
    }
    return node.value;
  };
  return accessor;
}

/**
 * Run a side effect immediately and re-run it whenever any reactive value it
 * read changes. Return a cleanup function from `fn` or use `onCleanup`.
 * @param {(prev:any) => any} fn
 * @returns {() => void} stop the effect
 */
export function effect(fn, value) {
  const node = new Computation(
    (prev) => {
      const result = fn(prev);
      // A returned function is treated as a cleanup, leaving `prev` unchanged;
      // any other value becomes the `prev` passed to the next run.
      if (typeof result === "function") {
        onCleanup(result);
        return prev;
      }
      return result;
    },
    value,
    false
  );
  node.run();
  return () => disposeNode(node);
}

/**
 * Group multiple writes so dependent effects run only once afterwards.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function batch(fn) {
  if (BatchQueue) return fn();
  const queue = (BatchQueue = new Set());
  try {
    return fn();
  } finally {
    BatchQueue = null;
    for (const effectNode of queue) effectNode.run();
  }
}

/**
 * Read reactive values without subscribing to them.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function untrack(fn) {
  const prev = Listener;
  Listener = null;
  try {
    return fn();
  } finally {
    Listener = prev;
  }
}

/**
 * Build an effect/computed body that only tracks the given dependencies, and
 * runs `fn` untracked with their values. Use with `effect`/`computed`:
 *   effect(on(count, (value, prev) => console.log(value, prev)));
 *   effect(on([a, b], ([av, bv]) => …, { defer: true })); // skip first run
 * @param {Function|Function[]} deps
 * @param {(values:any, prev:any) => any} fn
 * @param {{ defer?: boolean }} [options]
 */
export function on(deps, fn, options = {}) {
  const list = Array.isArray(deps) ? deps : [deps];
  let deferred = options.defer === true;
  return (prev) => {
    const values = list.map((dep) => dep());
    const value = list.length === 1 ? values[0] : values;
    if (deferred) {
      deferred = false;
      return prev;
    }
    return untrack(() => fn(value, prev));
  };
}

/**
 * Register a callback to run when the surrounding scope is disposed or re-run.
 * @param {() => void} fn
 */
export function onCleanup(fn) {
  if (Owner) (Owner.cleanups ??= []).push(fn);
  return fn;
}

/**
 * Create a disposal boundary that is detached from any parent owner. The
 * provided `dispose` function tears down everything created inside.
 * @template T
 * @param {(dispose: () => void) => T} fn
 * @returns {T}
 */
export function createRoot(fn) {
  const prevOwner = Owner;
  const prevListener = Listener;
  Owner = null; // detach so disposal is explicit
  const root = new Scope();
  Owner = root;
  Listener = null;
  try {
    return fn(() => disposeNode(root));
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
  }
}

/** @returns {Scope|null} the current owner scope */
export function getOwner() {
  return Owner;
}

/**
 * Run `fn` with a specific owner scope active. Useful when deferring work.
 * @template T
 * @param {Scope|null} owner
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithOwner(owner, fn) {
  const prevOwner = Owner;
  const prevListener = Listener;
  Owner = owner;
  Listener = null;
  try {
    return fn();
  } finally {
    Owner = prevOwner;
    Listener = prevListener;
  }
}

/** Internal: create a child scope attached to a given owner. */
export function createChildScope(owner) {
  const prevOwner = Owner;
  Owner = owner;
  const scope = new Scope();
  Owner = prevOwner;
  return scope;
}

/** Internal: dispose a scope created via {@link createChildScope}. */
export function disposeScope(scope) {
  disposeNode(scope);
}

// -----------------------------------------------------------------------------
// Memo — an alias for `computed`, for those who prefer the name.
// -----------------------------------------------------------------------------

export { computed as createMemo };

// -----------------------------------------------------------------------------
// Context — dependency injection along the owner tree
// -----------------------------------------------------------------------------

/**
 * Create a context with a default value.
 *   const Theme = createContext("light");
 *   Theme.provide("dark", () => h(App));   // inside: useContext(Theme) === "dark"
 * @template T
 * @param {T} defaultValue
 */
export function createContext(defaultValue) {
  const context = { id: Symbol("context"), defaultValue };
  context.provide = (value, fn) => provideContext(context, value, fn);
  return context;
}

/**
 * Read the nearest provided value for a context (or its default).
 * @template T
 * @param {{ id: symbol, defaultValue: T }} context
 * @returns {T}
 */
export function useContext(context) {
  let owner = Owner;
  while (owner) {
    if (owner.contexts && context.id in owner.contexts) return owner.contexts[context.id];
    owner = owner.owner;
  }
  return context.defaultValue;
}

/**
 * Provide a context value to everything created synchronously inside `fn`.
 * @template T
 * @param {{ id: symbol }} context
 * @param {*} value
 * @param {() => T} fn
 * @returns {T}
 */
export function provideContext(context, value, fn) {
  const prevOwner = Owner;
  const scope = new Scope();
  scope.contexts = { ...(prevOwner && prevOwner.contexts), [context.id]: value };
  Owner = scope;
  try {
    return fn();
  } finally {
    Owner = prevOwner;
  }
}

// -----------------------------------------------------------------------------
// Resource — reactive async data
// -----------------------------------------------------------------------------

/**
 * Track an async source. Re-fetches when the reactive `source` changes and
 * exposes loading / error state.
 *
 *   const user = resource(() => userId(), (id) => fetch(`/u/${id}`).then(r => r.json()));
 *   user();          // latest value (undefined until resolved)
 *   user.loading();  // boolean
 *   user.error();    // any thrown/rejected error
 *   user.refetch();  // force a reload
 *
 * `resource(fetcher)` (no source) fetches once on creation.
 * @template T, S
 * @param {(() => S) | ((s: S) => Promise<T>)} source
 * @param {(s: S) => Promise<T> | T} [fetcher]
 * @param {{ initialValue?: T }} [options]
 */
export function resource(source, fetcher, options = {}) {
  if (typeof fetcher !== "function") {
    fetcher = source;
    source = () => undefined;
  }
  const read = typeof source === "function" ? source : () => source;

  const data = signal(options.initialValue);
  const loading = signal(false);
  const error = signal(undefined);
  let version = 0;

  const load = (input) => {
    const current = ++version;
    loading.set(true);
    error.set(undefined);
    // Run the fetcher eagerly but untracked, so its internal reads don't
    // subscribe the resource's effect.
    Promise.resolve(untrack(() => fetcher(input))).then(
        (value) => {
          if (current !== version) return;
          batch(() => {
            data.update(() => value); // store literally (value may be a function)
            loading.set(false);
          });
        },
        (err) => {
          if (current !== version) return;
          batch(() => {
            error.set(err);
            loading.set(false);
          });
        }
      );
  };

  effect(() => load(read()));

  const accessor = () => data();
  accessor.loading = () => loading();
  accessor.error = () => error();
  accessor.latest = () => data();
  accessor.mutate = (value) => data.update(() => value);
  accessor.refetch = () => load(untrack(read));
  return accessor;
}
