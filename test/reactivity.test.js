import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  computed,
  effect,
  batch,
  untrack,
  createRoot,
  onCleanup,
} from "../src/reactivity.js";

test("signal reads and writes", () => {
  const count = signal(1);
  assert.equal(count(), 1);
  count.set(2);
  assert.equal(count(), 2);
  count.update((n) => n + 10);
  assert.equal(count(), 12);
  assert.equal(count.peek(), 12);
});

test("signal set accepts an updater function", () => {
  const count = signal(0);
  count.set((n) => n + 5);
  assert.equal(count(), 5);
});

test("computed derives and caches", () => {
  const a = signal(2);
  const b = signal(3);
  let runs = 0;
  const sum = computed(() => {
    runs++;
    return a() + b();
  });
  assert.equal(sum(), 5);
  assert.equal(sum(), 5); // cached, no recompute
  assert.equal(runs, 1);
  a.set(10);
  assert.equal(sum(), 13);
  assert.equal(runs, 2);
});

test("effect runs immediately and on dependency change", () => {
  const count = signal(0);
  const seen = [];
  const stop = effect(() => seen.push(count()));
  assert.deepEqual(seen, [0]);
  count.set(1);
  count.set(2);
  assert.deepEqual(seen, [0, 1, 2]);
  stop();
  count.set(3);
  assert.deepEqual(seen, [0, 1, 2]); // no longer reacting
});

test("effect tracks computed chains", () => {
  const n = signal(1);
  const doubled = computed(() => n() * 2);
  const seen = [];
  effect(() => seen.push(doubled()));
  n.set(5);
  assert.deepEqual(seen, [2, 10]);
});

test("batch coalesces updates into a single effect run", () => {
  const a = signal(1);
  const b = signal(1);
  let runs = 0;
  effect(() => {
    a();
    b();
    runs++;
  });
  assert.equal(runs, 1);
  batch(() => {
    a.set(2);
    b.set(2);
  });
  assert.equal(runs, 2); // only one extra run, not two
});

test("untrack avoids subscribing", () => {
  const a = signal(1);
  const b = signal(1);
  let runs = 0;
  effect(() => {
    a();
    untrack(() => b());
    runs++;
  });
  b.set(2);
  assert.equal(runs, 1); // b change ignored
  a.set(2);
  assert.equal(runs, 2);
});

test("onCleanup runs before re-run and on dispose", () => {
  const dep = signal(0);
  const cleanups = [];
  const stop = effect(() => {
    dep();
    onCleanup(() => cleanups.push("cleaned"));
  });
  assert.deepEqual(cleanups, []);
  dep.set(1);
  assert.deepEqual(cleanups, ["cleaned"]);
  stop();
  assert.deepEqual(cleanups, ["cleaned", "cleaned"]);
});

test("effect can return a cleanup function", () => {
  const dep = signal(0);
  let active = 0;
  const stop = effect(() => {
    dep();
    active++;
    return () => active--;
  });
  assert.equal(active, 1);
  dep.set(1);
  assert.equal(active, 1); // previous run cleaned up, new run started
  stop();
  assert.equal(active, 0);
});

test("createRoot isolates and disposes nested computations", () => {
  const dep = signal(0);
  let runs = 0;
  let dispose;
  createRoot((d) => {
    dispose = d;
    effect(() => {
      dep();
      runs++;
    });
  });
  assert.equal(runs, 1);
  dep.set(1);
  assert.equal(runs, 2);
  dispose();
  dep.set(2);
  assert.equal(runs, 2); // disposed: no more runs
});

test("diamond dependencies update consistently", () => {
  const a = signal(1);
  const b = computed(() => a() + 1);
  const c = computed(() => a() + 2);
  const d = computed(() => b() + c());
  const seen = [];
  effect(() => seen.push(d()));
  a.set(10);
  assert.deepEqual(seen, [5, 23]);
});

test("custom equality prevents updates", () => {
  const point = signal({ x: 0 }, { equals: (a, b) => a.x === b.x });
  let runs = 0;
  effect(() => {
    point();
    runs++;
  });
  point.set({ x: 0 }); // same x → no update
  assert.equal(runs, 1);
  point.set({ x: 1 });
  assert.equal(runs, 2);
});
