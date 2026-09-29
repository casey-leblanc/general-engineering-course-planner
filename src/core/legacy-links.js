// FROZEN. Readers for every share-link and saved-state format the two old planners ever produced, so no existing link or
// bookmark stops working. They only ever READ old formats and turn them into a version-3 state (state.js); nothing here is
// used to write links. Do not edit the tables below: the old links depend on them (recorded examples are in tests/golden/links.json).
//
//   ?p=<v6 compact>   old BE/pre-med planner (positional course index, append-only)
//   ?data=<base64>    old BE/pre-med planner (full JSON)
//   ?plan=<base64>    old EE / double-major planner (full JSON)
//   localStorage becp.v3.state / becp.v2.state (BE) and lsuee.v2.state (EE)
import { emptyState, StateError, normalizeState, planKey } from './state.js';
import { termPos, defaultTerms } from './terms.js';

/* ---------------------------------------------------------------- frozen tables (from the old app.js) */

// Append-only index of every course/placeholder the v6 compact link could carry positionally.
export const SHARE_CODES = ['BE1251', 'CHEM1201', 'BIOL1201', 'MATH1550', 'BIOL1208', 'ENGL1001', 'BE1252', 'BIOL1202', 'MATH1552', 'CHEM1202', 'BIOL1209', 'PHYS2110', 'BE2352', 'BIOL2051', 'EE2950', 'MATH2065', 'CE2450', 'BE2350', 'CE3400', 'PHYS2113', 'ENGL2000', 'CHEM1212', 'CHEM2261', 'BE4303', 'AGEC2003', 'BIOL2083', 'ME3333', 'BE3340', 'BE4352', 'CE2200', 'BE3320', 'BE4390', 'CE2460', 'BE4392', 'PHYS2108', 'PHYS2109', 'CHEM2262', 'CHEM2364', 'HUM1', 'HUM2', 'DES1', 'DES2', 'ART', 'ELEC', 'DES3', 'HUM3', 'SOCSCI', 'TECHELEC'];
export const SHARE_TERMS = ['completed', 'year1-fall', 'year1-spring', 'year2-fall', 'year2-spring', 'year3-fall', 'year3-spring', 'year4-fall', 'year4-spring'];
const SHARE_ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// The old BE planner's default plans: a v1/v2 link that named only some courses got the rest of the default plan filled in.
const DEFAULT_PLAN_STD = [['year1-fall', ['BE1251', 'CHEM1201', 'BIOL1201', 'MATH1550', 'BIOL1208', 'ENGL1001']], ['year1-spring', ['BE1252', 'BIOL1202', 'MATH1552', 'CHEM1202', 'BIOL1209', 'PHYS2110']], ['year2-fall', ['BE2352', 'BIOL2051', 'EE2950', 'MATH2065', 'CE2450']], ['year2-spring', ['BE2350', 'CE3400', 'PHYS2113', 'ENGL2000', 'CHEM1212', 'CHEM2261']], ['year3-fall', ['BE4303', 'AGEC2003', 'BIOL2083', 'ME3333', 'HUM1']], ['year3-spring', ['BE3340', 'BE4352', 'CE2200', 'HUM2', 'DES1']], ['year4-fall', ['BE3320', 'BE4390', 'CE2460', 'DES2', 'ART', 'ELEC']], ['year4-spring', ['BE4392', 'DES3', 'HUM3', 'SOCSCI', 'TECHELEC']]];
const DEFAULT_PLAN_PM = [['year1-fall', ['BE1251', 'CHEM1201', 'BIOL1201', 'MATH1550', 'BIOL1208', 'ENGL1001']], ['year1-spring', ['BE1252', 'BIOL1202', 'MATH1552', 'CHEM1202', 'BIOL1209', 'PHYS2110', 'PHYS2108']], ['year2-fall', ['BE2352', 'CHEM1212', 'CHEM2261', 'MATH2065', 'CE2450', 'SOCSCI']], ['year2-spring', ['BIOL2051', 'BIOL2083', 'CHEM2262', 'PHYS2113', 'PHYS2109', 'ENGL2000']], ['year3-fall', ['AGEC2003', 'ART', 'BE4303', 'CE2200', 'CE3400', 'CHEM2364']], ['year3-spring', ['BE2350', 'BE3340', 'BE4352', 'EE2950', 'ME3333']], ['year4-fall', ['BE3320', 'BE4390', 'CE2460', 'DES1', 'HUM1']], ['year4-spring', ['BE4392', 'DES2', 'DES3', 'HUM2', 'HUM3']]];
const BE_PLACEHOLDERS = ['HUM1', 'HUM2', 'HUM3', 'DES1', 'DES2', 'DES3', 'ART', 'SOCSCI', 'TECHELEC', 'ELEC'];
const PREMED_ONLY = new Set(['PHYS2108', 'PHYS2109', 'CHEM2262', 'CHEM2364']);
const STANDARD_ONLY = new Set(['TECHELEC', 'ELEC']);
const belongsToTrack = (id, track) => (PREMED_ONLY.has(id) ? track === 'premed' : STANDARD_ONLY.has(id) ? track === 'standard' : true);
const BE_KNOWN = new Set([...SHARE_CODES, ...BE_PLACEHOLDERS]);

