import {
  signal,
  effect,
  untrack,
  onCleanup,
  createRoot,
  getOwner,
  createChildScope,
  disposeScope,
  runWithOwner,
  resource,
} from "./reactivity.js";

/** Marker used to group children without a wrapper element. */
export const Fragment = Symbol("RisBo.Fragment");

/**
 * Hyperscript factory. Also usable as a JSX pragma (`/** @jsx h *\/`).
 * @param {string|Function|symbol} type element tag, component, or Fragment
 * @param {object|null} props
 * @param  {...any} children
 */
export function h(type, props, ...children) {
  props = props || {};
  if (children.length) {
    props = { ...props, children: children.length === 1 ? children[0] : children };
  }
  if (type === Fragment) return props.children;
  if (typeof type === "function") return createComponent(type, props);
  return createElement(type, props);
}

/** Render a component (a plain function) inside its own tracking boundary. */
export function createComponent(Component, props) {
  return untrack(() => Component(props));
}

function createElement(tag, props) {
  const el = document.createElement(tag);
  for (const key in props) {
    if (key === "children") continue;
    setProp(el, key, props[key]);
  }
  if ("children" in props) insert(el, props.children, null);
  return el;
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

function setProp(el, key, value) {
  if (key === "ref") {
    if (typeof value === "function") value(el);
    return;
  }
  // Event handlers: onClick / on:click
  if (key.startsWith("on:")) {
    el.addEventListener(key.slice(3), value);
    return;
  }
  if (key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] >= "A" && key[2] <= "Z") {
    el.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  // classList: { "is-active": () => active(), error: hasError }
  if (key === "classList") {
    for (const name in value) {
      const flag = value[name];
      if (typeof flag === "function") effect(() => toggleClass(el, name, flag()));
      else toggleClass(el, name, flag);
    }
    return;
  }
  // Reactive prop: re-apply whenever its dependencies change.
  if (typeof value === "function") {
    effect(() => applyProp(el, key, value()));
    return;
  }
  applyProp(el, key, value);
}

function toggleClass(el, name, on) {
  const classes = new Set((el.getAttribute("class") || "").split(/\s+/).filter(Boolean));
  if (on) classes.add(name);
  else classes.delete(name);
  el.setAttribute("class", [...classes].join(" "));
}

const PROPERTIES = new Set(["value", "checked", "selected", "disabled", "innerHTML", "textContent"]);

function applyProp(el, key, value) {
  if (key === "class" || key === "className") {
    el.setAttribute("class", value == null ? "" : value);
    return;
  }
  if (key === "style") {
    if (typeof value === "string") el.style.cssText = value;
    else if (value) for (const prop in value) el.style[prop] = value[prop];
    return;
  }
  if (PROPERTIES.has(key)) {
    el[key] = value;
    return;
  }
  if (value == null || value === false) el.removeAttribute(key);
  else if (value === true) el.setAttribute(key, "");
  else el.setAttribute(key, value);
}

// -----------------------------------------------------------------------------
// Children
// -----------------------------------------------------------------------------

/**
 * Insert `value` into `parent` before the optional `before` node. Functions are
 * treated as reactive regions and re-rendered when their dependencies change.
 */
/** True for any DOM-like node (works in the browser, the server DOM and tests). */
function isNode(value) {
  return value != null && typeof value === "object" && typeof value.nodeType === "number";
}

export function insert(parent, value, before) {
  if (value == null || value === false || value === true) return;

  if (isNode(value)) {
    parent.insertBefore(value, before);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) insert(parent, item, before);
    return;
  }

  if (typeof value === "function") {
    const start = document.createComment("");
    const end = document.createComment("");
    parent.insertBefore(start, before);
    parent.insertBefore(end, before);
    effect(() => {
      clearBetween(start, end);
      const fragment = document.createDocumentFragment();
      insert(fragment, value(), null);
      end.parentNode.insertBefore(fragment, end);
    });
    return;
  }

  parent.insertBefore(document.createTextNode(String(value)), before);
}

function clearBetween(start, end) {
  let node = start.nextSibling;
  while (node && node !== end) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }
}

// -----------------------------------------------------------------------------
// Mounting
// -----------------------------------------------------------------------------

