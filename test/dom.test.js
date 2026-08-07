import { test } from "node:test";
import assert from "node:assert/strict";
import { installDOM } from "../scripts/dom-shim.js";

installDOM();

const { h, render, Show, For, Index, Dynamic, ErrorBoundary, Portal, model, modelChecked, lazy } =
  await import("../src/dom.js");
const { signal } = await import("../src/reactivity.js");

function mount(component) {
  const container = document.createElement("div");
  const dispose = render(component, container);
  return { container, dispose };
}

test("renders a static element with text", () => {
  const { container } = mount(() => h("h1", { class: "title" }, "Hello"));
  const h1 = container.firstChild;
  assert.equal(h1.tagName, "H1");
  assert.equal(h1.getAttribute("class"), "title");
  assert.equal(h1.textContent, "Hello");
});

test("reactive text updates when a signal changes", () => {
  const count = signal(0);
  const { container } = mount(() =>
    h("span", null, () => `Count: ${count()}`)
  );
  const span = container.firstChild;
  assert.equal(span.textContent, "Count: 0");
  count.set(5);
  assert.equal(span.textContent, "Count: 5");
});

test("reactive attribute binding", () => {
  const active = signal(false);
  const { container } = mount(() =>
    h("div", { class: () => (active() ? "on" : "off") })
  );
  const div = container.firstChild;
  assert.equal(div.getAttribute("class"), "off");
  active.set(true);
  assert.equal(div.getAttribute("class"), "on");
});