// Old placeholder ids -> requirement ids of the new programs (a tile id in the new planner is the requirement it stands for).
const BE_TILE = { HUM1: 'BE-BSBE/gen-ed/humanity/1', HUM2: 'BE-BSBE/gen-ed/humanity/2', HUM3: 'BE-BSBE/gen-ed/humanity/3', DES1: 'BE-BSBE/design-electives/1', DES2: 'BE-BSBE/design-electives/2', DES3: 'BE-BSBE/design-electives/3', ART: 'BE-BSBE/gen-ed/art', SOCSCI: 'BE-BSBE/gen-ed/socsci', TECHELEC: 'BE-BSBE/tech-elective', ELEC: 'BE-BSBE/general-elective' };
// The old EE planner shared some placeholders between the two majors; the new one has a tile per program, and a tile of one
// program can stand in for the other's slot. So a shared old tile goes to the first of these programs the student has.
const EE_TILE = {
  ART: ['EE-BSEE/gen-ed/art', 'BE-BSBE/gen-ed/art'], HUMN1: ['EE-BSEE/gen-ed/humanities/1', 'BE-BSBE/gen-ed/humanity/1'], HUMN2: ['EE-BSEE/gen-ed/humanities/2', 'BE-BSBE/gen-ed/humanity/2'], HUMN3: ['BE-BSBE/gen-ed/humanity/3'],
  SOCSCI1: ['EE-BSEE/gen-ed/socsci', 'BE-BSBE/gen-ed/socsci'], SOCSCI_2000: ['EE-BSEE/gen-ed/socsci-2000'], LIFESCI: ['EE-BSEE/gen-ed/life-science'],
  EE_BREADTH1: ['EE-BSEE/breadth/1'], EE_BREADTH2: ['EE-BSEE/breadth/2'], EE_BREADTH3: ['EE-BSEE/breadth/3'], EE_BREADTH4: ['EE-BSEE/breadth/4'], EE_BREADTH5: ['EE-BSEE/breadth/5'], EE_BREADTH6: ['EE-BSEE/breadth/6'],
  EE_DESIGN1: ['EE-BSEE/ee-design/1'], EE_DESIGN2: ['EE-BSEE/ee-design/2'], EE_DESIGN3: ['EE-BSEE/ee-design/3'],
  EE_TECH1: ['EE-BSEE/ee-tech/1'], EE_TECH2: ['EE-BSEE/ee-tech/2'], EE_TECH3: ['EE-BSEE/ee-tech/3'],
  BE_DES1: ['BE-BSBE/design-electives/1'], BE_DES2: ['BE-BSBE/design-electives/2'], BE_DES3: ['BE-BSBE/design-electives/3'], BE_TECH: ['BE-BSBE/tech-elective'], BE_ELEC: ['BE-BSBE/general-elective'],
};
// What an old placeholder was called, so one with no home in the new programs survives as a custom course.
const OLD_PLACEHOLDER = {
  ART: ['ART GEN ED', 3], HUMN1: ['HUMN GEN ED 1', 3], HUMN2: ['HUMN GEN ED 2', 3], HUMN3: ['HUMN GEN ED 3', 3], SOCSCI1: ['SOC SCI 1', 3], SOCSCI_2000: ['SOC SCI 2000+', 3], LIFESCI: ['LIFE SCI', 3],
  EE_BREADTH1: ['EE BREADTH 1', 3], EE_BREADTH2: ['EE BREADTH 2', 3], EE_BREADTH3: ['EE BREADTH 3', 3], EE_BREADTH4: ['EE BREADTH 4', 3], EE_BREADTH5: ['EE BREADTH 5', 3], EE_BREADTH6: ['EE BREADTH 6', 3],
  EE_DESIGN1: ['EE DESIGN 1', 3], EE_DESIGN2: ['EE DESIGN 2', 3], EE_DESIGN3: ['EE DESIGN 3', 3], EE_TECH1: ['TECH ELECT 1', 3], EE_TECH2: ['TECH ELECT 2', 3], EE_TECH3: ['TECH ELECT 3', 3],
  BE_DES1: ['BE DESIGN 1', 3], BE_DES2: ['BE DESIGN 2', 3], BE_DES3: ['BE DESIGN 3', 3], BE_TECH: ['BE TECH ELEC', 3], BE_ELEC: ['BE ELECTIVE', 2],
};
// Courses the 2026-27 catalog renamed.
const RENAMED = { EE1810: 'EE1820', EE2810: 'EE2820' };
const EE_PROGRAM = { EE: 'EE-BSEE', BE: 'BE-BSBE' };
const MINOR_PROGRAM = { ROBOTICS: 'ROBO-MIN' };

