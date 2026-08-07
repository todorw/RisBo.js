import { signal, computed } from "./reactivity.js";
import { h } from "./dom.js";

/**
 * Compile a route pattern into a matcher.
 * @param {string} pattern e.g. "/users/:id"
 */
function compile(pattern) {
  const keys = [];
  const source = pattern
    .replace(/\/+$/, "")
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    })
    .replace(/\*/g, "(.*)");
  return { regex: new RegExp(`^${source || "/"}/?$`), keys };
}

/**
 * Match a path against a list of `{ path, component }` routes.
 * @param {Array<{path:string, component:Function}>} routes
 * @param {string} path
 * @returns {{ route: object, params: Record<string,string> } | null}
 */
export function matchRoute(routes, path) {
  const clean = path.split("?")[0].split("#")[0] || "/";
  for (const route of routes) {
    const { regex, keys } = compile(route.path);
    const result = regex.exec(clean.replace(/\/+$/, "") || "/");
    if (result) {
      const params = {};
      keys.forEach((key, i) => (params[key] = decodeURIComponent(result[i + 1])));
      return { route, params };
    }
  }
  return null;
}

function currentPath() {
  return window.location.pathname + window.location.search;
}

/**
 * Create a router instance.
 * @param {Array<{path:string, component:Function}>} routes
 * @param {{ fallback?: Function, base?: string }} [options]
 *   `base` mounts the router under a path prefix (e.g. "/app"); route paths and
 *   `Link`/`navigate` targets are then written relative to that prefix.
 */
export function createRouter(routes, options = {}) {
  const base = (options.base || "").replace(/\/+$/, "");
  const path = signal(currentPath());

  const stripBase = (p) => {
    if (base && (p === base || p.startsWith(base + "/"))) return p.slice(base.length) || "/";
    return p;
  };
  const withBase = (to) => base + (to.startsWith("/") ? to : "/" + to);

  const navigate = (to, { replace = false } = {}) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", withBase(to));
    path.set(currentPath());
  };

  const onPopState = () => path.set(currentPath());
  window.addEventListener("popstate", onPopState);
  const dispose = () => window.removeEventListener("popstate", onPopState);

  const pathname = computed(() => stripBase(path()).split("?")[0].split("#")[0] || "/");
  const matched = computed(() => matchRoute(routes, stripBase(path())));
  const params = computed(() => (matched() ? matched().params : {}));
  const query = computed(() => {
    const search = path().split("?")[1];
    const out = {};
    if (search) new URLSearchParams("?" + search.split("#")[0]).forEach((v, k) => (out[k] = v));
    return out;
  });

  /** Reactive component that renders the active route. */
  const View = () => () => {
    const match = matched();
    if (match) return match.route.component({ params: match.params, navigate, query: query() });
    return options.fallback ? options.fallback() : null;
  };

  const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

  /** Anchor that navigates without a full page reload, with active styling. */
  const Link = (props) => {
    const { href, children, class: className, activeClass = "active", end = false, ...rest } = props;
    const target = norm(href.split("?")[0]);
    const isActive = () => {
      const here = norm(pathname());
      return end ? here === target : here === target || here.startsWith(target + "/");
    };
    return h(
      "a",
      {
        href: withBase(href),
        class: () => [className, isActive() ? activeClass : ""].filter(Boolean).join(" "),
        "aria-current": () => (isActive() ? "page" : null),
        "on:click": (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          navigate(href);
        },
        ...rest,
      },
      children
    );
  };

  return { path, pathname, navigate, matched, params, query, View, Link, dispose };
}
