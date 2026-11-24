/* Saves in localStorage, safely (after Slice Drive's save.js and channel.js).
 *
 *   const save = createStore('my-game', {version: 1, defaults: {best: null, volume: 0.7}});
 *   save.data.best = 12.3; save.write();
 *
 * - Keys are prefixed with the namespace (and with the page's folder, so two
 *   games on one domain never read each other's saves).
 * - Missing fields come from defaults, so adding a setting needs no migration.
 * - Raise `version` to start everyone afresh (old data is dropped, except the
 *   fields listed in `keep`), or pass migrate(old, oldVersion) → new data.
 * - With no storage (a private window, blocked cookies) it still works for the
 *   session; available() says whether anything will be kept.
 */
const folder = () => {
  const path = typeof location !== 'undefined' && location.pathname ? location.pathname : '/';
  const base = path.replace(/[^/]*$/, '') || '/';
  return base === '/' ? '' : base.replace(/^\/|\/$/g, '').replace(/\//g, '-') + ':';
};
function storage() {
  try { const s = globalThis.localStorage; if (!s) return null; s.getItem('x'); return s; } catch { return null; }
}
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function createStore(namespace, {version = 1, defaults = {}, keep = [], migrate = null, perFolder = true} = {}) {
  const key = (perFolder ? folder() : '') + namespace;
  const store = {
    key, version, data: clone(defaults),
    available: () => !!storage(),
    read() {
      const s = storage();
      let saved = null;
      try { saved = s ? JSON.parse(s.getItem(key) || 'null') : null; } catch { saved = null; }
      let data = clone(defaults);
      if (saved && typeof saved === 'object' && saved.data) {
        if (saved.version === version) data = {...data, ...saved.data};
        else if (migrate) data = {...data, ...migrate(saved.data, saved.version)};
        else for (const field of keep) if (field in saved.data) data[field] = saved.data[field];
      }
      store.data = data;
      return data;
    },
    write() {
      const s = storage();
      if (!s) return false;
      try { s.setItem(key, JSON.stringify({version, data: store.data})); return true; } catch { return false; }
    },
    reset() { store.data = clone(defaults); store.write(); return store.data; },
    /* Set some fields and write. */
    set(fields) { Object.assign(store.data, fields); return store.write(); },
  };
  store.read();
  return store;
}
