import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset } from '../helpers/data.mjs';
import { progress } from '../helpers/student.mjs';
import { extraRecords, applyProgress, doneMap, termsAfter, realTermLabel } from '../../src/core/progress.js';
import { emptyState, studentOf, rulesOf } from '../../src/core/state.js';
import { recommend } from '../../src/core/plan.js';
import { auditAll } from '../../src/core/requirements.js';
import { derive } from '../../src/ui/model.js';
import { checkPlan } from '../../src/core/prereq.js';
import { buildScenario } from '../../src/core/scenario.js';
import { describeTile } from '../../src/core/tiles.js';
import { validateCourse } from '../../src/core/schema.js';
import { termPos } from '../../src/core/terms.js';
import { solveScenario } from '../../tools/plans/solve.mjs';
import { buildSheet } from '../../tools/plans/advisor-sheet.mjs';

const Y = '2026-2027';


async function setup(programs = ['BE-BSBE', 'EE-BSEE']) {
  const extra = extraRecords(progress, Y);
  const dataset = await loadDataset({ extraCourses: extra.courses, extraOverlay: extra.overlay });
  const state = emptyState({ catalogYear: Y, programs });
  applyProgress(state, progress);
  const student = studentOf(state, dataset);
  const done = doneMap(progress);
  return { dataset, state, student, done, extra };
}

test('extra course records are valid and carry the attributes from the student\'s own record', async () => {
  const { extra, dataset } = await setup();
  for (const c of extra.courses) assert.deepEqual(validateCourse(c), [], c.id);
  assert.deepEqual([...dataset.attrs('ART1001')].filter(a => a.startsWith('gen-ed')), ['gen-ed:art']);
  assert.equal(dataset.course('HIST2055').source.verified, false, 'nothing about a course record is called verified because a student listed it');
  assert.throws(() => extraRecords({ extraCourses: [{ id: 'not a course', title: 'x', credits: 3 }] }, Y));
});

test('applyProgress: completed work, AP credit with its source, in-progress courses, and the student\'s own credit and title', async () => {
  const { state, dataset } = await setup();
  assert.equal(state.done.MATH2090, 'year1-spring'); assert.equal(state.placed.MATH2090, 'year1-spring');
  assert.equal(state.done.CSC1350, 'completed'); assert.equal(state.grants.CSC1350, 'AP'); assert.equal(state.grants.MATH1550, 'transfer'); assert.equal(state.grants.ENGL1001, 'placement');
  assert.ok(!('CSC1350' in state.placed), 'the AP bucket has no semester');
  assert.equal(state.done.BE2352, 'year2-fall');
  const csc = describeTile('CSC1350', { dataset, state });
  assert.equal(csc.credits, 3, 'the hours actually awarded, not the catalog value'); assert.equal(csc.title, 'Computer Science I for Majors (AP)');
  assert.equal(describeTile('CHEM1201', { dataset, state }).note, 'taken as the honors course');
  assert.equal(describeTile('BE1251', { dataset, state }).title, 'Introduction to Engineering Methods');
});

test('the plan that is left: completed work satisfies requirements, advisor rules apply to it, and nothing done is dropped', async () => {
  const { dataset, student, done } = await setup();
  const rec = recommend({ dataset, student, done });
  for (const id of Object.keys(done)) assert.equal(rec.placed[id], done[id], `${id} stays where it was taken`);
  const dropped = Object.fromEntries(rec.dropped.map(d => [d.id, d.reason]));
  assert.equal(dropped.MATH2065.by, 'MATH2090', 'BE differential equations: MATH 2090 is on the requirement itself');
  assert.equal(dropped.MATH2070.by, 'MATH2090', 'EE: MATH 2090 counts for MATH 2070 because it is credited to BE');
  assert.deepEqual(dropped.MATH2070.via, ['ee-math2070-via-math2090-other-major']);
  assert.equal(dropped.CSC1253.by, 'CSC1350');
  assert.equal(dropped.CSC1253.via.length, 1); assert.match(dropped.CSC1253.via[0], /^ee-csc1253-via-csc1350-(ap|other-major)$/, 'AP credit, and also credited to BE as its elective');
  assert.equal(dropped['BE-BSBE/gen-ed/art'].by, 'ART1001'); assert.equal(dropped['EE-BSEE/gen-ed/art'].by, 'ART1001');
  assert.equal(dropped['EE-BSEE/gen-ed/life-science'].by, 'BIOL1201');
  assert.equal(dropped['BE-BSBE/general-elective'].by, 'CSC1350', 'a course actually taken beats another program\'s placeholder');
  for (const id of ['BE4390', 'BE4392', 'EE2950']) assert.ok(id in dropped, `${id} is covered by the advisor rules`);
  for (const id of ['MATH2065', 'MATH2070', 'CSC1253']) assert.ok(!(id in rec.placed));
  assert.ok('EE1820' in rec.placed && 'PHYS2113' in rec.placed, 'what is still needed stays');
});

