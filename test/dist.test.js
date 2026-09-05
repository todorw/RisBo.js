import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Build fresh so the bundle is always verified against current source.
execFileSync("node", [join(root, "scripts", "build.js")], { stdio: "ignore" });

test("ESM bundle exposes a working API", async () => {
  const R = await import(pathToFileURL(join(root, "dist", "risbo.js")).href + `?t=${Date.now()}`);
  const count = R.signal(1);
  const double = R.computed(() => count() * 2);
  const seen = [];
  R.effect(() => seen.push(double()));
  count.set(5);
  assert.deepEqual(seen, [2, 10]);

  const html = R.renderToString(() => R.h("h1", { class: "x" }, () => `n=${count()}`));
  assert.equal(html, '<h1 class="x">n=5</h1>');

  assert.equal(R.matchRoute([{ path: "/u/:id", component: () => 1 }], "/u/9").params.id, "9");
  assert.equal(typeof R.lazy, "function");
  assert.equal(R.default.signal, R.signal);
});

test("global build assigns window.RisBo", () => {
  const code = readFileSync(join(root, "dist", "risbo.global.js"), "utf8");
  const host = {};
  new Function("globalThis", code)(host);
  assert.equal(typeof host.RisBo.signal, "function");
  const c = host.RisBo.signal(3);
  assert.equal(host.RisBo.computed(() => c() + 1)(), 4);
});
