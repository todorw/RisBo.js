import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, effect, on, createRoot } from "../src/reactivity.js";
import { mergeProps, splitProps } from "../src/dom.js";

test("on tracks only listed deps and passes value + prev", () => {
  const a = signal(1);
  const other = signal(0);
  const calls = [];
  createRoot(() =>
    effect(
      on(a, (value, prev) => {
        other(); // reading here must NOT subscribe (on runs fn untracked)
        calls.push([value, prev]);
        return value;
      })
    )
  );
  assert.deepEqual(calls, [[1, undefined]]);
  other.set(99); // ignored — not a tracked dep
  assert.equal(calls.length, 1);
  a.set(2);
  assert.deepEqual(calls[1], [2, 1]);
});

test("on with defer skips the initial run", () => {
  const a = signal(1);
  const calls = [];
  createRoot(() => effect(on(a, (v) => calls.push(v), { defer: true })));
  assert.deepEqual(calls, []); // deferred
  a.set(5);
  assert.deepEqual(calls, [5]);
});

test("on supports multiple dependencies", () => {
  const a = signal(1);
  const b = signal(2);
  const calls = [];
  createRoot(() => effect(on([a, b], (values) => calls.push(values))));
  assert.deepEqual(calls, [[1, 2]]);
  b.set(9);
  assert.deepEqual(calls[1], [1, 9]);
});

test("mergeProps merges with later sources winning", () => {
  const merged = mergeProps({ a: 1, b: 1 }, null, { b: 2, c: 3 });
  assert.deepEqual(merged, { a: 1, b: 2, c: 3 });
});

test("splitProps splits into groups plus rest", () => {
  const [local, events, rest] = splitProps(
    { class: "x", id: "y", onClick: 1, title: "t" },
    ["class", "id"],
    ["onClick"]
  );
  assert.deepEqual(local, { class: "x", id: "y" });
  assert.deepEqual(events, { onClick: 1 });
  assert.deepEqual(rest, { title: "t" });
});