/* ---------------------------------------------------------------- byte / text helpers */

function fflateLib() {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  return g.fflate || null;
}
const b64urlToBytes = b64 => { b64 = String(b64).replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '='; const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
const b64urlDecode = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); };
const inflateStr = b64 => { const ff = fflateLib(); if (!ff) return null; try { return ff.strFromU8(ff.inflateSync(b64urlToBytes(b64))); } catch (e) { return null; } };
function shareChk(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return SHARE_ALPH.charAt((h >>> 6) & 63) + SHARE_ALPH.charAt(h & 63); }
const codeToTerm = c => (c === 0 ? 'completed' : `year${Math.floor(c / 3)}-${['fall', 'spring', 'summer'][c % 3]}`);

/* ---------------------------------------------------------------- readers of the raw formats */

/** ?p= (v6 compact). Returns the old BE v3 state object, or null when the string is not a valid v6 payload. */
export function decodeCompact(str) {
  if (typeof str !== 'string' || str.length < 3 || str.charAt(0) !== '6' || str.charAt(1) !== '~') return null;
  const chk = str.slice(-2), body = str.slice(0, -2);
  if (shareChk(body) !== chk) return null;                    // truncated or corrupted
  const p = body.split('~');
  if (p.length < 5) return null;
  let residual = {};
  if (p[5]) {
    const type = p[5].charAt(0), payload = p[5].slice(1);
    let json;
    if (type === 'j') { try { json = b64urlDecode(payload); } catch (e) { return null; } }
    else if (type === 'z') { json = inflateStr(payload); if (json == null) return null; }
    else return null;
    try { residual = JSON.parse(json); } catch (e) { return null; }
  }
  let termList;
  if (typeof residual.t === 'string') { termList = []; for (let i = 0; i < residual.t.length; i++) { const c = SHARE_ALPH.indexOf(residual.t.charAt(i)); if (c >= 0) termList.push(codeToTerm(c)); } }
  else if (Array.isArray(residual.t)) termList = residual.t;
  else termList = SHARE_TERMS;
  const STATES = BigInt(termList.length + 1);
  const strToBig = s => { let v = 0n; s = s || ''; for (let i = 0; i < s.length; i++) { const d = SHARE_ALPH.indexOf(s.charAt(i)); if (d < 0) return null; v = v * 64n + BigInt(d); } return v; };
  const decMap = s => {
    const map = {};
    let v = strToBig(s);
    if (v == null) return null;
    const vals = new Array(SHARE_CODES.length).fill(0);
    for (let i = 0; i < SHARE_CODES.length && v > 0n; i++) { vals[i] = Number(v % STATES); v = v / STATES; }
    for (let i = 0; i < SHARE_CODES.length; i++) { const val = vals[i]; if (val > 0 && val - 1 < termList.length) map[SHARE_CODES[i]] = termList[val - 1]; }
    return map;
  };
  const std = decMap(p[2]), pm = decMap(p[3]), done = decMap(p[4]);
  if (std == null || pm == null || done == null) return null;
  if (residual.x && typeof residual.x === 'object') {
    const maps = { std, pm, done };
    for (const mk in residual.x) if (maps[mk] && residual.x[mk] && typeof residual.x[mk] === 'object') for (const code in residual.x[mk]) if (typeof residual.x[mk][code] === 'string') maps[mk][code] = residual.x[mk][code];
  }
  return { v: 3, track: p[1] === 'p' ? 'premed' : 'standard', terms: termList.slice(), std, pm, done, tileMeta: residual.m && typeof residual.m === 'object' ? residual.m : {} };
}