/**
 * Mount a component (or node) into a container element. Returns a dispose
 * function that removes the rendered output and tears down all reactivity.
 * @param {Function|Node} component
 * @param {Element} container
 * @returns {() => void}
 */
export function render(component, container) {
  return createRootMount(component, container);
}

function createRootMount(component, container) {
  return createRoot((dispose) => {
    const node =
      typeof component === "function" ? createComponent(component, {}) : component;
    insert(container, node, null);
    return () => {
      dispose();
      container.textContent = "";
    };
  });
}

// -----------------------------------------------------------------------------
// Control-flow components
// -----------------------------------------------------------------------------

function accessor(value) {
  return typeof value === "function" ? value : () => value;
}

function resolve(value) {
  return typeof value === "function" ? value() : value;
}

/**
 * Conditionally render content.
 *   h(Show, { when: () => loggedIn(), fallback: () => h(Login) }, () => h(Home))
 */
export function Show(props) {
  const when = accessor(props.when);
  return () => (when() ? resolve(props.children) : resolve(props.fallback));
}

/**
 * Render the first matching branch.
 *   h(Switch, { fallback: () => h(NotFound) },
 *     h(Match, { when: () => route() === "home" }, () => h(Home)))
 */
export function Switch(props) {
  const branches = [].concat(props.children || []);
  return () => {
    for (const branch of branches) {
      if (branch && branch.when && branch.when()) return resolve(branch.children);
    }
    return resolve(props.fallback);
  };
}

/** A branch for {@link Switch}. */
export function Match(props) {
  return { when: accessor(props.when), children: props.children };
}

/**
 * Render a keyed list with per-item disposal, preserving item state across
 * updates. Provide a stable key via `by` for primitive items.
 *   h(For, { each: () => todos(), by: (t) => t.id }, (todo, i) => h(Item, { todo }))
 */
export function For(props) {
  const each = accessor(props.each);
  const renderItem = props.children || props.render;
  const keyFor = props.by || ((item) => item);
  const owner = getOwner();

  const start = document.createComment("for");
  const end = document.createComment("/for");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(start);
  fragment.appendChild(end);

  // key -> { node, scope }
  let cache = new Map();

  effect(() => {
    const items = Array.from(each() || []);
    const next = new Map();
    const ordered = [];

    items.forEach((item, index) => {
      const key = keyFor(item, index);
      let entry = cache.get(key);
      if (!entry) {
        const scope = createChildScope(owner);
        const node = runWithOwner(scope, () => renderItem(item, index));
        entry = { node: isNode(node) ? node : toNode(node), scope };
      }
      next.set(key, entry);
      ordered.push(entry);
    });

    // Dispose entries that disappeared.
    for (const [key, entry] of cache) {
      if (!next.has(key)) {
        if (entry.node.parentNode) entry.node.remove();
        disposeScope(entry.scope);
      }
    }

    // Re-insert all nodes in order just before the end marker.
    const parent = end.parentNode;
    for (const entry of ordered) parent.insertBefore(entry.node, end);

    cache = next;
  });

  return fragment;
}

// For keyed reconciliation each item must resolve to a single movable node.
// Elements are returned as-is above; primitives become text nodes here. A
// render function that hands back an array/Fragment can't be reconciled (there
// is no single node left to move on reorder), so fail loudly instead of
// silently stringifying it into garbage text.
function toNode(value) {
  if (value == null || value === false || value === true) return document.createComment("");
  if (Array.isArray(value)) {
    throw new Error(
      "For/Index: each item must render a single element, not multiple children. " +
        "Wrap the returned nodes in one element (e.g. a <div> or <li>)."
    );
  }
  return document.createTextNode(String(value));
}

// -----------------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------------

/** Render a list keyed by index — reuses row nodes and updates each item via a
 * signal. Best when items are primitives or the list mostly mutates in place. */
