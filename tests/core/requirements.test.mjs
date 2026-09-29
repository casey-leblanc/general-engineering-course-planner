import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataset } from '../../src/core/dataset.js';
import { createRuleset } from '../../src/core/rules.js';
import { checkCourse } from '../../src/core/prereq.js';
import { collectDemands, auditAll, auditProgram } from '../../src/core/requirements.js';
import { termPos } from '../../src/core/terms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));

async function load({ extraCourses = [], extraOverlay = {} } = {}) {
  const dir = path.join(root, 'data', '2026-2027', 'programs');
  const programs = await Promise.all((await readdir(dir)).filter(f => f.endsWith('.json')).map(f => readJson(`data/2026-2027/programs/${f}`)));
  const overlay = { ...(await readJson('data/2026-2027/overlay.json')), ...extraOverlay };
  return createDataset({
    courses: [...(await readJson('data/2026-2027/courses.json')), ...extraCourses], overlay, programs,
    rulePacks: [await readJson('data/rules/2026-2027/be-ee.json')],
  });
}
/** union of the recommended plans (a shared course keeps its earliest term) */
function planOf(ds, ...ids) {
  const placed = {};
  for (const pid of ids) for (const [term, tiles] of ds.program(pid).recommendedPlan) for (const t of tiles) if (!(t in placed) || termPos(term) < termPos(placed[t])) placed[t] = term;
  return { placed, done: {} };
}
const stu = (majors, extra = {}) => ({ catalogYear: '2026-2027', majors, minors: [], grants: {}, ...extra });
const demand = (audit, id) => audit.demands.find(d => d.id === id);
const without = (plan, ...ids) => ({ ...plan, placed: Object.fromEntries(Object.entries(plan.placed).filter(([k]) => !ids.includes(k))) });
const withCourse = (plan, id, term) => ({ ...plan, placed: { ...plan.placed, [id]: term } });

test('demands: a program expands into one demand per course, slot and breadth course', async () => {
  const ds = await load();
  const ee = collectDemands(ds.program('EE-BSEE'), ds);
  assert.equal(ee.filter(d => d.kind === 'breadth').length, 6);
  assert.equal(ee.filter(d => d.kind === 'course').length, 25, '23 core courses + EE 4810 and EE 4820');
  assert.equal(new Set(ee.map(d => d.id)).size, ee.length);
  assert.equal(ee.reduce((t, d) => t + d.credits, 0), 127, 'demand credits add up to the degree total');
  const be = collectDemands(ds.program('BE-BSBE'), ds);
  assert.equal(be.reduce((t, d) => t + d.credits, 0) - 1, 128 - 1); // MATH2065|MATH2090 counted once at the first course's credits
});

test('recommended plans audit cleanly: nothing missing, unresolved slots reported as placeholders', async () => {
  const ds = await load();
  for (const id of ['EE-BSEE', 'BE-BSBE', 'CSC-SD', 'CSC-CYB', 'CSC-DSA', 'CSC-SEG', 'CSC-CCN']) {
    const a = auditAll({ dataset: ds, plan: planOf(ds, id), student: stu([id]) }).byProgram[id];
    assert.equal(a.summary.missing, 0, `${id}: ${a.demands.filter(d => d.status === 'missing').map(d => d.id).join(', ')}`);
    assert.equal(a.summary.complete, 0, 'nothing is completed yet');
    assert.deepEqual(a.unused, [], `${id}: every planned course should fill a requirement`);
    assert.ok(a.summary.placeholder > 0);
    assert.equal(a.summary.satisfied, false, 'placeholders are not a finished degree');
  }
});

