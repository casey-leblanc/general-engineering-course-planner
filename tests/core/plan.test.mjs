import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDataset, root } from '../helpers/data.mjs';
import { recommend, planCredits } from '../../src/core/plan.js';
import { emptyState, studentOf, applyRecommended, rulesOf, toggleDone, moveTile, removeTerm, addTerm, deleteTile, fillSlot, setPrograms, switchTrack, addMissing, planKey, toggleTermDone, addCustom, creditTotals } from '../../src/core/state.js';
import { createRuleset } from '../../src/core/rules.js';
import { auditAll } from '../../src/core/requirements.js';
import { checkPlan } from '../../src/core/prereq.js';
import { buildScenario, flattenRequisites } from '../../src/core/scenario.js';
import { describeTile } from '../../src/core/tiles.js';
import { termPos } from '../../src/core/terms.js';

const require = createRequire(import.meta.url);
const planner = require(`${root}/planner.js`);
const HighsFactory = require(`${root}/highs.js`);
const Y = '2026-2027';

const stateFor = (ds, programs, tracks = {}) => {
  const s = emptyState({ catalogYear: Y, programs, tracks });
  const student = studentOf(s, ds);
  const rec = recommend({ dataset: ds, student, tracks });
  applyRecommended(s, rec);
  return { s, student, rec };
};
const auditOf = (ds, s, student) => auditAll({ dataset: ds, plan: { placed: s.placed, done: s.done }, student, rules: rulesOf(s, ds), assignments: s.assign });

/* ------------------------------------------------------------------ recommended plan with the advisor rules */

test('ADVISOR RULES in the recommended BE + EE plan: one senior design sequence, no EE 2950, shared gen-ed, design and elective slots', async () => {
  const ds = await loadDataset();
  const { s, student, rec } = stateFor(ds, ['EE-BSEE', 'BE-BSBE']);
  const ids = new Set(Object.keys(s.placed));
  for (const dropped of ['BE4390', 'BE4392', 'EE2950']) assert.ok(!ids.has(dropped), `${dropped} is covered by an advisor rule`);
  assert.ok(ids.has('EE4810') && ids.has('EE4820') && ids.has('EE2130'));
  for (const n of [1, 2, 3]) assert.ok(!ids.has(`BE-BSBE/design-electives/${n}`), 'EE design electives count as BE design electives');
  assert.ok(!ids.has('BE-BSBE/general-elective'), 'any course is a BE elective');
  const reasons = Object.fromEntries(rec.dropped.map(d => [d.id, d.reason]));
  assert.deepEqual(reasons.BE4390.via, ['be-senior-design-1-any-major']);
  assert.deepEqual(reasons.EE2950.via, ['be-ee2950-via-ee2120']);
  assert.equal(reasons.EE2950.by, 'EE2120', 'EE 2120 alone is assumed to be enough');

  // and the audit agrees: every requirement of both programs is filled (by a course or a placeholder), nothing missing
  const a = auditOf(ds, s, student);
  for (const p of a.programs) assert.equal(p.summary.missing, 0, `${p.program}: ${p.demands.filter(d => d.status === 'missing').map(d => d.id)}`);
  // BE's design electives are filled by the EE design placeholders, and it says so
  const be = a.byProgram['BE-BSBE'];
  const de = be.demands.filter(d => d.id.startsWith('BE-BSBE/design-electives/'));
  assert.equal(de.length, 3);
  for (const d of de) { assert.equal(d.status, 'placeholder'); assert.equal(d.sharedFrom, 'EE-BSEE'); assert.deepEqual(d.via, ['be-design-electives-ee-4000-design']); }
  // the plan is shorter than the two plans added together
  assert.ok(rec.credits < 127 + 128 - 40, `credits ${rec.credits}`);
  assert.equal(rec.credits, planCredits(s.placed, ds));
  assert.equal(rec.terms.length - 1, Math.ceil(rec.credits / 18), 'the fewest semesters that fit');
});

test('without the advisor rules the double-major plan keeps both senior design sequences and EE 2950', async () => {
  const ds = await loadDataset({ });
  const noRules = (await import('../../src/core/dataset.js')).createDataset({ courses: ds.courses, overlay: ds.overlay, programs: ds.programs, rulePacks: [] });
  const { s } = stateFor(noRules, ['EE-BSEE', 'BE-BSBE']);
  for (const id of ['BE4390', 'BE4392', 'EE2950']) assert.ok(id in s.placed, id);
  const withRules = stateFor(ds, ['EE-BSEE', 'BE-BSBE']);
  assert.ok(Object.keys(s.placed).length > Object.keys(withRules.s.placed).length);
});

