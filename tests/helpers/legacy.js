'use strict';
/**
 * Loads the CURRENT (pre-refactor) browser scripts into a Node vm sandbox so their behaviour can be recorded
 * as golden fixtures and re-checked. The scripts are executed unmodified except for one appended hook that
 * exposes functions trapped inside ee-app.js's IIFE. Nothing here touches the real DOM.
 *
 * Everything crossing the sandbox boundary goes through JSON so results are plain objects of this realm.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, /^fflate/.test(f) ? f : 'tests/legacy-src/' + f), 'utf8');

function makeContext() {
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, addEventListener: noop, setAttribute: noop, querySelector: () => null, querySelectorAll: () => [],
  });
  const store = new Map();
  const ctx = {
    console,
    setTimeout, clearTimeout,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    location: { search: '', origin: 'http://localhost', pathname: '/', protocol: 'http:' },
    navigator: {},
    document: {
      readyState: 'loading', addEventListener: noop, getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], createElement: el, head: el(), body: el(),
    },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  return vm.createContext(ctx);
}

/** Run `code` (an expression using `input`) in the sandbox and return its JSON-serialisable result. */
function evalJSON(ctx, code, input) {
  ctx.__input = input === undefined ? undefined : JSON.parse(JSON.stringify(input));
  const out = vm.runInContext(`JSON.stringify((function (input) { return (${code}); })(__input))`, ctx);
  return out === undefined ? undefined : JSON.parse(out);
}

const EE_HOOK = `
globalThis.__legacy = {
  validate, buildScenario, tileDef, projectColumns, termPos, termSeason, planToPlacements, formatReqList,
  getState: () => state,
  setState: s => { state = s; },
};
`;

/** majors-data.js + ee-app.js (the EE / double-major planner). */
function loadLegacyEE() {
  const ctx = makeContext();
  vm.runInContext(read('majors-data.js'), ctx, { filename: 'majors-data.js' });
  const tail = /\}\)\(\);\s*$/;
  let src = read('ee-app.js');
  if (!tail.test(src)) throw new Error('ee-app.js no longer ends with "})();". Update tests/helpers/legacy.js.');
  src = src.replace(tail, EE_HOOK + '})();\n');
  vm.runInContext(src, ctx, { filename: 'ee-app.js' });

  const setState = s => evalJSON(ctx, '(__legacy.setState(input), true)', s);
  /** id -> term for every placed or completed course, exactly as render() builds it. */
  const placements = () => evalJSON(ctx, '(function () { const P = {}; for (const c of __legacy.projectColumns()) for (const id of c.tiles) P[id] = c.key; return P; })()');
  return {
    ctx,
    constants: (name) => evalJSON(ctx, name),
    setState,
    placements,
    audit: state => evalJSON(ctx, 'auditDegreeRequirements(input.plan, input.done, input)', state),
    validateAll(state) {
      setState(state);
      const P = placements();
      const out = {};
      for (const id of Object.keys(P).sort()) out[id] = evalJSON(ctx, '__legacy.validate(input.id, input.P)', { id, P });
      return out;
    },
    scenario(state) {
      setState(state);
      return evalJSON(ctx, '__legacy.buildScenario()');
    },
    planToPlacements: plan => evalJSON(ctx, '__legacy.planToPlacements(input)', plan),
    shareLink(state) {
      // Mirrors ee-app.js shareLink(): base64 of the full JSON state (URL-encoded once by the caller).
      return Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
    },
  };
}

/** fflate.min.js + app.js (the original BE / pre-med planner). */
function loadLegacyBE() {
  const ctx = makeContext();
  vm.runInContext(read('fflate.min.js'), ctx, { filename: 'fflate.min.js' });
  vm.runInContext(read('app.js'), ctx, { filename: 'app.js' });
  const setState = s => evalJSON(ctx, '(state = input, true)', s);
  return {
    ctx,
    constants: name => evalJSON(ctx, name),
    setState,
    defaultState: track => evalJSON(ctx, 'defaultState(input)', track),
    placements: () => evalJSON(ctx, 'placementMap()'),
    validateAll(state) {
      setState(state);
      const P = evalJSON(ctx, 'placementMap()');
      const out = {};
      for (const id of Object.keys(P).sort()) out[id] = evalJSON(ctx, 'validate(input.id, input.P)', { id, P });
      return out;
    },
    scenario(state) {
      setState(state);
      return evalJSON(ctx, 'buildScenario()');
    },
    encodeCompact(state) { setState(state); return evalJSON(ctx, 'encodeStateCompact()'); },
    encodeLegacyData(state) { setState(state); return evalJSON(ctx, 'encodeState()'); },
    decodeCompact: str => evalJSON(ctx, 'decodeStateCompact(input)', str),
    decodeLegacyData: str => evalJSON(ctx, 'decodePlan(input)', str),
    toV3: (obj, track) => evalJSON(ctx, 'toV3(input.obj, input.track)', { obj, track }),
  };
}

module.exports = { ROOT, loadLegacyEE, loadLegacyBE, evalJSON };
