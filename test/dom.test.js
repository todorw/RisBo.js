import { test } from "node:test";
import assert from "node:assert/strict";
import { installDOM } from "../scripts/dom-shim.js";

installDOM();

const { h, render, Show, For } = await import("../src/dom.js");
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