test('EE breadth needs four of five groups; unresolved placeholders are "review", not satisfied (old app passed them)', async () => {
  const ds = await load();
  const ee = 'EE-BSEE/breadth';
  const base = planOf(ds, 'EE-BSEE');
  const placeholders = auditAll({ dataset: ds, plan: base, student: stu(['EE-BSEE']) }).byProgram['EE-BSEE'];
  assert.equal(placeholders.groups[ee].status, 'placeholder');
  assert.equal(placeholders.groups[ee].satisfied, false);

  const swap = courses => {
    let p = without(base, ...[1, 2, 3, 4, 5, 6].map(i => `${ee}/${i}`));
    courses.forEach((c, i) => { p = withCourse(p, c, i < 3 ? 'year3-fall' : 'year3-spring'); });
    return p;
  };
  // six real courses across FIVE groups: satisfied
  const good = auditAll({ dataset: ds, plan: swap(['EE3160', 'EE3220', 'EE3410', 'EE3530', 'EE3710', 'EE3755']), student: stu(['EE-BSEE']) }).byProgram['EE-BSEE'];
  assert.equal(good.groups[ee].satisfied, true);
  assert.equal(good.groups[ee].covered.length, 5);
  // six real courses but only THREE groups: not satisfied, and it says why
  const bad = auditAll({ dataset: ds, plan: swap(['EE3220', 'EE3223', 'EE3232', 'EE3160', 'EE3710', 'EE3740']), student: stu(['EE-BSEE']) }).byProgram['EE-BSEE'];
  assert.equal(bad.groups[ee].satisfied, false);
  assert.equal(bad.groups[ee].status, 'missing');
  assert.equal(bad.groups[ee].covered.length, 3);
});

test('a course fills one requirement only: a second breadth course cannot be the same course twice', async () => {
  const ds = await load();
  const ee = 'EE-BSEE/breadth';
  let p = without(planOf(ds, 'EE-BSEE'), ...[1, 2, 3, 4, 5, 6].map(i => `${ee}/${i}`));
  p = withCourse(p, 'EE3160', 'year3-fall');
  const a = auditAll({ dataset: ds, plan: p, student: stu(['EE-BSEE']) }).byProgram['EE-BSEE'];
  const filled = a.demands.filter(d => d.nodeId === ee && d.status !== 'missing');
  assert.equal(filled.length, 1, 'one course, one demand');
  assert.equal(a.demands.filter(d => d.nodeId === ee && d.status === 'missing').length, 5);
});

test('completed courses count as complete, planned ones as planned', async () => {
  const ds = await load();
  const plan = planOf(ds, 'BE-BSBE');
  plan.done = { BIOL1201: 'year1-fall', MATH1550: 'completed' };
  const a = auditAll({ dataset: ds, plan, student: stu(['BE-BSBE']) }).byProgram['BE-BSBE'];
  assert.equal(demand(a, 'BE-BSBE/core/BIOL1201').status, 'complete');
  assert.equal(demand(a, 'BE-BSBE/core/MATH1550').status, 'complete');
  assert.equal(demand(a, 'BE-BSBE/core/MATH1552').status, 'planned');
  assert.equal(a.summary.creditsComplete, 8);
});

test('ADVISOR RULE: EE senior design counts for BE senior design (a double major needs one sequence, not two)', async () => {
  const ds = await load();
  const both = planOf(ds, 'EE-BSEE', 'BE-BSBE');
  const dropBE = without(both, 'BE4390', 'BE4392');
  const a = auditAll({ dataset: ds, plan: dropBE, student: stu(['BE-BSBE', 'EE-BSEE']) }).byProgram['BE-BSBE'];
  for (const [id, course, rule] of [['BE-BSBE/senior-design/BE4390', 'EE4810', 'be-senior-design-1-any-major'], ['BE-BSBE/senior-design/BE4392', 'EE4820', 'be-senior-design-2-any-major']]) {
    assert.equal(demand(a, id).status, 'planned', id);
    assert.equal(demand(a, id).course, course);
    assert.deepEqual(demand(a, id).via, [rule]);
  }
  // without the rules the same plan is missing both
  const off = auditAll({ dataset: ds, plan: dropBE, student: stu(['BE-BSBE', 'EE-BSEE']), rules: [] }).byProgram['BE-BSBE'];
  assert.equal(demand(off, 'BE-BSBE/senior-design/BE4390').status, 'missing');
  assert.equal(demand(off, 'BE-BSBE/senior-design/BE4392').status, 'missing');
  // and a BE-only student (no EE senior design in the plan) still needs BE senior design
  const beOnly = auditAll({ dataset: ds, plan: without(planOf(ds, 'BE-BSBE'), 'BE4390', 'BE4392'), student: stu(['BE-BSBE']) }).byProgram['BE-BSBE'];
  assert.equal(demand(beOnly, 'BE-BSBE/senior-design/BE4390').status, 'missing');
});