/** ?data= (base64 JSON). Tries the value as given and with spaces restored to '+' (a '+' left unencoded became a space). */
export function decodeData(enc) {
  if (!enc) return null;
  for (const s of [enc, enc.replace(/ /g, '+')]) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { /* next */ }
    try { return JSON.parse(atob(s)); } catch (e) { /* next */ }
  }
  return null;
}

/** ?plan= (base64 JSON of the old EE state). */
export function decodePlan(enc) {
  if (!enc) return null;
  for (const s of [enc, enc.replace(/ /g, '+')]) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { /* next */ }
  }
  return null;
}

/* ---------------------------------------------------------------- old BE state (v1 / v2 / v3) -> v3 shape */

function beNormalizeV3(o) {
  const clean = m => { const r = {}; if (m && typeof m === 'object') for (const k in m) if (typeof m[k] === 'string') r[k] = m[k]; return r; };
  const terms = Array.isArray(o.terms) ? o.terms.filter(k => typeof k === 'string' && termPos(k) !== Infinity) : [];
  const set = new Set(terms.length ? terms : SHARE_TERMS.slice(1));
  set.add('completed');
  return { v: 3, track: o.track === 'premed' ? 'premed' : 'standard', terms: [...set].sort((a, b) => termPos(a) - termPos(b)), std: clean(o.std), pm: clean(o.pm), done: clean(o.done), tileMeta: o.tileMeta && typeof o.tileMeta === 'object' ? o.tileMeta : {} };
}
const planToPos = plan => { const o = {}; plan.forEach(([key, ids]) => ids.forEach(id => { o[id] = key; })); return o; };
function beBuildV3(track, terms, placements, meta) {
  track = track === 'premed' ? 'premed' : 'standard';
  const std = planToPos(DEFAULT_PLAN_STD), pm = planToPos(DEFAULT_PLAN_PM), done = {};
  const home = track === 'premed' ? pm : std, away = track === 'premed' ? std : pm;
  meta = meta && typeof meta === 'object' ? meta : {};
  for (const id in placements) {
    const key = placements[id];
    const doneFlag = meta[id] && meta[id].done === true;
    if (key === 'completed') done[id] = 'completed';
    else if (doneFlag) { done[id] = key; home[id] = key; }
    else home[id] = key;
    if (meta[id] && meta[id].custom && key !== 'completed' && away[id] === undefined) away[id] = key;
  }
  for (const id in meta) if (meta[id]) delete meta[id].done;
  const termSet = new Set(SHARE_TERMS.slice(1).concat('completed'));
  (terms || []).forEach(k => termSet.add(k));
  Object.values(done).forEach(k => { if (k !== 'completed') termSet.add(k); });
  return { v: 3, track, terms: [...termSet].filter(k => termPos(k) !== Infinity).sort((a, b) => termPos(a) - termPos(b)), std, pm, done, tileMeta: meta };
}
function beV2ToV3(o) {
  const cols = Array.isArray(o.columns) ? o.columns : [];
  const terms = cols.map(c => c && c.key).filter(k => typeof k === 'string');
  const placements = {};
  cols.forEach(c => { if (c && Array.isArray(c.tiles)) c.tiles.forEach(id => { placements[id] = c.key; }); });
  return beBuildV3('standard', terms, placements, o.tileMeta && typeof o.tileMeta === 'object' ? o.tileMeta : {});
}
function beV1ToV3(o, track) {
  track = track === 'premed' ? 'premed' : 'standard';
  const remap = track === 'premed' ? { TECHELEC: 'CHEM2262', ELEC: 'CHEM2364' } : {};
  const placements = {}, terms = new Set();
  const defaults = new Set(SHARE_TERMS);
  for (const key in o) {
    if (!Object.prototype.hasOwnProperty.call(o, key) || !Array.isArray(o[key]) || termPos(key) === Infinity) continue;
    const seen = new Set();
    let any = false;
    o[key].forEach(raw => { const id = remap[raw] || raw; if (BE_KNOWN.has(id) && belongsToTrack(id, track) && !seen.has(id)) { seen.add(id); placements[id] = key; any = true; } });
    if (defaults.has(key) || any) terms.add(key);
  }
  return beBuildV3(track, [...terms], placements, {});
}
/** Any old BE payload (v1 term lists, v2 columns, v3) as the old v3 shape. */
export function beToV3(obj, trackParam) {
  if (obj && obj.v === 3) return beNormalizeV3(obj);
  if (obj && obj.v === 2) return beV2ToV3(obj);
  return beV1ToV3(obj || {}, trackParam || 'standard');
}

