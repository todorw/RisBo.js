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
- **Familiar, minimal API.** `signal`, `computed`, `effect`, components, `Show`, `For`, a router and a store. That's most of it.
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

Use `batch()` to coalesce multiple writes into a single update, and `untrack()` to read without subscribing.

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
  h("nav", null, Link({ href: "/", children: "Home" })),
  View());

render(App, document.getElementById("app"));
```

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

### DOM
| Export | Description |
| --- | --- |
| `h(type, props, ...children)` | Hyperscript factory (also a JSX pragma). |
| `Fragment` | Group children without a wrapper element. |
| `render(component, container)` | Mount into the DOM. Returns a disposer. |
| `onMount(fn)` | Run after the render is committed. |
| `Show`, `Switch`, `Match`, `For` | Control-flow components. |

### Router & Store
| Export | Description |
| --- | --- |
| `createRouter(routes, options?)` | Returns `{ path, navigate, matched, View, Link }`. |
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

The [`examples/`](./examples) folder contains runnable apps — a counter, a todo app (store + keyed lists + filters), and a router demo. Start them with `npm run dev`.

## Design notes

- **No virtual DOM.** Reactive bindings are wired directly to DOM nodes at creation time, so updates are O(change), not O(tree).
- **Synchronous, batched updates.** Writes flush synchronously; `batch()` groups them. Computeds are lazy and cached.
- **Automatic disposal.** Every component, effect and list item lives in an owner scope that is torn down when removed — no leaked listeners or effects.

## Project layout

```
src/
  reactivity.js   signals, computeds, effects, batching, ownership
  dom.js          hyperscript renderer + Show / Switch / For
  router.js       history-based router + matchRoute
  store.js        reactive object store
  index.js        public API
test/             node:test suite (reactivity, dom, router, store)
examples/         runnable browser demos
```

## License

MIT © Vuk Todorovic
