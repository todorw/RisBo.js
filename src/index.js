export const version = "0.1.0";

// Reactivity
export {
  signal,
  computed,
  effect,
  batch,
  untrack,
  onCleanup,
  createRoot,
  getOwner,
  runWithOwner,
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
} from "./dom.js";

// Router
export { createRouter, matchRoute } from "./router.js";

// Store
export { createStore } from "./store.js";

// Default export for convenience: `import RisBo from "risbo"`
import * as RisBo from "./index.js";
export default RisBo;