/* ---------------------------------------------------------------- old state -> state v3 */

const sameDiff = d => (d === 'hard' || d === 'hardest' ? d : 'normal');

/** Placeholder / renamed-course mapping shared by both old apps. Returns the new tile id, or null when it must become a custom course. */
function mapOldTile(id, programs, table) {
  if (RENAMED[id]) return RENAMED[id];
  const target = table[id];
  if (!target) return id;                                   // a real course id: unchanged
  const options = [].concat(target);
  return options.find(t => programs.includes(t.split('/')[0])) || null;
}

/** Move an unmappable old placeholder into custom courses so the student's plan keeps every credit. */
function keepAsCustom(state, id, term, done) {
  const [code, cr] = OLD_PLACEHOLDER[id] || [id, 3];
  const cid = `c-legacy${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`;
  state.custom[cid] = { code: code.slice(0, 16), title: '', cr, diff: 'normal' };
  state.placed[cid] = term;
  if (done) state.done[cid] = done;
  return cid;
}

/**
 * Old BE/pre-med planner state (any of v1, v2, v3) -> state v3. The student was on the BE program, standard or pre-med track;
 * the other track's arrangement is kept under its plan key so switching tracks brings it back.
 */
export function fromLegacyBE(obj, { catalogYear, track = null } = {}) {
  const old = beToV3(obj, track);
  const state = emptyState({ catalogYear, programs: ['BE-BSBE'], tracks: old.track === 'premed' ? { 'BE-BSBE': 'premed' } : {} });
  state.terms = old.terms.slice();
  const active = old.track === 'premed' ? old.pm : old.std;
  const other = old.track === 'premed' ? old.std : old.pm;
  const map = id => (BE_TILE[id] ? BE_TILE[id] : RENAMED[id] || id);
  const customOf = id => old.tileMeta[id] && old.tileMeta[id].custom;

  const convertPlan = (src, into) => {
    for (const [id, term] of Object.entries(src)) {
      if (customOf(id)) { into[id.startsWith('c-') ? id : `c-${id}`] = term; continue; }
      if (!belongsToTrack(id, src === active ? old.track : (old.track === 'premed' ? 'standard' : 'premed'))) continue;
      into[map(id)] = term;
    }
  };
  convertPlan(active, state.placed);
  const altPlaced = {};
  convertPlan(other, altPlaced);
  for (const [id, term] of Object.entries(old.done)) { if (customOf(id)) { const nid = id.startsWith('c-') ? id : `c-${id}`; state.done[nid] = term; if (!(nid in state.placed)) state.placed[nid] = term === 'completed' ? 'year1-fall' : term; continue; } state.done[map(id)] = term; }
  for (const [id, m] of Object.entries(old.tileMeta)) {
    if (!m || typeof m !== 'object') continue;
    if (m.custom) {
      const nid = id.startsWith('c-') ? id : `c-${id}`;
      if (/^c-[A-Za-z0-9]{1,20}$/.test(nid)) state.custom[nid] = { code: String(m.code || 'COURSE').slice(0, 16), title: String(m.title || '').slice(0, 60), cr: Number.isInteger(parseInt(m.cr, 10)) ? parseInt(m.cr, 10) : 3, diff: sameDiff(m.diff) };
      if (m.note) state.meta[nid] = { note: String(m.note).slice(0, 200) };
    } else {
      const c = {};
      if (m.note) c.note = String(m.note).slice(0, 200);
      if (m.subtitle) c.label = String(m.subtitle).slice(0, 80);
      if (Number.isInteger(parseInt(m.cr, 10))) c.cr = parseInt(m.cr, 10);
      if (m.diff === 'hard' || m.diff === 'hardest') c.diff = m.diff;
      if (Object.keys(c).length) state.meta[map(id)] = c;
    }
  }
  for (const id of Object.keys(state.done)) if (state.done[id] === 'completed') state.grants[id] = 'AP';
  // On the pre-med track the old planner used Orgo II and the Orgo lab in place of the technical elective and the elective.
  if (old.track === 'premed') { state.assign.CHEM2262 = 'BE-BSBE/tech-elective'; state.assign.CHEM2364 = 'BE-BSBE/general-elective'; }
  const otherTrack = old.track === 'premed' ? 'standard' : 'premed';
  state.alt[planKey({ programs: ['BE-BSBE'], tracks: otherTrack === 'premed' ? { 'BE-BSBE': 'premed' } : {} })] = { placed: altPlaced, assign: {} };
  state.pristine = false;
  return state;
}