export function Index(props) {
  const each = accessor(props.each);
  const renderItem = props.children || props.render;
  const owner = getOwner();

  const start = document.createComment("index");
  const end = document.createComment("/index");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(start);
  fragment.appendChild(end);

  const rows = []; // { item: Signal, node, scope }

  effect(() => {
    const items = Array.from(each() || []);

    for (let i = rows.length; i < items.length; i++) {
      const item = signal(items[i]);
      const scope = createChildScope(owner);
      const node = runWithOwner(scope, () => renderItem(item, i));
      rows[i] = { item, node: isNode(node) ? node : toNode(node), scope };
    }
    for (let i = items.length; i < rows.length; i++) {
      if (rows[i].node.parentNode) rows[i].node.remove();
      disposeScope(rows[i].scope);
    }
    rows.length = items.length;

    items.forEach((value, i) => rows[i].item.set(value));

    const parent = end.parentNode;
    for (const row of rows) parent.insertBefore(row.node, end);
  });

  return fragment;
}

/** Render a component chosen at runtime. `component` may be reactive. */
export function Dynamic(props) {
  const { component, ...rest } = props;
  const get = accessor(component);
  return () => {
    const Component = get();
    return Component ? createComponent(Component, rest) : null;
  };
}

/** Catch errors thrown while rendering children (pass children as a thunk). */
export function ErrorBoundary(props) {
  const reset = signal(0);
  return () => {
    reset(); // re-run when reset() is called
    try {
      return resolve(props.children);
    } catch (error) {
      const fallback = props.fallback;
      return typeof fallback === "function"
        ? fallback(error, () => reset.set((n) => n + 1))
        : fallback;
    }
  };
}

/** Render children into a different part of the DOM (e.g. document.body). */
export function Portal(props) {
  const mount = props.mount || (typeof document !== "undefined" ? document.body : null);
  const start = document.createComment("portal");
  const end = document.createComment("/portal");
  mount.appendChild(start);
  mount.appendChild(end);
  insert(mount, props.children, end);
  onCleanup(() => {
    clearBetween(start, end);
    start.remove();
    end.remove();
  });
  return document.createComment("portal-anchor");
}

// -----------------------------------------------------------------------------
// Two-way binding helpers — spread onto an element's props.
//   h("input", model(name))
//   h("input", { type: "checkbox", ...modelChecked(done) })
// -----------------------------------------------------------------------------

export function model(sig) {
  return {
    value: () => sig(),
    "on:input": (event) => sig.set(event.target.value),
  };
}

export function modelChecked(sig) {
  return {
    checked: () => sig(),
    "on:change": (event) => sig.set(event.target.checked),
  };
}

// -----------------------------------------------------------------------------
// Lazy components (code-splitting)
// -----------------------------------------------------------------------------

/**
 * Defer loading a component until it renders.
 *   const Settings = lazy(() => import("./Settings.js"));
 *   h(Settings, { fallback: () => h(Spinner) });
 * The loader should resolve to a module with a default export, or the
 * component function itself.
 */
export function lazy(loader) {
  return function LazyComponent(props) {
    const { fallback, ...rest } = props || {};
    const loaded = resource(() =>
      Promise.resolve(loader()).then((mod) => (mod && mod.default) || mod)
    );
    return () => {
      if (loaded.error()) throw loaded.error();
      if (loaded.loading()) return fallback ? resolve(fallback) : null;
      const Component = loaded();
      return Component ? createComponent(Component, rest) : null;
    };
  };
}

// -----------------------------------------------------------------------------
// Prop helpers
// -----------------------------------------------------------------------------

/** Shallow-merge prop objects (later sources win). */
export function mergeProps(...sources) {
  return Object.assign({}, ...sources.filter(Boolean));
}

/**
 * Split a props object into groups by key, returning each group plus the rest.
 *   const [local, rest] = splitProps(props, ["class", "onClick"]);
 */
export function splitProps(props, ...keyGroups) {
  const taken = new Set();
  const groups = keyGroups.map((keys) => {
    const group = {};
    for (const key of keys) {
      if (key in props) group[key] = props[key];
      taken.add(key);
    }
    return group;
  });
  const rest = {};
  for (const key in props) if (!taken.has(key)) rest[key] = props[key];
  groups.push(rest);
  return groups;
}

// -----------------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------------

/** Run a callback after the current render is committed to the DOM. */
export function onMount(fn) {
  const owner = getOwner();
  queueMicrotask(() => runWithOwner(owner, fn));
}

export { onCleanup };