test('a single program gets its own chart plan unchanged', async () => {
  const ds = await loadDataset();
  for (const id of ['EE-BSEE', 'BE-BSBE', 'CSC-CYB']) {
    const { rec } = stateFor(ds, [id]);
    assert.deepEqual(rec.dropped, []);
    const chart = Object.fromEntries(ds.program(id).recommendedPlan.flatMap(([t, tiles]) => tiles.map(x => [x, t])));
    assert.deepEqual(rec.placed, chart);
    assert.equal(rec.credits, ds.program(id).totalCredits, `${id}: the chart total`);
  }
});

test('the priority order only decides which program keeps a shared placeholder; the audit result is the same', async () => {
  const ds = await loadDataset();
  const a = stateFor(ds, ['EE-BSEE', 'BE-BSBE']), b = stateFor(ds, ['BE-BSBE', 'EE-BSEE']);
  for (const x of [a, b]) for (const p of auditOf(ds, x.s, x.student).programs) assert.equal(p.summary.missing, 0);
  assert.ok(Math.abs(a.rec.credits - b.rec.credits) <= 6, `${a.rec.credits} vs ${b.rec.credits}`);
});

test('the pre-med track: its own plan, Orgo II / lab assigned to the elective requirements, courses flagged', async () => {
  const ds = await loadDataset();
  const { s, student, rec } = stateFor(ds, ['BE-BSBE'], { 'BE-BSBE': 'premed' });
  assert.ok('CHEM2262' in s.placed && 'CHEM2364' in s.placed && 'PHYS2108' in s.placed);
  assert.ok(!('BE-BSBE/tech-elective' in s.placed) && !('BE-BSBE/general-elective' in s.placed));
  assert.equal(s.assign.CHEM2262, 'BE-BSBE/tech-elective');
  const a = auditOf(ds, s, student).byProgram['BE-BSBE'];
  assert.equal(a.summary.missing, 0);
  const tech = a.demands.find(d => d.id === 'BE-BSBE/tech-elective');
  assert.equal(tech.course, 'CHEM2262'); assert.equal(tech.assigned, true);
  const std = stateFor(ds, ['BE-BSBE'], { 'BE-BSBE': 'standard' });
  assert.ok('BE-BSBE/tech-elective' in std.s.placed && !('CHEM2262' in std.s.placed));
  assert.ok(rec.credits > 0);
});

/* ------------------------------------------------------------------ state operations (the old apps' semantics) */

test('state operations: move, complete, AP bucket, terms, delete, fill a slot', async () => {
  const ds = await loadDataset();
  const { s } = stateFor(ds, ['BE-BSBE']);
  moveTile(s, 'BE1251', 'year1-spring');
  assert.equal(s.placed.BE1251, 'year1-spring');
  toggleDone(s, 'BE1251');
  assert.equal(s.done.BE1251, 'year1-spring');
  moveTile(s, 'BE1251', 'year1-fall');                    // a completed course moved: fix the term it was taken in
  assert.equal(s.done.BE1251, 'year1-fall'); assert.equal(s.placed.BE1251, 'year1-spring');
  moveTile(s, 'BE1251', 'completed');
  assert.equal(s.done.BE1251, 'completed');
  moveTile(s, 'BE1251', 'year2-fall');                    // leaving the AP bucket re-plans it, unchecked
  assert.equal(s.done.BE1251, undefined); assert.equal(s.placed.BE1251, 'year2-fall');

  toggleTermDone(s, 'year1-fall');
  assert.ok(['CHEM1201', 'MATH1550'].every(id => s.done[id] === 'year1-fall'));
  toggleTermDone(s, 'year1-fall');
  assert.equal(s.done.CHEM1201, undefined);

  assert.equal(removeTerm(s, 'year1-fall'), null, 'the first four years are fixed');
  addTerm(s, 'year1-summer');
  s.placed.CHEM1202 = 'year1-summer';
  const r = removeTerm(s, 'year1-summer');
  assert.deepEqual(r, { moved: 1, target: 'year1-spring' });
  assert.equal(s.placed.CHEM1202, 'year1-spring');

  fillSlot(s, 'BE-BSBE/gen-ed/art', 'ART1001');
  assert.equal(s.placed.ART1001, 'year4-fall'); assert.ok(!('BE-BSBE/gen-ed/art' in s.placed));
  assert.equal(s.assign.ART1001, 'BE-BSBE/gen-ed/art');
  const id = addCustom(s, { code: 'ENGR 3100', title: 'Robotics', cr: 3 }, 'year3-fall');
  assert.equal(describeTile(id, { dataset: ds, state: s }).type, 'custom');
  deleteTile(s, id);
  assert.ok(!(id in s.custom) && !(id in s.placed));
  assert.equal(s.pristine, false);
  const t = creditTotals(s, x => describeTile(x, { dataset: ds, state: s }).credits);
  assert.ok(t.total > 100 && t.done === 0);
});

