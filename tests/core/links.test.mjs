import test from 'node:test';
import assert from 'node:assert/strict';
import './../helpers/data.mjs';   // installs fflate for the compressed link forms
import { readJson, loadDataset } from '../helpers/data.mjs';
import { decodeCompact, decodeData, decodePlan, beToV3, fromLegacyBE, fromLegacyEE, readLegacyQuery, readLegacyStorage } from '../../src/core/legacy-links.js';
import { encodeLink, decodeLink } from '../../src/core/links.js';
import { normalizeState, StateError, planKey, emptyState } from '../../src/core/state.js';
import { describeTile } from '../../src/core/tiles.js';

const links = (await readJson('tests/golden/links.json'));
const Y = '2026-2027';
const clone = x => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ the frozen readers give back exactly what the old app decoded */

test('LEGACY ?p= (v6 compact): every recorded link decodes to the plan it was made from', () => {
  for (const f of links.beCompact) {
    assert.deepEqual(decodeCompact(f.link), f.decoded, f.name);
    assert.deepEqual(decodeCompact(f.link), { ...f.state, tileMeta: f.state.tileMeta || {} }, `${f.name}: the old app round-tripped its own state`);
  }
});

test('LEGACY ?p=: a truncated or damaged link is refused, never half-loaded', () => {
  const link = links.beCompact[0].link;
  assert.equal(decodeCompact(link.slice(0, -5)), null);
  assert.equal(decodeCompact(link.slice(0, 10) + 'x' + link.slice(11)), null);
  assert.equal(decodeCompact('garbage'), null);
  assert.equal(decodeCompact(''), null);
});

test('LEGACY ?data= and ?plan=: base64 JSON decodes, also when a "+" became a space', () => {
  for (const f of links.beLegacyData) assert.deepEqual(decodeData(f.payload), f.decoded, f.name);
  for (const f of links.eePlan) assert.deepEqual(decodePlan(f.payload), f.state, f.name);
  const withPlus = links.beLegacyData.find(f => f.payload.includes('+'));
  if (withPlus) assert.deepEqual(decodeData(withPlus.payload.replace(/\+/g, ' ')), withPlus.decoded);
  assert.equal(decodeData('!!!not base64'), null);
});

test('LEGACY BE formats v1 and v2 still upgrade to the same v3 shape as before', () => {
  for (const f of links.beOldFormats) assert.deepEqual(beToV3(f.input, f.track), f.v3, f.name);
});

/* ------------------------------------------------------------------ old BE state -> state v3 */

const beTile = { HUM1: 'BE-BSBE/gen-ed/humanity/1', HUM2: 'BE-BSBE/gen-ed/humanity/2', HUM3: 'BE-BSBE/gen-ed/humanity/3', DES1: 'BE-BSBE/design-electives/1', DES2: 'BE-BSBE/design-electives/2', DES3: 'BE-BSBE/design-electives/3', ART: 'BE-BSBE/gen-ed/art', SOCSCI: 'BE-BSBE/gen-ed/socsci', TECHELEC: 'BE-BSBE/tech-elective', ELEC: 'BE-BSBE/general-elective' };
const PREMED_ONLY = new Set(['PHYS2108', 'PHYS2109', 'CHEM2262', 'CHEM2364']);
const STANDARD_ONLY = new Set(['TECHELEC', 'ELEC']);

test('BE links become a BE-BSBE state: same plan on the active track, the other track kept for switching back', async () => {
  const ds = await loadDataset();
  for (const f of links.beCompact) {
    const old = f.decoded;
    const s = fromLegacyBE(old, { catalogYear: Y });
    const { state, warnings } = normalizeState(s);
    assert.deepEqual(warnings, [], f.name);
    assert.deepEqual(state.programs, ['BE-BSBE']);
    assert.deepEqual(state.tracks, old.track === 'premed' ? { 'BE-BSBE': 'premed' } : {}, 'the standard track is the default and is stored as no track');
    const active = old.track === 'premed' ? old.pm : old.std;
    const notMine = id => (old.track === 'premed' ? STANDARD_ONLY : PREMED_ONLY).has(id);
    for (const [id, term] of Object.entries(active)) {
      if (notMine(id) || (old.tileMeta[id] && old.tileMeta[id].custom)) continue;
      assert.equal(state.placed[beTile[id] || id], term, `${f.name}: ${id}`);
    }
    for (const [id, term] of Object.entries(old.done)) assert.equal(state.done[beTile[id] || id], term, `${f.name}: done ${id}`);
    const otherTrack = old.track === 'premed' ? 'standard' : 'premed';
    assert.ok(state.alt[planKey({ programs: ['BE-BSBE'], tracks: otherTrack === 'premed' ? { 'BE-BSBE': 'premed' } : {} })], `${f.name}: other track kept`);
    // everything placed is something the planner can describe
    for (const id of Object.keys(state.placed)) assert.notEqual(describeTile(id, { dataset: ds, state }).type, 'unknown', `${f.name}: ${id}`);
  }
});