test('ADVISOR RULE: EE 2120 (assumed enough by itself) or EE 2130 stands in for EE 2950 (requirements and the BE 2350 corequisite)', async () => {
  const ds = await load();
  const plan = without(planOf(ds, 'EE-BSEE', 'BE-BSBE'), 'EE2950');
  const student = stu(['BE-BSBE', 'EE-BSEE']);
  const a = auditAll({ dataset: ds, plan, student }).byProgram['BE-BSBE'];
  assert.equal(demand(a, 'BE-BSBE/core/EE2950').status, 'planned');
  assert.equal(demand(a, 'BE-BSBE/core/EE2950').course, 'EE2120', 'EE 2120 alone is assumed to be enough, so it is what counts when both are in the plan');
  assert.deepEqual(demand(a, 'BE-BSBE/core/EE2950').via, ['be-ee2950-via-ee2120']);
  // and EE 2130 still counts when EE 2120 is not the one in the plan (the confirmed rule)
  const only2130 = auditAll({ dataset: ds, plan: without(plan, 'EE2120'), student }).byProgram['BE-BSBE'];
  assert.equal(demand(only2130, 'BE-BSBE/core/EE2950').course, 'EE2130');
  assert.deepEqual(demand(only2130, 'BE-BSBE/core/EE2950').via, ['be-ee2950-via-ee2130']);
  // BE 2350's corequisite is "EE 2950 or PHYS 2113" (the old data also allows EE 2120): with none of those placed,
  // EE 2130 in the same or an earlier term satisfies it
  const p2 = without(plan, 'PHYS2113', 'EE2120');
  p2.placed.BE2350 = 'year3-spring'; p2.placed.EE2130 = 'year3-spring';
  const ruleset = createRuleset(ds.rules, student);
  const r = checkCourse('BE2350', { dataset: ds, ruleset, plan: p2, student });
  assert.equal(r.co, true);
  assert.deepEqual(r.via, ['be-ee2950-via-ee2130']);
  const none = checkCourse('BE2350', { dataset: ds, ruleset: createRuleset([], student), plan: p2, student });
  assert.equal(none.co, false, 'without the rule the corequisite is unmet');
});

test('ADVISOR RULE: EE design electives and gen-eds count for BE; any course is a BE elective', async () => {
  const ds = await load();
  let plan = planOf(ds, 'BE-BSBE');
  const student = stu(['BE-BSBE', 'EE-BSEE']);
  // EE 4160 (design list) instead of the first BE design elective tile
  plan = withCourse(without(plan, 'BE-BSBE/design-electives/1'), 'EE4160', 'year3-spring');
  // PHIL 2020 (an EE requirement) instead of the first humanity gen-ed tile
  plan = withCourse(without(plan, 'BE-BSBE/gen-ed/humanity/1'), 'PHIL2020', 'year3-fall');
  // any course as the general elective: a Computer Science course
  plan = withCourse(without(plan, 'BE-BSBE/general-elective'), 'CSC1350', 'year4-fall');
  const a = auditAll({ dataset: ds, plan, student }).byProgram['BE-BSBE'];
  assert.equal(a.summary.missing, 0, a.demands.filter(d => d.status === 'missing').map(d => d.id).join(', '));
  const used = a.demands.filter(d => d.via.length);
  assert.ok(used.some(d => d.course === 'EE4160' && d.via.includes('be-design-electives-ee-4000-design')));
  assert.ok(used.some(d => d.course === 'PHIL2020' && d.via.includes('be-gened-ilc-from-other-major')));
  assert.ok(used.some(d => d.course === 'CSC1350' && d.via.includes('be-general-elective-any-course')));
  // an EE course that is NOT on the design list does not count as a design elective
  const notDesign = withCourse(without(planOf(ds, 'BE-BSBE'), 'BE-BSBE/design-electives/1'), 'EE3610', 'year3-spring');
  const n = auditAll({ dataset: ds, plan: notDesign, student }).byProgram['BE-BSBE'];
  assert.equal(demand(n, 'BE-BSBE/design-electives/1').status, 'missing');
});