test('removing a program keeps real courses and drops only its placeholders; adding one can bring in its missing courses', async () => {
  const ds = await loadDataset();
  const { s } = stateFor(ds, ['EE-BSEE', 'BE-BSBE']);
  setPrograms(s, ['EE-BSEE']);
  assert.ok(!Object.keys(s.placed).some(id => id.startsWith('BE-BSBE/')));
  assert.ok('CHEM1201' in s.placed && 'BIOL1201' in s.placed, 'courses stay');
  assert.equal(planKey(s), 'EE-BSEE');
  const before = Object.keys(s.placed).length;
  s.done.MATH1550 = 'year1-fall';
  setPrograms(s, ['EE-BSEE', 'ROBO-MIN']);
  const rec = recommend({ dataset: ds, student: studentOf(s, ds) });
  const added = addMissing(s, rec);
  assert.equal(Object.keys(s.placed).length, before + added);
  assert.equal(s.done.MATH1550, 'year1-fall', 'completed work is untouched');
});

test('switching a program to another track remembers the arrangement being left and brings it back', async () => {
  const ds = await loadDataset();
  const { s } = stateFor(ds, ['BE-BSBE']);
  moveTile(s, 'BE1251', 'year1-spring');                        // an edit on the standard track
  const restored1 = switchTrack(s, 'BE-BSBE', 'premed');
  assert.equal(restored1, false, 'first visit: the caller loads the pre-med plan');
  assert.deepEqual(s.tracks, { 'BE-BSBE': 'premed' });
  applyRecommended(s, recommend({ dataset: ds, student: studentOf(s, ds), tracks: s.tracks }));
  assert.ok('CHEM2262' in s.placed);
  const restored2 = switchTrack(s, 'BE-BSBE', 'standard', { isDefault: true });
  assert.equal(restored2, true);
  assert.deepEqual(s.tracks, {}, 'the default track is stored as no track');
  assert.equal(s.placed.BE1251, 'year1-spring', 'the edit is still there');
  assert.ok(!('CHEM2262' in s.placed));
});

/* ------------------------------------------------------------------ solver input */

test('flattenRequisites: alternatives collapse to the one being planned; credit-or-registration is a same-term corequisite', () => {
  const has = new Set(['MATH2090']);
  const none = { has: id => has.has(id), equivalents: () => [] };
  assert.deepEqual(flattenRequisites({ all: [{ course: 'A1000', concurrent: 'ok' }, { course: 'B1000' }] }, null, none), { pre: ['B1000'], co: ['A1000'], coAny: false });
  assert.deepEqual(flattenRequisites({ any: [{ course: 'MATH2070' }, { course: 'MATH2090' }] }, null, none).pre, ['MATH2090']);
  assert.deepEqual(flattenRequisites({ any: [{ course: 'MATH2070' }, { course: 'MATH2065' }] }, null, none).pre, ['MATH2070'], 'first listed when none is planned');
  const both = flattenRequisites(null, { any: [{ course: 'X1000' }, { course: 'MATH2090' }] }, none);
  assert.deepEqual(both, { pre: [], co: ['MATH2090'], coAny: true });
  const viaRule = flattenRequisites({ course: 'EE2950' }, null, { has: id => id === 'EE2130', equivalents: id => (id === 'EE2950' ? [{ course: 'EE2130' }] : []) });
  assert.deepEqual(viaRule.pre, ['EE2130'], 'an advisor-equivalent course that is planned stands in');
  assert.deepEqual(flattenRequisites({ all: [{ standing: 'senior' }, { credits: 90 }, { consent: 'the instructor' }, { unparsed: 'text' }] }, null, none), { pre: [], co: [], coAny: false });
});

