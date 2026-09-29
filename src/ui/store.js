// The one live copy of the planner state, with saving and single-step undo.
import { normalizeState } from '../core/state.js';

const KEY = 'planner.v3.state';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

export const storage = {
  KEY,
  read() { return lsGet(KEY); },
  readLegacy(key) { return lsGet(key); },
};

export function createStore(initial, { catalogYear, onChange, onSaved }) {
  let state = initial;
  let armed = false;          // saving starts after a real edit, so opening someone's link never overwrites your own saved plan
  let snapshot = null;
  let version = 0;
  let token = 0;

  const clone = s => JSON.parse(JSON.stringify(s));
  function persist() {
    if (!armed) return;
    const ok = lsSet(KEY, JSON.stringify(state));
    if (onSaved) onSaved(ok ? 'saved' : 'nostore');
  }
  const notify = () => { version++; if (onChange) onChange(state); };

  return {
    get state() { return state; },
    get version() { return version; },
    /**
     * Change the state. By default the state before the change is remembered, so Ctrl+Z reverts the last change. A toast's Undo
     * button passes the token it was shown with (`store.token` right after the change), so it only works while that change is still
     * the latest and never reverts something newer. `keepUndo` keeps the existing snapshot (a follow-up step of the same action);
     * `undo: false` makes the change not undoable and forgets any older snapshot.
     */
    update(fn, { undo = true, keepUndo = false } = {}) {
      if (!(keepUndo && snapshot)) {
        if (undo) { snapshot = clone(state); token++; } else snapshot = null;
      }
      fn(state);
      armed = true;
      persist();
      notify();
    },
    get token() { return token; },
    undo(expected) {
      if (!snapshot || (expected !== undefined && expected !== token)) return false;
      state = snapshot;
      snapshot = null;
      armed = true;
      persist();
      notify();
      return true;
    },
    /** Replace the whole state (loading a link or a saved plan). `arm` = start saving it right away. */
    replace(next, { arm = false } = {}) {
      state = normalizeState(next, { defaultCatalogYear: catalogYear }).state;
      armed = arm;
      snapshot = null;
      if (arm) persist();
      notify();
    },
    arm() { armed = true; persist(); },
    get armed() { return armed; },
  };
}
