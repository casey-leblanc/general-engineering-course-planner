// Planner state (version 3) and the operations on it. Pure: every function takes a state and returns nothing or a new value;
// the UI owns the single live copy (src/ui/store.js) and Node tests drive the same functions.
//
//   { v:3, catalogYear, programs:[programId], tracks:{programId: trackId},
//     terms:[termKey], placed:{tileId: termKey}, done:{tileId: termKey},
//     assign:{courseId: requirementId}, grants:{courseId:'AP'|...}, meta:{tileId:{note,label,cr,diff}},
//     custom:{customId:{code,title,cr,diff}}, rules:[personal rule], alt:{planKey:{placed,assign}}, pristine }
//
// `placed` holds not-yet-taken courses (and placeholder tiles); `done` marks a course completed in the term it was taken
// ('completed' = AP / transfer credit). A course in `done` shows in that term whatever `placed` says.
import { COMPLETED, isTermKey, termPos, defaultTerms, sortTerms, canRemoveTerm as termRemovable, isFixedTerm } from './terms.js';
import { validateRule, PROGRAM_ID, CATALOG_YEAR } from './schema.js';

export const STATE_VERSION = 3;
const SAFE_ID = /^[A-Za-z0-9._/-]{1,80}$/;
const DIFFS = ['normal', 'hard', 'hardest'];
const GRANTS = ['AP', 'transfer', 'placement', 'other'];
const LIMITS = { tiles: 400, programs: 8, rules: 60, custom: 60, altPlans: 8 };

export class StateError extends Error {}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = x => JSON.parse(JSON.stringify(x));
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function emptyState({ catalogYear, programs = [], tracks = {} }) {
  return {
    v: STATE_VERSION, catalogYear, programs: [...programs], tracks: { ...tracks },
    terms: defaultTerms(4), placed: {}, done: {}, assign: {}, grants: {}, meta: {}, custom: {}, rules: [], alt: {}, pristine: true,
  };
}

/* ---------------------------------------------------------------- validation */

function cleanMap(m, valid, cap, warnings, what) {
  const out = {};
  if (!isObj(m)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(m)) {
    if (!SAFE_ID.test(k) || !valid(v)) { warnings.push(`ignored ${what} entry ${JSON.stringify(k).slice(0, 40)}`); continue; }
    if (++n > cap) { warnings.push(`too many ${what} entries; ignored the rest`); break; }
    out[k] = v;
  }
  return out;
}

function cleanMeta(meta, warnings) {
  const out = {};
  if (!isObj(meta)) return out;
  for (const [id, m] of Object.entries(meta)) {
    if (!SAFE_ID.test(id) || !isObj(m)) continue;
    const c = {};
    if (str(m.note, 200)) c.note = str(m.note, 200);
    if (str(m.label, 80)) c.label = str(m.label, 80);
    if (m.cr !== undefined && Number.isInteger(m.cr) && m.cr >= 0 && m.cr <= 20) c.cr = m.cr;
    if (DIFFS.includes(m.diff) && m.diff !== 'normal') c.diff = m.diff;
    if (Object.keys(c).length) out[id] = c;
  }
  return out;
}

/**
 * Check and clean a version-3 state from anywhere (localStorage, a link, a file). Never trusts its input: unknown keys are
 * dropped, ids and terms are validated, personal rules go through the rule schema. Throws StateError when there is nothing
 * usable; otherwise returns { state, warnings }.
 */