async function solve(scn, limit = 20) {
  const highs = await HighsFactory({ locateFile: f => `${root}/${f}` });
  return planner.solvePlan(scn, lp => highs.solve(lp, { output_flag: false, mip_rel_gap: 0.05, time_limit: limit }));
}

test('SOLVER on program data: the BE plan arranges with no prerequisite, offering or corequisite problem, senior design back to back', async () => {
  const ds = await loadDataset();
  const { s, student, rec } = stateFor(ds, ['BE-BSBE']);
  const ruleset = createRuleset(rulesOf(s, ds), student);
  const scn = buildScenario({ dataset: ds, ruleset, state: s, sequences: ds.program('BE-BSBE').sequences, anchor: rec.placed });
  assert.deepEqual(scn.pairs, [{ a: 'BE4390', b: 'BE4392', gap: 1 }]);
  const byId = Object.fromEntries(scn.movable.map(m => [m.id, m]));
  assert.deepEqual(byId.BE2350.co.sort(), ['EE2950', 'PHYS2113'], 'coreq "any of EE 2120, EE 2950, PHYS 2113" keeps the members that are in the plan (EE 2120 is not)');
  assert.equal(byId.BE2350.coAny, true);
  assert.equal(byId.BE4390.eff, 6, 'senior design I counts double');
  assert.equal(byId.BE4392.eff, 9);
  assert.deepEqual(byId.BE1251.seasons, ['F']);
  assert.equal(byId['BE-BSBE/design-electives/1'].isDesign, true);
  assert.equal(byId['BE-BSBE/gen-ed/art'].isHum, true);
  assert.equal(byId.ENGL1001.float, true);
  const res = await solve(scn);
  assert.equal(res.status, 'optimal');
  const placed = { ...s.placed, ...res.placements };
  assert.equal(termPos(placed.BE4392) - termPos(placed.BE4390), 1);
  const checks = checkPlan({ dataset: ds, ruleset, plan: { placed, done: {} }, student });
  assert.deepEqual(Object.entries(checks).filter(([, r]) => !r.ok).map(([id]) => id), []);
  // design electives need 60 credits first
  for (const id of Object.keys(placed).filter(x => x.includes('design-electives'))) {
    let before = 0;
    for (const [k, t] of Object.entries(placed)) if (termPos(t) < termPos(placed[id])) before += describeTile(k, { dataset: ds, state: s }).credits;
    assert.ok(before >= 60, `${id} has ${before} credits before it`);
  }
});

test('SOLVER with completed work: completed courses are fixed, only the rest moves, and requisites of completed courses hold', async () => {
  const ds = await loadDataset();
  const { s, student, rec } = stateFor(ds, ['EE-BSEE']);
  for (const id of Object.keys(s.placed)) if (['year1-fall', 'year1-spring'].includes(s.placed[id])) s.done[id] = s.placed[id];
  s.done.MATH1550 = 'completed';
  const ruleset = createRuleset(rulesOf(s, ds), student);
  const scn = buildScenario({ dataset: ds, ruleset, state: s, sequences: ds.program('EE-BSEE').sequences, anchor: rec.placed });
  assert.ok(scn.movable.every(m => !(m.id in s.done)));
  assert.equal(scn.apCredits, 5);
  assert.equal(scn.terms.find(t => t.key === 'year1-fall').open, false, 'a fully completed term is closed');
  const res = await solve(scn);
  assert.equal(res.status, 'optimal');
  for (const id of Object.keys(res.placements)) assert.ok(termPos(res.placements[id]) >= termPos('year2-fall'), id);
});

test('SOLVER: a course offered only in a season no open term has is reported, not silently placed', async () => {
  const ds = await loadDataset();
  const { s, student, rec } = stateFor(ds, ['BE-BSBE']);
  s.terms = ['completed', 'year1-spring', 'year2-spring'];
  s.placed = { BE1251: 'year1-spring', BE1252: 'year2-spring' };   // BE 1251 is fall-only
  const ruleset = createRuleset(rulesOf(s, ds), student);
  const res = await solve(buildScenario({ dataset: ds, ruleset, state: s, anchor: rec.placed }));
  assert.equal(res.status, 'infeasible');
  assert.match(res.reason, /BE1251/);
});