test('ADVISOR RULE: MATH 2090 counts for MATH 2070 only when credited from another major, and EE-only students are warned', async () => {
  const ds = await load();
  const base = withCourse(without(planOf(ds, 'EE-BSEE', 'BE-BSBE'), 'MATH2070', 'MATH2065'), 'MATH2090', 'year2-fall');
  // BE + EE: MATH 2090 fills BE's "MATH 2065 or 2090" and, being credited from BE, also EE's MATH 2070
  const dual = auditAll({ dataset: ds, plan: base, student: stu(['BE-BSBE', 'EE-BSEE']) });
  assert.equal(demand(dual.byProgram['BE-BSBE'], 'BE-BSBE/core/MATH2065').course, 'MATH2090');
  const ee = demand(dual.byProgram['EE-BSEE'], 'EE-BSEE/core/MATH2070');
  assert.equal(ee.status, 'planned');
  assert.deepEqual(ee.via, ['ee-math2070-via-math2090-other-major']);
  // EE only: nothing else credits MATH 2090, so it is not MATH 2070
  const eeOnly = auditAll({ dataset: ds, plan: without(base, ...Object.keys(base.placed).filter(k => k.startsWith('BE-BSBE/') || ['BE1251', 'BE1252'].includes(k))), student: stu(['EE-BSEE']) });
  assert.equal(demand(eeOnly.byProgram['EE-BSEE'], 'EE-BSEE/core/MATH2070').status, 'missing');
  // enrollment: warn for an EE-only student, nothing for BE + EE
  const warn = checkCourse('MATH2090', { dataset: ds, ruleset: createRuleset(ds.rules, stu(['EE-BSEE'])), plan: base, student: stu(['EE-BSEE']) });
  assert.deepEqual(warn.enrollment.map(e => [e.ruleId, e.effect]), [['math2090-not-open-to-ee-only-students', 'warn']]);
  assert.equal(warn.ok, true, 'a warning does not block');
  const fine = checkCourse('MATH2090', { dataset: ds, ruleset: createRuleset(ds.rules, stu(['BE-BSBE', 'EE-BSEE'])), plan: base, student: stu(['BE-BSBE', 'EE-BSEE']) });
  assert.deepEqual(fine.enrollment, []);
});

test('ADVISOR RULE: CSC 1350 counts for CSC 1253 through another major or AP', async () => {
  const ds = await load();
  const base = withCourse(without(planOf(ds, 'EE-BSEE'), 'CSC1253'), 'CSC1350', 'year1-fall');
  const plain = auditAll({ dataset: ds, plan: base, student: stu(['EE-BSEE']) }).byProgram['EE-BSEE'];
  assert.equal(demand(plain, 'EE-BSEE/core/CSC1253').status, 'missing', 'not credited through another major or AP');
  const ap = auditAll({ dataset: ds, plan: base, student: stu(['EE-BSEE'], { grants: { CSC1350: 'AP' } }) }).byProgram['EE-BSEE'];
  assert.equal(demand(ap, 'EE-BSEE/core/CSC1253').status, 'planned');
  assert.deepEqual(demand(ap, 'EE-BSEE/core/CSC1253').via, ['ee-csc1253-via-csc1350-ap']);
});

test('EE will not take another department\'s senior design; the advisory travels with the audit', async () => {
  const ds = await load({
    extraCourses: [{ id: 'CSC4998', subject: 'CSC', number: '4998', title: 'CS senior design (test double)', credits: { fixed: 3 }, parse: 'unknown', source: { catalogYear: '2026-2027', origin: 'flowchart', verified: false } }],
    extraOverlay: { CSC4998: { attrs: ['senior-design'] } },
  });
  const student = stu(['EE-BSEE']);
  const plan = withCourse(without(planOf(ds, 'EE-BSEE'), 'EE4810'), 'CSC4998', 'year4-fall');
  // a broad substitution that would accept any senior design, as a personal rule might
  const broad = { id: 'p1', type: 'substitute', scope: { programs: ['EE-BSEE'] }, requirement: 'EE-BSEE/senior-design', accepts: { attrs: ['senior-design'] }, confidence: 'unverified', source: { kind: 'student', label: 'test', recordedOn: '2026-09-28' } };
  const noReject = auditAll({ dataset: ds, plan, student, rules: [broad] }).byProgram['EE-BSEE'];
  assert.equal(demand(noReject, 'EE-BSEE/senior-design/EE4810').course, 'CSC4998', 'accepted when nothing rejects it');
  const withPack = auditAll({ dataset: ds, plan, student, rules: [broad, ...ds.rules] }).byProgram['EE-BSEE'];
  assert.equal(demand(withPack, 'EE-BSEE/senior-design/EE4810').status, 'missing', 'the EE noSubstitute rule rejects CSC senior design');
  assert.equal(withPack.advisories.length, 1);
  assert.equal(withPack.advisories[0].effect, 'warn');
  assert.match(withPack.advisories[0].message, /BE senior design/);
});

