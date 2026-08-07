import { signal, batch } from "./reactivity.js";

/**
 * Create a reactive store.
 *   const store = createStore(
 *     { count: 0 },
 *     { inc: (s) => s.count++, add: (s, n) => (s.count += n) }
 *   );
 *   store.count;        // reactive read
 *   store.inc();        // mutate via action
 *
 * @param {object} initial initial state
 * @param {Record<string, Function>} [actions]
 */
export function createStore(initial, actions = {}) {
  const signals = new Map();
  for (const key of Object.keys(initial)) signals.set(key, signal(initial[key]));

  // Bound once per action so `store.inc === store.inc` holds — handy for
  // things like `removeEventListener` or dependency arrays that compare by
  // reference, and cheaper than allocating a new closure on every access.
  const bound = new Map();

  const store = new Proxy(
    {},
    {
      get(_, key) {
        if (key in actions) {
          let fn = bound.get(key);
          if (!fn) bound.set(key, (fn = (...args) => batch(() => actions[key](store, ...args))));
          return fn;
        }
        const s = signals.get(key);
        return s ? s() : undefined;
      },
      set(_, key, value) {
        let s = signals.get(key);
        if (!s) signals.set(key, (s = signal(value)));
        else s.set(value);
        return true;
      },
      has(_, key) {
        return signals.has(key) || key in actions;
      },
      ownKeys() {
        return [...signals.keys()];
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
    }
  );

  return store;
}
