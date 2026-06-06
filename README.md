<div align="center">

# ● RisBo.js

**A fast, fine-grained reactive UI framework — in a few hundred lines, with zero dependencies.**

[Concepts](#core-concepts) · [Quick start](#quick-start) · [API](#api-reference) · [Examples](#examples) · [Why RisBo](#why-risbo)

</div>

---

RisBo.js gives you **signals**, **components**, a **renderer**, a **router** and a **store** — the whole toolkit for building reactive web apps — without a build step, a virtual DOM, or a single runtime dependency. When a signal changes, RisBo updates *only* the exact text node or attribute that depends on it. No diffing, no re-rendering components top to bottom.

```js
import { signal, h, render } from "risbo";

function Counter() {
  const count = signal(0);
  return h("button", { "on:click": () => count.set((n) => n + 1) },
    () => `Count: ${count()}`);
}

render(Counter, document.getElementById("app"));
```

## Why RisBo

- **Fine-grained reactivity.** Updates touch only the DOM that changed — not whole component trees.
- **No build step required.** It's standard ES modules. Drop it in a `<script type="module">` and go.
- **Tiny & dependency-free.** The entire runtime is small enough to read in one sitting.
- **Batteries included.** Signals, components, control flow, **context**, **async resources**, **error boundaries**, **portals**, a **router**, a **store** and **server rendering** — all in one place.
- **Real disposal.** Effects, components and list items clean up after themselves automatically.

## Quick start

RisBo is plain ES modules, so there's nothing to compile.

```html
<div id="app"></div>
<script type="module">
  import { signal, h, render } from "./src/index.js";

  function Hello() {
    const name = signal("world");
    return h("div", null,
      h("input", { value: () => name(), "on:input": (e) => name.set(e.target.value) }),
      h("h1", null, () => `Hello, ${name()}!`));
  }

  render(Hello, document.getElementById("app"));
</script>
```

Run the bundled examples locally:

```bash
npm run dev      # serves ./examples at http://localhost:5173
npm test         # runs the test suite (node --test)
npm run build    # builds dist/risbo.js (ESM) + dist/risbo.global.js (CDN)
```

### From a CDN — no install, no build

```html
<!-- ES module -->
<script type="module">
  import { signal, h, render } from "https://esm.sh/risbo";
  // …
</script>

<!-- Or the global build: window.RisBo -->
<script src="https://unpkg.com/risbo/dist/risbo.global.js"></script>
<script>
  const { signal, h, render } = RisBo;
</script>
```

## Core concepts

### Signals — reactive state

A **signal** is a reactive container. Call it to read; call `.set()` to write. Reading a signal inside an effect, computed, or reactive binding subscribes to it.

```js
const count = signal(0);

count();                 // read → 0
count.set(5);            // write
count.set((n) => n + 1); // functional update → 6
count.peek();            // read without subscribing
```

### Computeds — derived state

A **computed** is a cached value derived from other reactive values. It recomputes lazily, only when something it depends on changes.

```js
const first = signal("Ada");
const last = signal("Lovelace");
const full = computed(() => `${first()} ${last()}`);

full(); // "Ada Lovelace"
```

### Effects — side effects

An **effect** runs immediately, then re-runs whenever any reactive value it read changes. Return a function (or use `onCleanup`) to clean up.

```js
const id = signal(1);

effect(() => {
  const controller = new AbortController();
  fetch(`/api/user/${id()}`, { signal: controller.signal });
  return () => controller.abort(); // runs before the next run / on dispose
});
```

Use `batch()` to coalesce multiple writes into a single update, and `untrack()` to read without subscribing. For explicit dependencies, wrap the body with `on`:

```js
import { on } from "risbo";

// Re-runs only when `userId` changes; `defer` skips the first run.
effect(on(userId, (id, prevId) => load(id), { defer: true }));
```

### Async data with `resource`

A **resource** wraps an async source. It re-fetches when its reactive input changes and exposes loading/error state.

```js
import { resource, signal } from "risbo";

const userId = signal(1);
const user = resource(() => userId(), (id) => fetch(`/api/users/${id}`).then((r) => r.json()));

user();         // latest value (undefined until resolved)
user.loading(); // true while fetching
user.error();   // any thrown/rejected error
user.refetch(); // force a reload
```

### Context

Pass values down the tree without threading props through every component.

```js
import { createContext, useContext } from "risbo";

const Theme = createContext("light");

Theme.provide("dark", () => h(App));   // anywhere inside:
const theme = useContext(Theme);        // "dark"
```

### Components & the renderer

A **component** is just a function that returns DOM, built with the hyperscript helper `h(tag, props, ...children)`.

- A **prop whose value is a function** becomes a reactive binding.
- A **child that is a function** becomes a reactive region.
- Events are `onClick` or `on:click`. Refs are `ref: (el) => …`.

```js
function Profile(props) {
  return h("article", { class: () => (props.active() ? "active" : "") },
    h("h2", null, () => props.user().name),
    h("button", { "on:click": props.onEdit }, "Edit"));
}
```

### Control flow

```js
// Conditional
h(Show, { when: () => user(), fallback: () => h(Login) }, () => h(Dashboard));

// Keyed list (preserves item state, disposes removed items)
h(For, { each: () => todos(), by: (t) => t.id },
  (todo) => h(TodoRow, { todo }));

// Multi-branch
h(Switch, { fallback: () => h(NotFound) },
  h(Match, { when: () => tab() === "a" }, () => h(PanelA)),
  h(Match, { when: () => tab() === "b" }, () => h(PanelB)));

// Index-keyed list (rows reused by position, item exposed as a signal)
h(Index, { each: () => rows() }, (row) => h("input", model(row)));

// Component chosen at runtime
h(Dynamic, { component: () => widgets[kind()] });

// Catch render errors (pass children as a thunk)
h(ErrorBoundary, { fallback: (err, reset) => h(Oops, { err, reset }) }, () => h(Risky));

// Render elsewhere in the DOM (modals, tooltips)
h(Portal, { mount: document.body }, h(Modal));

// Code-split a component; shows `fallback` while it loads
const Settings = lazy(() => import("./Settings.js"));
h(Settings, { fallback: () => h(Spinner) });
```

### Component prop helpers

```js
import { mergeProps, splitProps } from "risbo";

function Button(props) {
  props = mergeProps({ type: "button" }, props);       // defaults
  const [local, rest] = splitProps(props, ["children"]); // pull some out
  return h("button", rest, local.children);
}
```

### Two-way binding

`model` / `modelChecked` return props you spread onto an input.

```js
const name = signal("");
h("input", model(name));                          // text ↔ signal

const agree = signal(false);
h("input", { type: "checkbox", ...modelChecked(agree) });
```

### Server-side rendering

Render the exact same components to an HTML string — no browser needed.

```js
import { renderToString } from "risbo/server";

const html = renderToString(App); // "<div class=\"app\">…</div>"
```

### Routing

```js
import { createRouter, h, render } from "risbo";

const router = createRouter([
  { path: "/",          component: Home },
  { path: "/users/:id", component: ({ params }) => h(User, { id: params.id }) },
], { fallback: () => h(NotFound) });

const { Link, View } = router;

const App = () => h("div", null,
  h("nav", null, Link({ href: "/", children: "Home" })), // adds `active` class + aria-current when matched
  View());

render(App, document.getElementById("app"));
```

The router also exposes reactive `pathname`, `params` and `query` accessors, and route components receive `{ params, query, navigate }`. Mount under a path prefix with the `base` option.

### Stores

A **store** is a reactive object. Reading a property subscribes to it; actions encapsulate updates and batch automatically.

```js
import { createStore } from "risbo";

const cart = createStore(
  { items: [], coupon: null },
  {
    add: (s, item) => (s.items = [...s.items, item]),
    clear: (s) => (s.items = []),
  }
);

cart.add({ id: 1 }); // reactive: any effect reading cart.items re-runs
```

## API reference

### Reactivity
| Export | Description |
| --- | --- |
| `signal(value, options?)` | Writable reactive value. Returns a getter with `.set` / `.update` / `.peek`. |
| `computed(fn, options?)` | Cached derived value. |
| `effect(fn)` | Run a side effect that re-runs on change. Returns a stop function. |
| `batch(fn)` | Coalesce writes into a single flush. |
| `untrack(fn)` | Read reactive values without subscribing. |
| `onCleanup(fn)` | Run `fn` when the scope is disposed or re-run. |
| `createRoot(fn)` | Create an explicit disposal boundary. |
| `createMemo(fn)` | Alias of `computed`. |
| `on(deps, fn, opts?)` | Explicit-dependency effect/computed body. |
| `createContext` / `useContext` | Dependency injection along the owner tree. |
| `resource(source?, fetcher)` | Reactive async data with loading/error state. |

### DOM
| Export | Description |
| --- | --- |
| `h(type, props, ...children)` | Hyperscript factory (also a JSX pragma). |
| `Fragment` | Group children without a wrapper element. |
| `render(component, container)` | Mount into the DOM. Returns a disposer. |
| `onMount(fn)` / `onCleanup(fn)` | Lifecycle hooks. |
| `Show`, `Switch`, `Match`, `For`, `Index` | Control-flow components. |
| `Dynamic`, `ErrorBoundary`, `Portal`, `lazy` | Runtime component, error catching, out-of-tree & code-split rendering. |
| `model`, `modelChecked` | Two-way binding helpers. |
| `mergeProps`, `splitProps` | Component prop utilities. |

### Server, Router & Store
| Export | Description |
| --- | --- |
| `renderToString(component)` | Render components to an HTML string (`risbo/server`). |
| `createRouter(routes, options?)` | Returns `{ path, pathname, navigate, matched, params, query, View, Link }`. |
| `matchRoute(routes, path)` | Pure route matcher (path params + `*` wildcard). |
| `createStore(initial, actions?)` | Reactive object store. |

### Using JSX (optional)

RisBo's `h`/`Fragment` work as a JSX runtime. Configure your bundler's JSX factory:

```jsx
/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment, signal, render } from "risbo";

const App = () => {
  const n = signal(0);
  return <button onClick={() => n.set((x) => x + 1)}>{() => n()}</button>;
};
```

## Examples

The [`examples/`](./examples) folder contains a polished landing page plus runnable apps — a counter, a todo app (store + keyed lists + two-way binding), an async-data demo (`resource` with loading/error/refetch), and a router demo. Start them with `npm run dev` and open <http://localhost:5173>.

## Design notes

- **No virtual DOM.** Reactive bindings are wired directly to DOM nodes at creation time, so updates are O(change), not O(tree).
- **Synchronous, batched updates.** Writes flush synchronously; `batch()` groups them. Computeds are lazy and cached.
- **Automatic disposal.** Every component, effect and list item lives in an owner scope that is torn down when removed — no leaked listeners or effects.

## Project layout

```
src/
  reactivity.js   signals, computeds, effects, batching, ownership, context, resource
  dom.js          hyperscript renderer + Show / Switch / For / Index / Dynamic / ErrorBoundary / Portal
  server.js       renderToString (SSR)
  router.js       history-based router + matchRoute
  store.js        reactive object store
  index.js        public API
scripts/build.js  zero-dep bundler → dist/ (ESM + global/CDN builds)
test/             node:test suite (56 tests: reactivity, dom, context, server, router, store, dist, utils)
examples/         landing page + runnable browser demos
```

## License

MIT © Vuk Todorovic