test('BE custom courses, notes, elective subtitles and AP credit survive the move', () => {
  const partial = links.beCompact.find(f => f.name === 'standard_partial');
  const s = normalizeState(fromLegacyBE(partial.decoded, { catalogYear: Y })).state;
  assert.equal(s.custom['c-test1'].code, 'TEST 1000');
  assert.equal(s.placed['c-test1'], 'year2-fall');
  assert.equal(s.meta['c-test1'].note, 'from a fixture');
  assert.equal(s.done.MATH1550, 'completed');
  assert.equal(s.grants.MATH1550, 'AP', 'the AP / transfer bucket counts as AP credit for the rules');
  assert.ok(s.terms.includes('year5-fall'));
  const withSub = fromLegacyBE({ ...partial.decoded, tileMeta: { SOCSCI: { subtitle: 'PSYC 2000', note: 'n' } } }, { catalogYear: Y });
  assert.equal(withSub.meta['BE-BSBE/gen-ed/socsci'].label, 'PSYC 2000');
});

test('BE v1 / v2 links (no completion info) load with the default plan filled in around them, as the old app did', () => {
  const s = normalizeState(fromLegacyBE(links.beOldFormats[0].input, { catalogYear: Y, track: 'standard' })).state;
  assert.equal(s.placed.BE1252, 'year1-spring');
  assert.equal(s.placed['BE-BSBE/gen-ed/humanity/1'], 'year3-fall', 'left at its default place');
});

/* ------------------------------------------------------------------ old EE / double-major state -> state v3 */

test('EE links: programs, renamed courses and placeholders map to the new programs; nothing is lost', () => {
  const eeTile = { ART: 'EE-BSEE/gen-ed/art', HUMN1: 'EE-BSEE/gen-ed/humanities/1', HUMN2: 'EE-BSEE/gen-ed/humanities/2', SOCSCI1: 'EE-BSEE/gen-ed/socsci', SOCSCI_2000: 'EE-BSEE/gen-ed/socsci-2000', LIFESCI: 'EE-BSEE/gen-ed/life-science', EE_BREADTH1: 'EE-BSEE/breadth/1', EE_DESIGN1: 'EE-BSEE/ee-design/1', EE_TECH1: 'EE-BSEE/ee-tech/1', BE_DES1: 'BE-BSBE/design-electives/1' };
  for (const f of links.eePlan) {
    const old = decodePlan(f.payload);
    const { state, warnings } = normalizeState(fromLegacyEE(old, { catalogYear: Y }));
    assert.deepEqual(warnings, [], f.name);
    assert.equal(Object.keys(state.placed).length, Object.keys(old.plan).length, `${f.name}: one tile per old tile`);
    assert.equal(state.programs[0], old.major === 'EE' ? 'EE-BSEE' : 'BE-BSBE');
    assert.equal(state.programs.includes('BE-BSBE') && state.programs.includes('EE-BSEE'), !!old.doubleMajor || false, f.name);
    assert.equal(state.programs.includes('ROBO-MIN'), old.minor === 'ROBOTICS');
    if ('EE1810' in old.plan) assert.equal(state.placed.EE1820, old.plan.EE1810, `${f.name}: EE 1810 is EE 1820 now`);
    assert.ok(!('EE1810' in state.placed) && !('EE2810' in state.placed));
    for (const [oldId, newId] of Object.entries(eeTile)) {
      if (!(oldId in old.plan)) continue;
      const home = newId.split('/')[0];
      if (state.programs.includes(home)) assert.equal(state.placed[newId], old.plan[oldId], `${f.name}: ${oldId}`);
    }
  }
});

