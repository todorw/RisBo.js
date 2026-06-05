import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRoute } from "../src/router.js";

const routes = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
  { path: "/users/:id", component: () => "user" },
  { path: "/files/*", component: () => "files" },
];

test("matches the root path", () => {
  const m = matchRoute(routes, "/");
  assert.equal(m.route.component(), "home");
  assert.deepEqual(m.params, {});
});

test("matches a static path", () => {
  assert.equal(matchRoute(routes, "/about").route.component(), "about");
});

test("matches a path with params", () => {
  const m = matchRoute(routes, "/users/42");
  assert.equal(m.route.component(), "user");
  assert.deepEqual(m.params, { id: "42" });
});

test("decodes param values", () => {
  const m = matchRoute(routes, "/users/john%20doe");
  assert.deepEqual(m.params, { id: "john doe" });
});

test("ignores query strings and trailing slashes", () => {
  assert.equal(matchRoute(routes, "/about/").route.component(), "about");
  assert.equal(matchRoute(routes, "/about?ref=x").route.component(), "about");
});

test("matches wildcard routes", () => {
  assert.equal(matchRoute(routes, "/files/a/b/c.txt").route.component(), "files");
});

test("returns null when nothing matches", () => {
  assert.equal(matchRoute(routes, "/nope"), null);
});