/** Old EE / double-major planner state (v2: major, doubleMajor, secondaryMajor, minor, plan, done, tileMeta) -> state v3. */
export function fromLegacyEE(obj, { catalogYear } = {}) {
  if (!obj || typeof obj !== 'object' || typeof obj.plan !== 'object' || !obj.plan) throw new StateError('not an EE planner state');
  const programs = [];
  const add = code => { const p = EE_PROGRAM[code]; if (p && !programs.includes(p)) programs.push(p); };
  add(obj.major || 'EE');
  if (obj.doubleMajor) add(obj.secondaryMajor || 'BE');
  if (MINOR_PROGRAM[obj.minor]) programs.push(MINOR_PROGRAM[obj.minor]);
  const state = emptyState({ catalogYear, programs });
  state.terms = (Array.isArray(obj.terms) ? obj.terms : defaultTerms(4)).filter(k => typeof k === 'string');
  const meta = obj.tileMeta && typeof obj.tileMeta === 'object' ? obj.tileMeta : {};
  const isCustom = id => meta[id] && meta[id].custom;
  const doneMap = obj.done && typeof obj.done === 'object' ? obj.done : {};

  // -> { nid, placed }: placed is true when the tile was already put in the plan (a placeholder turned into a custom course)
  const place = (id, term) => {
    if (isCustom(id)) return { nid: id.startsWith('c-') ? id : `c-${id}`, placed: false };
    const nid = mapOldTile(id, programs, EE_TILE);
    if (nid !== null) return { nid, placed: false };
    return { nid: keepAsCustom(state, id, term, doneMap[id]), placed: true };
  };
  for (const [id, term] of Object.entries(obj.plan)) {
    if (typeof term !== 'string') continue;
    const p = place(id, term);
    if (!p.placed) state.placed[p.nid] = term;
  }
  for (const [id, term] of Object.entries(doneMap)) {
    if (typeof term !== 'string') continue;
    const p = place(id, term);
    state.done[p.nid] = term;
    if (!(p.nid in state.placed)) state.placed[p.nid] = term === 'completed' ? 'year1-fall' : term;
  }
  for (const [id, m] of Object.entries(meta)) {
    if (!m || typeof m !== 'object') continue;
    if (m.custom) {
      const nid = id.startsWith('c-') ? id : `c-${id}`;
      if (/^c-[A-Za-z0-9]{1,20}$/.test(nid)) state.custom[nid] = { code: String(m.code || 'COURSE').slice(0, 16), title: String(m.title || '').slice(0, 60), cr: Number.isInteger(parseInt(m.cr, 10)) ? parseInt(m.cr, 10) : 3, diff: sameDiff(m.diff) };
      if (m.note) state.meta[nid] = { note: String(m.note).slice(0, 200) };
    } else if (m.note) {
      const nid = mapOldTile(id, programs, EE_TILE);
      if (nid) state.meta[nid] = { note: String(m.note).slice(0, 200) };
    }
  }
  for (const id of Object.keys(state.done)) if (state.done[id] === 'completed') state.grants[id] = 'AP';
  state.pristine = false;
  return state;
}

