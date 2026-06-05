import {
  effect,
  untrack,
  createRoot,
  getOwner,
  createChildScope,
  disposeScope,
  runWithOwner,
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
  // Reactive prop: re-apply whenever its dependencies change.
  if (typeof value === "function") {
    effect(() => applyProp(el, key, value()));
    return;
  }
  applyProp(el, key, value);
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
export function insert(parent, value, before) {
  if (value == null || value === false || value === true) return;

  if (value instanceof Node) {
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
        entry = { node: node instanceof Node ? node : toNode(node), scope };
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
// Elements are returned as-is above; primitives become text nodes here.
function toNode(value) {
  if (value == null || value === false || value === true) return document.createComment("");
  return document.createTextNode(String(value));
}

// -----------------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------------

/** Run a callback after the current render is committed to the DOM. */
export function onMount(fn) {
  const owner = getOwner();
  queueMicrotask(() => runWithOwner(owner, fn));
}

export { onCleanup } from "./reactivity.js";