test('EE state: a placeholder whose program is no longer selected becomes a custom course instead of vanishing', () => {
  const old = decodePlan(links.eePlan.find(f => f.name === 'ee_preset').payload);
  const s = normalizeState(fromLegacyEE({ ...old, plan: { ...old.plan, BE_DES1: 'year4-fall', HUMN3: 'year4-fall' } }, { catalogYear: Y })).state;
  const customs = Object.values(s.custom).map(c => c.code);
  assert.ok(customs.includes('BE DESIGN 1') && customs.includes('HUMN GEN ED 3'), customs.join(','));
  assert.equal(Object.keys(s.placed).length, Object.keys(old.plan).length + 2);
});

test('EE done map: completed courses and the AP bucket carry over', () => {
  const f = links.eePlan.find(x => x.name === 'double_partial_done');
  const old = decodePlan(f.payload);
  const s = normalizeState(fromLegacyEE(old, { catalogYear: Y })).state;
  assert.equal(s.done.MATH1550, 'completed');
  assert.equal(s.grants.MATH1550, 'AP');
  assert.equal(Object.keys(s.done).length, Object.keys(old.done).length);
});

/* ------------------------------------------------------------------ entry points */

test('readLegacyQuery reads each legacy parameter and refuses a broken one', () => {
  const p = new URLSearchParams({ p: links.beCompact[1].link });
  const a = readLegacyQuery(p, { catalogYear: Y });
  assert.equal(a.source, 'p'); assert.equal(a.state.tracks['BE-BSBE'], 'premed');
  const d = readLegacyQuery(new URLSearchParams({ data: links.beLegacyData[0].payload, track: 'premed' }), { catalogYear: Y });
  assert.equal(d.source, 'data');
  const e = readLegacyQuery(new URLSearchParams({ plan: links.eePlan[2].payload }), { catalogYear: Y });
  assert.equal(e.source, 'plan'); assert.deepEqual(e.state.programs, ['EE-BSEE', 'BE-BSBE', 'ROBO-MIN']);
  assert.equal(readLegacyQuery(new URLSearchParams({ s: 'x' }), { catalogYear: Y }), null, 'not a legacy parameter');
  assert.throws(() => readLegacyQuery(new URLSearchParams({ p: '6~s~broken' }), { catalogYear: Y }), StateError);
  assert.throws(() => readLegacyQuery(new URLSearchParams({ plan: '@@@' }), { catalogYear: Y }), StateError);
});

test('readLegacyStorage migrates a plan saved by either old planner', () => {
  const be = readLegacyStorage('becp.v3.state', JSON.stringify(links.beCompact[0].decoded), { catalogYear: Y });
  assert.deepEqual(be.state.programs, ['BE-BSBE']);
  const ee = readLegacyStorage('lsuee.v2.state', JSON.stringify(decodePlan(links.eePlan[2].payload)), { catalogYear: Y });
  assert.deepEqual(ee.state.programs, ['EE-BSEE', 'BE-BSBE', 'ROBO-MIN']);
});

/* ------------------------------------------------------------------ new ?s= links */

function sample() {
  const s = emptyState({ catalogYear: Y, programs: ['EE-BSEE', 'BE-BSBE'], tracks: {} });
  Object.assign(s.placed, { EE1820: 'year1-fall', MATH1550: 'year1-fall', 'EE-BSEE/breadth/1': 'year3-fall', 'c-abc123': 'year2-fall' });
  Object.assign(s.done, { MATH1550: 'completed' });
  s.grants.MATH1550 = 'AP';
  s.custom['c-abc123'] = { code: 'ENGR 3100', title: 'Robotics', cr: 3, diff: 'hard' };
  s.meta['c-abc123'] = { note: 'counts for the minor' };
  s.assign.EE3220 = 'EE-BSEE/breadth/1';
  s.terms = [...s.terms, 'year5-fall'];
  s.pristine = false;
  return s;
}

test('?s= links round-trip the whole state, compressed or not', () => {
  const s = sample();
  const link = encodeLink(s);
  assert.match(link, /^3[zj]/);
  const back = decodeLink(link, { defaultCatalogYear: Y });
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.state, normalizeState(s).state);
  const saved = globalThis.fflate; globalThis.fflate = undefined;
  try {
    const plain = encodeLink(s);
    assert.match(plain, /^3j/);
    assert.deepEqual(decodeLink(plain, { defaultCatalogYear: Y }).state, normalizeState(s).state);
  } finally { globalThis.fflate = saved; }
});