export function normalizeState(raw, { defaultCatalogYear } = {}) {
  const warnings = [];
  if (!isObj(raw)) throw new StateError('not a planner state');
  if (raw.v !== STATE_VERSION) throw new StateError(`state version ${raw.v} is not supported here (expected ${STATE_VERSION})`);

  const catalogYear = CATALOG_YEAR.test(raw.catalogYear || '') ? raw.catalogYear : defaultCatalogYear;
  if (!catalogYear) throw new StateError('missing catalog year');

  const programs = [];
  for (const p of Array.isArray(raw.programs) ? raw.programs : []) {
    if (typeof p === 'string' && PROGRAM_ID.test(p) && !programs.includes(p) && programs.length < LIMITS.programs) programs.push(p);
    else warnings.push(`ignored program ${JSON.stringify(p).slice(0, 30)}`);
  }
  const tracks = {};
  if (isObj(raw.tracks)) for (const [p, t] of Object.entries(raw.tracks)) if (programs.includes(p) && typeof t === 'string' && /^[a-z0-9-]+$/.test(t)) tracks[p] = t;

  const termOk = v => typeof v === 'string' && isTermKey(v);
  const placed = cleanMap(raw.placed, termOk, LIMITS.tiles, warnings, 'placed');
  const done = cleanMap(raw.done, termOk, LIMITS.tiles, warnings, 'done');

  const terms = new Set(defaultTerms(4));
  for (const t of Array.isArray(raw.terms) ? raw.terms : []) if (termOk(t) && termPos(t) <= 6 * 3 + 2) terms.add(t);
  for (const t of [...Object.values(placed), ...Object.values(done)]) terms.add(t);   // never lose a tile because its term is missing

  const custom = {};
  if (isObj(raw.custom)) {
    let n = 0;
    for (const [id, c] of Object.entries(raw.custom)) {
      if (!/^c-[A-Za-z0-9]{1,20}$/.test(id) || !isObj(c) || !str(c.code, 16) || ++n > LIMITS.custom) continue;
      custom[id] = { code: str(c.code, 16), title: str(c.title, 60), cr: Number.isInteger(c.cr) && c.cr >= 0 && c.cr <= 20 ? c.cr : 3, diff: DIFFS.includes(c.diff) ? c.diff : 'normal' };
    }
  }

  const rules = [];
  for (const r of Array.isArray(raw.rules) ? raw.rules : []) {
    if (rules.length >= LIMITS.rules) { warnings.push('too many personal rules; ignored the rest'); break; }
    const errs = validateRule(r);
    if (errs.length || !isObj(r.source) || r.source.kind !== 'student') { warnings.push(`ignored an invalid personal rule (${errs[0] ? errs[0].message : 'not a student rule'})`); continue; }
    rules.push(clone(r));
  }

  const alt = {};
  if (isObj(raw.alt)) {
    for (const [k, v] of Object.entries(raw.alt)) {
      if (Object.keys(alt).length >= LIMITS.altPlans || !isObj(v) || !/^[A-Za-z0-9:+.-]{1,200}$/.test(k)) continue;
      const p = cleanMap(v.placed, termOk, LIMITS.tiles, warnings, 'saved plan');
      for (const t of Object.values(p)) terms.add(t);
      alt[k] = { placed: p, assign: cleanMap(v.assign, x => typeof x === 'string' && SAFE_ID.test(x), LIMITS.tiles, warnings, 'saved plan assignment') };
    }
  }

  const state = {
    v: STATE_VERSION, catalogYear, programs, tracks, terms: sortTerms(terms), placed, done,
    assign: cleanMap(raw.assign, v => typeof v === 'string' && SAFE_ID.test(v), LIMITS.tiles, warnings, 'assignment'),
    grants: cleanMap(raw.grants, v => GRANTS.includes(v), LIMITS.tiles, warnings, 'credit source'),
    meta: cleanMeta(raw.meta, warnings), custom, rules, alt, pristine: raw.pristine === true,
  };
  return { state, warnings };
}

/* ---------------------------------------------------------------- derived views */

/** The student as the rule engine sees them. Majors keep the order the student chose (the first is the primary program). */
export function studentOf(state, dataset) {
  const kind = id => (dataset.program(id) || {}).kind;
  const grants = {};
  for (const [id, t] of Object.entries(state.done)) if (t === COMPLETED) grants[id] = state.grants[id] || 'AP';
  return {
    catalogYear: state.catalogYear,
    majors: state.programs.filter(id => dataset.program(id) && kind(id) !== 'minor'),
    minors: state.programs.filter(id => dataset.program(id) && kind(id) === 'minor'),
    grants,
  };
}

/** Rules for this student: the shared packs plus their own personal rules. */
export const rulesOf = (state, dataset) => [...dataset.rules, ...state.rules];   // pass the result to createRuleset WITH countedFor (see ui/model.js derive) or "credited from another major" rules never apply

/** { placed, done } the way the checkers want it: done wins, custom courses are not checked but do count for credits. */
export const planOf = state => ({ placed: state.placed, done: state.done });

