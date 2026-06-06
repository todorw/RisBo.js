export const version = "0.1.0";

// Reactivity
export {
  signal,
  computed,
  createMemo,
  effect,
  on,
  batch,
  untrack,
  onCleanup,
  createRoot,
  getOwner,
  runWithOwner,
  createContext,
  useContext,
  provideContext,
  resource,
} from "./reactivity.js";

// DOM & components
export {
  h,
  Fragment,
  render,
  insert,
  createComponent,
  onMount,
  Show,
  Switch,
  Match,
  For,
  Index,
  Dynamic,
  ErrorBoundary,
  Portal,
  lazy,
  mergeProps,
  splitProps,
  model,
  modelChecked,
} from "./dom.js";

// Server-side rendering
export { renderToString } from "./server.js";

// Router
export { createRouter, matchRoute } from "./router.js";

// Store
export { createStore } from "./store.js";

// Default export for convenience: `import RisBo from "risbo"`
import * as RisBo from "./index.js";
export default RisBo;