test('waive rules complete a requirement with no course; explicit assignments override', async () => {
  const ds = await load();
  const student = stu(['EE-BSEE']);
  const plan = without(planOf(ds, 'EE-BSEE'), 'EE-BSEE/gen-ed/art');
  const waive = { id: 'w1', type: 'waive', scope: { programs: ['EE-BSEE'] }, requirement: 'EE-BSEE/gen-ed/art', confidence: 'reported', source: { kind: 'student', label: 'test', recordedOn: '2026-09-28' } };
  const a = auditAll({ dataset: ds, plan, student, rules: [waive] }).byProgram['EE-BSEE'];
  assert.equal(demand(a, 'EE-BSEE/gen-ed/art').status, 'waived');
  assert.deepEqual(demand(a, 'EE-BSEE/gen-ed/art').via, ['w1']);
  const missing = auditAll({ dataset: ds, plan, student, rules: [] }).byProgram['EE-BSEE'];
  assert.equal(demand(missing, 'EE-BSEE/gen-ed/art').status, 'missing');
  // assign a course to a slot that has no pool
  const p2 = withCourse(plan, 'CE2450', 'year4-fall');
  const assigned = auditAll({ dataset: ds, plan: p2, student, rules: [], assignments: { CE2450: 'EE-BSEE/gen-ed/art' } }).byProgram['EE-BSEE'];
  assert.equal(demand(assigned, 'EE-BSEE/gen-ed/art').course, 'CE2450');
});

test('rules are scoped: a BE rule does nothing for an EE-only student', async () => {
  const ds = await load();
  const ruleset = createRuleset(ds.rules, stu(['EE-BSEE']));
  assert.deepEqual(ruleset.substitutes(['BE-BSBE/senior-design/BE4390']), []);
  assert.equal(ruleset.equivalents('EE2950').length, 0);
  assert.equal(createRuleset(ds.rules, stu(['EE-BSEE'], { catalogYear: '2025-2026' })).active.length, 0, 'rules are scoped to the 2026-27 catalog year');
});

test('custom courses and courses the data does not know never break the audit; a custom course only fills "any course" requirements', async () => {
  const ds = await load();
  const plan = withCourse(withCourse(planOf(ds, 'BE-BSBE', 'EE-BSEE'), 'c-mine1', 'year2-fall'), 'ZZZZ9999', 'year2-fall');
  const a = auditAll({ dataset: ds, plan, student: stu(['EE-BSEE', 'BE-BSBE']) });
  assert.ok(a.programs.every(p => p.summary.total > 0));
  const be = a.byProgram['BE-BSBE'];
  assert.ok(be.unused.includes('c-mine1') || be.demands.some(d => d.course === 'c-mine1'));
  assert.ok(!be.demands.some(d => d.course === 'c-mine1' && d.id.startsWith('BE-BSBE/core')), 'a custom course does not fill a required course');
  const assigned = auditAll({ dataset: ds, plan: without(plan, 'BE-BSBE/tech-elective'), student: stu(['BE-BSBE']), assignments: { 'c-mine1': 'BE-BSBE/tech-elective' } }).byProgram['BE-BSBE'];
  assert.equal(demand(assigned, 'BE-BSBE/tech-elective').course, 'c-mine1');
  assert.equal(ds.matchesPool('c-mine1', { subject: 'EE' }), false);
  assert.equal(ds.matchesPool('c-mine1', { any: true }), true);
});