/* ---------------------------------------------------------------- entry points */

/**
 * Read whichever legacy parameter a URL carries.
 * @returns {null | {state, source, warnings}}  null when the query has no legacy parameter; throws StateError when one is present but unreadable
 */
export function readLegacyQuery(params, { catalogYear }) {
  const track = params.get('track') === 'premed' ? 'premed' : params.get('track') === 'standard' ? 'standard' : null;
  const finish = (state, source) => { const r = normalizeState(state, { defaultCatalogYear: catalogYear }); return { state: r.state, source, warnings: r.warnings }; };
  if (params.get('p')) {
    const obj = decodeCompact(params.get('p'));
    if (!obj) throw new StateError('could not decode ?p=');
    return finish(fromLegacyBE(obj, { catalogYear, track }), 'p');
  }
  if (params.get('data')) {
    const obj = decodeData(params.get('data'));
    if (!obj) throw new StateError('could not decode ?data=');
    return finish(fromLegacyBE(obj, { catalogYear, track }), 'data');
  }
  if (params.get('plan')) {
    const obj = decodePlan(params.get('plan'));
    if (!obj) throw new StateError('could not decode ?plan=');
    return finish(fromLegacyEE(obj, { catalogYear }), 'plan');
  }
  return null;
}

/** A plan an old planner saved in this browser. `key` is the localStorage key it was stored under. */
export function readLegacyStorage(key, text, { catalogYear }) {
  const obj = JSON.parse(text);
  const state = key === 'lsuee.v2.state' ? fromLegacyEE(obj, { catalogYear }) : fromLegacyBE(obj, { catalogYear, track: null });
  return normalizeState(state, { defaultCatalogYear: catalogYear });
}
export const LEGACY_STORAGE_KEYS = ['lsuee.v2.state', 'becp.v3.state', 'becp.v2.state'];