export const termOf = (state, id) => (state.done[id] !== undefined ? state.done[id] : state.placed[id]);
export const hasTile = (state, id) => state.done[id] !== undefined || state.placed[id] !== undefined;

/** A key for "this selection of programs and tracks", used to remember a plan while another selection is shown. */
export function planKey(state) {
  return state.programs.map(p => (state.tracks[p] ? `${p}:${state.tracks[p]}` : p)).join('+');
}

/* ---------------------------------------------------------------- operations (all mutate the state passed in) */

const touch = state => { state.pristine = false; return state; };

export function moveTile(state, id, toKey) {
  if (!isTermKey(toKey)) return state;
  const wasDone = state.done[id] !== undefined;
  const wasBank = wasDone && state.done[id] === COMPLETED;
  if (toKey === COMPLETED) state.done[id] = COMPLETED;                     // AP / transfer credit
  else if (wasDone && !wasBank) state.done[id] = toKey;                     // correct the term a completed course was taken in
  else { delete state.done[id]; state.placed[id] = toKey; }                 // an unchecked course, or one leaving the AP bucket
  return touch(state);
}

export function addTile(state, id, toKey) {
  state.placed[id] = toKey;
  delete state.done[id];
  return touch(state);
}

export function toggleDone(state, id) {
  if (state.done[id] !== undefined) delete state.done[id];
  else state.done[id] = state.placed[id] !== undefined ? state.placed[id] : defaultTerms(1)[1];
  return touch(state);
}

export function tilesIn(state, key) {
  return [...new Set([...Object.keys(state.placed), ...Object.keys(state.done)])].filter(id => termOf(state, id) === key);
}

export function toggleTermDone(state, key) {
  const ids = tilesIn(state, key);
  if (!ids.length) return state;
  const all = ids.every(id => state.done[id] !== undefined);
  for (const id of ids) { if (all) delete state.done[id]; else state.done[id] = key; }
  return touch(state);
}

export function deleteTile(state, id) {
  delete state.placed[id]; delete state.done[id]; delete state.assign[id]; delete state.grants[id]; delete state.meta[id]; delete state.custom[id];
  for (const alt of Object.values(state.alt)) { delete alt.placed[id]; delete alt.assign[id]; }
  return touch(state);
}

export function addTerm(state, key) {
  if (!isTermKey(key) || state.terms.includes(key)) return state;
  state.terms = sortTerms([...state.terms, key]);
  return touch(state);
}

/** Remove a term; its tiles move to the closest earlier term (or the AP bucket). Returns { moved, target }. */
export function removeTerm(state, key) {
  if (!termRemovable(state.terms, key)) return null;
  const remaining = state.terms.filter(k => k !== key);
  let target = null;
  for (const k of remaining) if (k !== COMPLETED && termPos(k) < termPos(key) && (target === null || termPos(k) > termPos(target))) target = k;
  if (target === null) target = COMPLETED;
  const moved = tilesIn(state, key).length;
  const fix = m => { for (const id of Object.keys(m)) if (m[id] === key) m[id] = target; };
  fix(state.placed); fix(state.done);
  for (const alt of Object.values(state.alt)) fix(alt.placed);
  state.terms = remaining;
  touch(state);
  return { moved, target };
}