test('?s= links are refused when truncated, damaged or from the future', () => {
  const link = encodeLink(sample());
  assert.throws(() => decodeLink(link.slice(0, -4)), StateError);
  assert.throws(() => decodeLink(link.slice(0, 20) + (link[20] === 'A' ? 'B' : 'A') + link.slice(21)), StateError);
  assert.throws(() => decodeLink('9' + link.slice(1)), /newer version/);
  assert.throws(() => decodeLink(''), StateError);
});

test('a default-size double-major plan fits in a link of reasonable length', async () => {
  const { recommend } = await import('../../src/core/plan.js');
  const { studentOf, applyRecommended } = await import('../../src/core/state.js');
  const ds = await loadDataset();
  const s = emptyState({ catalogYear: Y, programs: ['EE-BSEE', 'BE-BSBE'] });
  applyRecommended(s, recommend({ dataset: ds, student: studentOf(s, ds) }));
  const link = encodeLink(s);
  assert.ok(link.length < 900, `link is ${link.length} characters`);
});

test('normalizeState never trusts its input', () => {
  const evil = { v: 3, catalogYear: '2026-2027', programs: ['EE-BSEE', '../../x', 'BE-BSBE', 'BE-BSBE'], tracks: { 'EE-BSEE': 'A B', 'BE-BSBE': 'premed' },
    placed: { EE1820: 'year1-fall', '<script>': 'year1-fall', MATH1550: 'nowhere', ['a'.repeat(200)]: 'year1-fall' }, done: 'x', assign: { EE3220: 5 },
    meta: { EE1820: { note: 'n'.repeat(500), cr: 999, diff: 'nasty' } }, rules: [{ type: 'equivalent' }, 5],
    custom: { 'c-ok': { code: 'X 1', cr: 3 }, bad: { code: 'Y' } }, terms: ['year1-fall', 'year99-fall', 'bogus'], extra: 1 };
  const { state, warnings } = normalizeState(evil);
  assert.deepEqual(state.programs, ['EE-BSEE', 'BE-BSBE']);
  assert.deepEqual(state.tracks, { 'BE-BSBE': 'premed' });
  assert.deepEqual(Object.keys(state.placed), ['EE1820']);
  assert.equal(state.meta.EE1820.note.length, 200);
  assert.equal(state.meta.EE1820.cr, undefined);
  assert.deepEqual(state.rules, []);
  assert.deepEqual(Object.keys(state.custom), ['c-ok']);
  assert.ok(!state.terms.includes('year99-fall') && !state.terms.includes('bogus'));
  assert.ok(warnings.length >= 4);
  assert.ok(!('extra' in state));
  assert.throws(() => normalizeState({ v: 2 }), StateError);
  assert.throws(() => normalizeState(null), StateError);
});

/* ------------------------------------------------------------------ what a migrated plan looks like in the new audit */

test('a migrated legacy plan audits without errors; pre-med Orgo II fills the technical elective it replaced', async () => {
  const { auditAll } = await import('../../src/core/requirements.js');
  const { studentOf, rulesOf } = await import('../../src/core/state.js');
  const ds = await loadDataset();
  const audit = s => auditAll({ dataset: ds, plan: { placed: s.placed, done: s.done }, student: studentOf(s, ds), rules: rulesOf(s, ds), assignments: s.assign });

  const pm = normalizeState(fromLegacyBE(links.beCompact.find(f => f.name === 'premed_default').decoded, { catalogYear: Y })).state;
  const a = audit(pm).byProgram['BE-BSBE'];
  assert.equal(a.summary.missing, 0, a.demands.filter(d => d.status === 'missing').map(d => d.id).join(','));
  assert.equal(a.demands.find(d => d.id === 'BE-BSBE/tech-elective').course, 'CHEM2262');

  const std = normalizeState(fromLegacyBE(links.beCompact.find(f => f.name === 'standard_default').decoded, { catalogYear: Y })).state;
  assert.equal(audit(std).byProgram['BE-BSBE'].summary.missing, 0, 'the old standard plan is still a complete BE plan');

  for (const f of links.eePlan) {
    const s = normalizeState(fromLegacyEE(decodePlan(f.payload), { catalogYear: Y })).state;
    const r = audit(s);
    assert.equal(r.programs.length, s.programs.length, f.name);
  }
});