test("svg elements are created in the SVG namespace", () => {
  const level = signal(4);
  const { container } = mount(() =>
    h("svg", { viewBox: "0 0 10 10" }, h("path", { d: () => `M0 ${level()}` }))
  );
  const svg = container.firstChild;
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  const path = svg.childNodes[0];
  assert.equal(path.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(path.getAttribute("d"), "M0 4");
  level.set(9);
  assert.equal(path.getAttribute("d"), "M0 9"); // still reactive inside svg
});

test("event handlers fire and mutate state", () => {
  const count = signal(0);
  const { container } = mount(() =>
    h(
      "button",
      { "on:click": () => count.set((n) => n + 1) },
      () => `${count()}`
    )
  );
  const button = container.firstChild;
  assert.equal(button.textContent, "0");
  button.fire("click");
  button.fire("click");
  assert.equal(button.textContent, "2");
});

test("Show toggles content with a fallback", () => {
  const open = signal(true);
  const { container } = mount(() =>
    h(
      "div",
      null,
      h(
        Show,
        { when: () => open(), fallback: () => h("p", null, "closed") },
        () => h("p", null, "open")
      )
    )
  );
  const div = container.firstChild;
  assert.equal(div.textContent, "open");
  open.set(false);
  assert.equal(div.textContent, "closed");
  open.set(true);
  assert.equal(div.textContent, "open");
});

test("For renders, updates, reorders and disposes keyed items", () => {
  const items = signal([
    { id: 1, label: "a" },
    { id: 2, label: "b" },
    { id: 3, label: "c" },
  ]);

  const { container } = mount(() =>
    h(
      "ul",
      null,
      h(
        For,
        { each: () => items(), by: (item) => item.id },
        (item) => h("li", { "data-id": String(item.id) }, item.label)
      )
    )
  );

  const ul = container.firstChild;
  const labels = () =>
    ul.childNodes
      .filter((n) => n.tagName === "LI")
      .map((n) => n.textContent);

  assert.deepEqual(labels(), ["a", "b", "c"]);

  // Reorder + remove one.
  items.set([
    { id: 3, label: "c" },
    { id: 1, label: "a" },
  ]);
  assert.deepEqual(labels(), ["c", "a"]);

  // Add a new one.
  items.set([
    { id: 3, label: "c" },
    { id: 1, label: "a" },
    { id: 4, label: "d" },
  ]);
  assert.deepEqual(labels(), ["c", "a", "d"]);
});

test("For preserves item node identity across reorders", () => {
  const items = signal([1, 2, 3]);
  const { container } = mount(() =>
    h("ul", null, h(For, { each: () => items() }, (n) => h("li", null, String(n))))
  );
  const ul = container.firstChild;
  const nodeFor = (label) =>
    ul.childNodes.find((n) => n.tagName === "LI" && n.textContent === label);

  const node2Before = nodeFor("2");
  items.set([3, 2, 1]);
  const node2After = nodeFor("2");
  assert.equal(node2Before, node2After, "node for key 2 should be reused");
});

test("For throws a clear error when an item renders multiple nodes", () => {
  const items = signal([1, 2]);
  assert.throws(
    () =>
      mount(() =>
        h("ul", null, h(For, { each: () => items() }, (n) => [h("li", null, String(n)), h("li", null, "extra")]))
      ),
    /single element/
  );
});

test("render dispose tears down reactivity", () => {
  const count = signal(0);
  let runs = 0;
  const { container, dispose } = mount(() =>
    h("span", null, () => {
      runs++;
      return String(count());
    })
  );
  assert.equal(runs, 1);
  count.set(1);
  assert.equal(runs, 2);
  dispose();
  assert.equal(container.textContent, "");
  count.set(2);
  assert.equal(runs, 2); // disposed: effect no longer runs
});

test("classList toggles classes reactively", () => {
  const active = signal(false);
  const { container } = mount(() =>
    h("div", { class: "box", classList: { active: () => active(), big: true } })
  );
  const div = container.firstChild;
  const classes = () => new Set(div.getAttribute("class").split(/\s+/).filter(Boolean));
  assert.deepEqual(classes(), new Set(["box", "big"]));
  active.set(true);
  assert.deepEqual(classes(), new Set(["box", "big", "active"]));
  active.set(false);
  assert.deepEqual(classes(), new Set(["box", "big"]));
});

test("model gives two-way text binding", () => {
  const name = signal("a");
  const { container } = mount(() => h("input", { type: "text", ...model(name) }));
  const input = container.firstChild;
  assert.equal(input.value, "a");
  input.fire("input", { target: { value: "bob" } });
  assert.equal(name(), "bob");
  name.set("carol");
  assert.equal(input.value, "carol"); // signal -> input
});

test("modelChecked gives two-way checkbox binding", () => {
  const done = signal(false);
  const { container } = mount(() =>
    h("input", { type: "checkbox", ...modelChecked(done) })
  );
  const input = container.firstChild;
  assert.equal(input.checked, false);
  input.fire("change", { target: { checked: true } });
  assert.equal(done(), true);
});

test("Index renders and updates rows in place", () => {
  const items = signal(["a", "b"]);
  const { container } = mount(() =>
    h("ul", null, h(Index, { each: () => items() }, (item) => h("li", null, () => item())))
  );
  const ul = container.firstChild;
  const labels = () => ul.childNodes.filter((n) => n.tagName === "LI").map((n) => n.textContent);
  assert.deepEqual(labels(), ["a", "b"]);
  items.set(["x", "y", "z"]);
  assert.deepEqual(labels(), ["x", "y", "z"]);
  items.set(["only"]);
  assert.deepEqual(labels(), ["only"]);
});

test("Dynamic renders a reactive component", () => {
  const A = () => h("span", null, "A");
  const B = () => h("span", null, "B");
  const which = signal(A);
  const { container } = mount(() => h("div", null, h(Dynamic, { component: () => which() })));
  const div = container.firstChild;
  assert.equal(div.textContent, "A");
  which.set(() => B);
  assert.equal(div.textContent, "B");
});

test("ErrorBoundary catches render errors and can reset", () => {
  let shouldThrow = true; // non-reactive: only reset() re-renders
  const { container } = mount(() =>
    h(
      "div",
      null,
      h(
        ErrorBoundary,
        {
          fallback: (err, reset) =>
            h(
              "button",
              {
                "on:click": () => {
                  shouldThrow = false;
                  reset();
                },
              },
              () => `caught: ${err.message}`
            ),
        },
        () => {
          if (shouldThrow) throw new Error("kaboom");
          return h("p", null, "safe");
        }
      )
    )
  );
  const div = container.firstChild;
  assert.match(div.textContent, /caught: kaboom/);
  const button = div.childNodes.find((n) => n.tagName === "BUTTON");
  button.fire("click"); // reset -> re-render children, now safe
  assert.equal(div.textContent, "safe");
});

test("lazy shows a fallback then the loaded component", async () => {
  const Loaded = () => h("span", null, "loaded");
  const Settings = lazy(() => Promise.resolve({ default: Loaded }));
  const { container } = mount(() =>
    h("div", null, h(Settings, { fallback: () => h("span", null, "loading…") }))
  );
  const div = container.firstChild;
  assert.equal(div.textContent, "loading…");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(div.textContent, "loaded");
});

test("Portal renders children into another mount point", () => {
  const target = document.createElement("div");
  const { dispose } = mount(() =>
    h("div", null, h(Portal, { mount: target }, h("span", null, "ported")))
  );
  assert.equal(target.textContent, "ported");
  dispose();
  assert.equal(target.textContent, ""); // cleaned up on dispose
});