export function addCustom(state, { code, title = '', cr = 3, diff = 'normal', note = '' }, toKey) {
  const id = `c-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  state.custom[id] = { code: str(code, 16), title: str(title, 60), cr, diff: DIFFS.includes(diff) ? diff : 'normal' };
  if (str(note, 200)) state.meta[id] = { note: str(note, 200) };
  if (toKey === COMPLETED) { state.placed[id] = defaultTerms(1)[1]; state.done[id] = COMPLETED; }
  else state.placed[id] = toKey;
  touch(state);
  return id;
}

export function setMeta(state, id, patch) {
  const cur = { ...(state.meta[id] || {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] === '' || cur[k] === undefined || cur[k] === null || (k === 'diff' && cur[k] === 'normal')) delete cur[k];
  if (Object.keys(cur).length) state.meta[id] = cur; else delete state.meta[id];
  return touch(state);
}

/** "This course fills that requirement" (a student's own decision; it overrides what the audit would pick). */
export function assignCourse(state, courseId, requirementId) {
  if (requirementId) state.assign[courseId] = requirementId; else delete state.assign[courseId];
  return touch(state);
}

/** Replace a placeholder tile by a real course in the same term, remembering which requirement it is for. */
export function fillSlot(state, slotId, courseId) {
  const term = termOf(state, slotId) || defaultTerms(1)[1];
  const wasDone = state.done[slotId] !== undefined;
  delete state.placed[slotId]; delete state.done[slotId]; delete state.meta[slotId];
  state.placed[courseId] = term;
  if (wasDone) state.done[courseId] = term; else delete state.done[courseId];
  state.assign[courseId] = slotId;
  return touch(state);
}

/**
 * Put a recommended arrangement in place (placements, assignments, terms). Completed courses stay marked as completed.
 * `reset` also clears completion marks (the Reset button).
 */
export function applyRecommended(state, rec, { reset = false } = {}) {
  state.placed = { ...rec.placed };
  state.assign = { ...rec.assign };
  state.terms = sortTerms(new Set([...defaultTerms(4), ...rec.terms, ...Object.values(state.done)]));
  if (reset) { state.done = {}; state.grants = {}; }
  for (const id of Object.keys(state.meta)) if (id.includes('/') && !(id in state.placed) && !(id in state.done)) delete state.meta[id];
  state.pristine = true;
  return state;
}

/**
 * Change the selected programs. Placeholder tiles of a removed program go away (real courses stay) and the tracks map is kept
 * in step. Anything else about the plan is left alone.
 */
export function setPrograms(state, programs, tracks = state.tracks) {
  const keep = new Set(programs);
  for (const id of Object.keys(state.placed)) if (id.includes('/') && !keep.has(id.split('/')[0])) delete state.placed[id];
  for (const id of Object.keys(state.done)) if (id.includes('/') && !keep.has(id.split('/')[0])) delete state.done[id];
  state.programs = [...programs];
  state.tracks = Object.fromEntries(Object.entries(tracks).filter(([p]) => keep.has(p)));
  return state;
}

/**
 * Switch one program to another track (for example standard -> pre-med). The arrangement being left is remembered under its plan
 * key; when the new selection was seen before its arrangement comes back. Returns true when it did (otherwise the caller loads
 * the track's recommended plan). A track equal to the program's default is stored as "no track".
 */
export function switchTrack(state, programId, trackId, { isDefault = false } = {}) {
  state.alt[planKey(state)] = { placed: { ...state.placed }, assign: { ...state.assign } };
  const keys = Object.keys(state.alt);
  if (keys.length > LIMITS.altPlans) for (const k of keys.slice(0, keys.length - LIMITS.altPlans)) delete state.alt[k];
  const tracks = { ...state.tracks };
  if (isDefault) delete tracks[programId]; else tracks[programId] = trackId;
  state.tracks = tracks;
  const saved = state.alt[planKey(state)];
  touch(state);
  if (!saved) return false;
  state.placed = { ...saved.placed };
  state.assign = { ...saved.assign };
  state.terms = sortTerms(new Set([...state.terms, ...Object.values(state.placed)]));
  return true;
}

/** Add the recommended tiles that are not in the plan yet (used when a program is added to a plan the student has edited). */
export function addMissing(state, rec) {
  let added = 0;
  for (const [id, term] of Object.entries(rec.placed)) {
    if (state.placed[id] !== undefined || state.done[id] !== undefined) continue;
    state.placed[id] = term;
    added++;
  }
  for (const [c, r] of Object.entries(rec.assign)) if (!(c in state.assign)) state.assign[c] = r;
  state.terms = sortTerms(new Set([...state.terms, ...rec.terms]));
  touch(state);
  return added;
}

/** Credits the student has completed / planned: tiles are counted at their described credits. */
export function creditTotals(state, creditsOf) {
  let done = 0, total = 0;
  for (const id of new Set([...Object.keys(state.placed), ...Object.keys(state.done)])) {
    const c = creditsOf(id);
    total += c;
    if (state.done[id] !== undefined) done += c;
  }
  return { done, total };
}

export { isFixedTerm };
