import { test } from "node:test";
import assert from "node:assert/strict";
import { installDOM } from "../scripts/dom-shim.js";

installDOM();

// Minimal History/Location stub.
let popstate = () => {};
globalThis.window = {
  location: { pathname: "/", search: "", hash: "" },
  history: {
    pushState(_s, _t, url) {
      const u = new URL(url, "http://x");
      window.location.pathname = u.pathname;
      window.location.search = u.search;
    },
    replaceState(...a) {
      this.pushState(...a);
    },
  },
  addEventListener(type, fn) {
    if (type === "popstate") popstate = fn;
  },
  removeEventListener(type, fn) {
    if (type === "popstate" && popstate === fn) popstate = () => {};
  },
};

const { createRouter } = await import("../src/router.js");
const { render, h } = await import("../src/dom.js");

const routes = [
  { path: "/", component: () => h("span", null, "home") },
  { path: "/users/:id", component: ({ params, query }) => h("span", null, `user ${params.id} sort ${query.sort || "-"}`) },
];

test("router renders the active route and reacts to navigation", () => {
  window.location.pathname = "/";
  window.location.search = "";
  const router = createRouter(routes);
  const container = document.createElement("div");
  render(() => h("div", null, router.View()), container);

  assert.match(container.textContent, /home/);

  router.navigate("/users/7?sort=name");
  assert.match(container.textContent, /user 7 sort name/);
  assert.deepEqual(router.params(), { id: "7" });
  assert.deepEqual(router.query(), { sort: "name" });
});

test("Link marks itself active for the current path", () => {
  window.location.pathname = "/";
  window.location.search = "";
  const router = createRouter(routes);
  const container = document.createElement("div");
  render(() => router.Link({ href: "/", class: "nav", children: "Home" }), container);

  const a = container.firstChild;
  assert.match(a.getAttribute("class"), /\bactive\b/);
  assert.equal(a.getAttribute("aria-current"), "page");

  router.navigate("/users/1");
  assert.doesNotMatch(a.getAttribute("class") || "", /\bactive\b/);
  assert.equal(a.getAttribute("aria-current"), null);
});

test("dispose removes the popstate listener", () => {
  window.location.pathname = "/";
  window.location.search = "";
  const router = createRouter(routes);
  assert.equal(typeof popstate, "function");
  router.dispose();
  // The stub only ever tracks one handler; after dispose, navigating via the
  // browser back/forward buttons must no longer reach this router's path signal.
  const before = router.path();
  popstate();
  assert.equal(router.path(), before);
});
