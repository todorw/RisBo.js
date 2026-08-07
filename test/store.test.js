import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { effect } from "../src/reactivity.js";

test("reads and writes reactive properties", () => {
  const store = createStore({ count: 0, name: "RisBo" });
  assert.equal(store.count, 0);
  assert.equal(store.name, "RisBo");
  store.count = 5;
  assert.equal(store.count, 5);
});

test("properties are reactive inside effects", () => {
  const store = createStore({ count: 0 });
  const seen = [];
  effect(() => seen.push(store.count));
  store.count = 1;
  store.count = 2;
  assert.deepEqual(seen, [0, 1, 2]);
});

test("actions mutate state and batch updates", () => {
  const store = createStore(
    { count: 0 },
    {
      inc: (s) => s.count++,
      addTwice: (s, n) => {
        s.count += n;
        s.count += n;
      },
    }
  );
  let runs = 0;
  effect(() => {
    store.count;
    runs++;
  });
  store.inc();
  assert.equal(store.count, 1);
  store.addTwice(10);
  assert.equal(store.count, 21);
  assert.equal(runs, 3); // initial + inc + addTwice(batched as one)
});

test("action accessors are stable references", () => {
  const store = createStore({ count: 0 }, { inc: (s) => s.count++ });
  assert.equal(store.inc, store.inc); // same closure every access
  const handler = store.inc;
  handler();
  assert.equal(store.count, 1);
});