test('the audit of the plan that is left has nothing missing, and completed courses count as complete', async () => {
  const { dataset, state, student, done } = await setup();
  const rec = recommend({ dataset, student, done });
  state.placed = { ...rec.placed };
  const audit = auditAll({ dataset, plan: { placed: state.placed, done }, student, rules: rulesOf(state, dataset), assignments: rec.assign });
  for (const p of audit.programs) assert.equal(p.summary.missing, 0, `${p.program}: ${p.demands.filter(d => d.status === 'missing').map(d => d.id)}`);
  const be = audit.byProgram['BE-BSBE'];
  assert.equal(be.demands.find(d => d.id === 'BE-BSBE/core/BIOL1201').status, 'complete');
  assert.equal(be.demands.find(d => d.id === 'BE-BSBE/core/MATH2065').course, 'MATH2090');
  assert.equal(audit.byProgram['EE-BSEE'].demands.find(d => d.id === 'EE-BSEE/core/MATH2070').course, 'MATH2090');
});

test('terms: real semester names, and the fewest semesters for what is left', () => {
  assert.equal(realTermLabel('year1-fall', progress.calendar), 'Fall 2025');
  assert.equal(realTermLabel('year1-spring', progress.calendar), 'Spring 2026');
  assert.equal(realTermLabel('year2-fall', progress.calendar), 'Fall 2026');
  assert.equal(realTermLabel('year3-summer', progress.calendar), 'Summer 2028');
  assert.equal(realTermLabel('year1-fall', null), null);
  const terms = termsAfter(progress, 120);
  assert.equal(terms[0], 'completed');
  assert.ok(terms.includes('year2-fall') && terms.includes('year2-spring'));
  assert.equal(terms.length - 1, 3 + Math.ceil(120 / 18), 'through the semester in progress (3rd), then ceil(120/18) more');
});

test('SOLVER: the rest of the plan goes only into semesters that have not started, and is sound', async () => {
  const { dataset, state, student, done } = await setup();
  const rec = recommend({ dataset, student, done });
  const remaining = Object.keys(rec.placed).filter(id => !(id in done));
  const remainingCredits = remaining.reduce((t, id) => t + (id.includes('/') ? 3 : dataset.credits(id, 3)), 0);
  state.terms = termsAfter(progress, remainingCredits);
  state.placed = { ...rec.placed }; state.assign = rec.assign;
  const closed = state.terms.filter(t => t !== 'completed' && termPos(t) <= termPos('year2-fall'));
  assert.deepEqual(closed, ['year1-fall', 'year1-spring', 'year2-fall']);
  const ruleset = derive(state, dataset).ruleset;   // knows where courses already count, so "credited from another major" rules apply
  const scn = buildScenario({ dataset, ruleset, state, sequences: ['BE-BSBE', 'EE-BSEE'].flatMap(p => dataset.program(p).sequences), anchor: rec.placed, closed });
  assert.equal(scn.movable.length, remaining.length);
  assert.ok(scn.terms.filter(t => closed.includes(t.key)).every(t => !t.open), 'past and current semesters are closed');
  const res = await solveScenario(scn, { seconds: 10 });
  assert.equal(res.status, 'optimal');
  for (const id of remaining) assert.ok(termPos(res.placements[id]) > termPos('year2-fall'), `${id} was placed in ${res.placements[id]}`);
  const placed = { ...state.placed, ...res.placements };
  const bad = Object.entries(checkPlan({ dataset, ruleset, plan: { placed, done }, student })).filter(([, r]) => !r.ok).map(([id]) => id);
  assert.deepEqual(bad, []);
  assert.equal(termPos(placed.EE4820) - termPos(placed.EE4810), 1, 'senior design back to back');
  // in the same order as the flowchart where it matters: intro before what builds on it
  assert.ok(termPos(placed.EE1820) <= termPos(placed.EE2120));
});

test('the advisor sheet built from a student\'s progress shows what is done, what is under way and what is left', async () => {
  const html = await buildSheet({ programs: ['BE-BSBE', 'EE-BSEE'], progress, seconds: 10, today: '2026-01-01' });
  assert.match(html, /PROGRESS \+ PLAN/);
  assert.match(html, /Fall 2025/); assert.match(html, /Spring 2026/); assert.match(html, /Fall 2026/);
  assert.match(html, /in progress/); assert.match(html, /completed/);
  assert.match(html, /AP \/ transfer \/ test credit/);
  assert.match(html, /Computer Science I for Majors \(AP\)/);
  assert.match(html, /credit hours completed/);
  assert.match(html, /taken as the honors course/);
  assert.match(html, /Plane Trigonometry/, 'credit that no requirement uses is listed, with a question about it');
  assert.match(html, /ee-math2070-via-math2090-other-major/);
  assert.match(html, /A-|Pass|&middot; A/);
  const noGrades = await buildSheet({ programs: ['BE-BSBE', 'EE-BSEE'], progress, showGrades: false, seconds: 10, today: '2026-01-01' });
  assert.ok(!/&middot; B<|&middot; A<|&middot; A- </.test(noGrades) && !/ &middot; Pass/.test(noGrades), 'grades can be left off');
  assert.ok(!/undefined|NaN|\[object/.test(html));
});
