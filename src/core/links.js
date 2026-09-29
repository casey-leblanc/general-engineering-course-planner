// Share links, current format: ?s=<version><type><payload><check>
//   version  '3'  (planner state version)
//   type     'z' deflated JSON | 'j' plain JSON (used when fflate is not available or compression would not help)
//   payload  base64url of the JSON
//   check    2 characters over everything before them, so a truncated or damaged link is refused instead of half-loaded
// The JSON is self-describing (course ids, program ids, catalog year), so it does not depend on any list that must only ever
// grow. Old links (?p=, ?data=, ?plan=) are read by legacy-links.js.
import { normalizeState, StateError, STATE_VERSION } from './state.js';
import { defaultTerms } from './terms.js';

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const fflateLib = () => (typeof globalThis !== 'undefined' ? globalThis : self).fflate || null;

function check(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return ALPH.charAt((h >>> 6) & 63) + ALPH.charAt(h & 63); }
const bytesToB64url = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlToBytes = b64 => { b64 = String(b64).replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '='; const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
const textToB64url = s => bytesToB64url(new TextEncoder().encode(s));
const b64urlToText = b64 => new TextDecoder('utf-8', { fatal: true }).decode(b64urlToBytes(b64));

/** Group `{id: term}` as `{term: [ids]}` (smaller and easier to read than repeating the term for every course). */
const byTerm = map => { const out = {}; for (const [id, t] of Object.entries(map)) (out[t] || (out[t] = [])).push(id); for (const t of Object.keys(out)) out[t].sort(); return out; };
const fromTerm = groups => { const out = {}; if (groups && typeof groups === 'object') for (const [t, ids] of Object.entries(groups)) if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') out[id] = t; return out; };

function toCompact(state) {
  const c = { y: state.catalogYear, p: state.programs };
  if (Object.keys(state.tracks).length) c.k = state.tracks;
  const isDefault = state.terms.length === defaultTerms(4).length && state.terms.every((t, i) => t === defaultTerms(4)[i]);
  if (!isDefault) c.t = state.terms;
  c.a = byTerm(state.placed);
  if (Object.keys(state.done).length) c.d = byTerm(state.done);
  if (Object.keys(state.assign).length) c.s = state.assign;
  if (Object.keys(state.grants).length) c.g = state.grants;
  if (Object.keys(state.meta).length) c.m = state.meta;
  if (Object.keys(state.custom).length) c.c = state.custom;
  if (state.rules.length) c.r = state.rules;
  if (state.pristine) c.u = 1;
  return c;
}

function fromCompact(c) {
  if (!c || typeof c !== 'object') throw new StateError('link payload is not an object');
  return {
    v: STATE_VERSION, catalogYear: c.y, programs: c.p, tracks: c.k || {}, terms: c.t || defaultTerms(4),
    placed: fromTerm(c.a), done: fromTerm(c.d), assign: c.s || {}, grants: c.g || {}, meta: c.m || {}, custom: c.c || {}, rules: c.r || [], alt: {}, pristine: c.u === 1,
  };
}

export function encodeLink(state) {
  const json = JSON.stringify(toCompact(state));
  const plain = 'j' + textToB64url(json);
  const ff = fflateLib();
  let body = plain;
  if (ff) {
    try {
      const z = 'z' + bytesToB64url(ff.deflateSync(ff.strToU8(json), { level: 9 }));
      if (z.length + 16 <= plain.length) body = z;      // compress only when it saves a real margin
    } catch (e) { /* keep plain */ }
  }
  const head = String(STATE_VERSION) + body;
  return head + check(head);
}

/** @returns {{state, warnings}}  Throws StateError with a message fit for the student when the link cannot be read. */
export function decodeLink(str, { defaultCatalogYear } = {}) {
  if (typeof str !== 'string' || str.length < 5) throw new StateError('This link is too short to be a plan.');
  if (str.charAt(0) !== String(STATE_VERSION)) throw new StateError('This link was made by a newer version of the planner.');
  if (check(str.slice(0, -2)) !== str.slice(-2)) throw new StateError('This link looks incomplete or damaged.');
  const type = str.charAt(1), payload = str.slice(2, -2);
  let json;
  try {
    if (type === 'j') json = b64urlToText(payload);
    else if (type === 'z') {
      const ff = fflateLib();
      if (!ff) throw new StateError('This link is compressed and the decompressor did not load.');
      json = ff.strFromU8(ff.inflateSync(b64urlToBytes(payload)));
    } else throw new StateError('Unknown link type.');
  } catch (e) {
    if (e instanceof StateError) throw e;
    throw new StateError('This link looks incomplete or damaged.');
  }
  let obj;
  try { obj = JSON.parse(json); } catch (e) { throw new StateError('This link looks incomplete or damaged.'); }
  return normalizeState(fromCompact(obj), { defaultCatalogYear });
}

export function linkFor(state, base) {
  return `${base}?s=${encodeLink(state)}`;
}
