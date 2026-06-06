import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createContext,
  useContext,
  resource,
  createRoot,
  effect,
} from "../src/reactivity.js";

test("context provides values down the owner tree", () => {
  const Theme = createContext("light");
  let outer, inner, sibling;
  createRoot(() => {
    sibling = useContext(Theme); // default
    Theme.provide("dark", () => {
      outer = useContext(Theme);
      Theme.provide("midnight", () => {
        inner = useContext(Theme);
      });
    });
  });
  assert.equal(sibling, "light");
  assert.equal(outer, "dark");
  assert.equal(inner, "midnight");
});

test("resource resolves async data with loading + error state", async () => {
  let resolveFn;
  const r = createRoot(() =>
    resource(() => new Promise((res) => (resolveFn = res)))
  );
  assert.equal(r.loading(), true);
  assert.equal(r(), undefined);

  resolveFn(42);
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(r.loading(), false);
  assert.equal(r(), 42);
  assert.equal(r.error(), undefined);
});

test("resource captures rejections", async () => {
  const r = createRoot(() => resource(() => Promise.reject(new Error("boom"))));
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(r.loading(), false);
  assert.equal(r.error().message, "boom");
});

test("resource refetches when its source signal changes", async () => {
  const { signal } = await import("../src/reactivity.js");
  const id = signal(1);
  const seen = [];
  const r = createRoot(() =>
    resource(
      () => id(),
      (value) => {
        seen.push(value);
        return Promise.resolve(value * 10);
      }
    )
  );
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(r(), 10);
  id.set(2);
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(r(), 20);
  assert.deepEqual(seen, [1, 2]);
});
