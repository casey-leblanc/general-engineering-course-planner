import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAll, withTracks, authoredPrograms } from '../../tools/programs/derive.mjs';
import { validateProgram, requirementIds, COURSE_ID } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const programs = async () => {
  const dir = path.join(root, 'data', '2026-2027', 'programs');
  return Promise.all((await readdir(dir)).filter(f => f.endsWith('.json')).sort().map(f => readJson(`data/2026-2027/programs/${f}`)));
};

/** every node with its parent chain, for structural assertions */
function walk(node, fn, parent = null) { fn(node, parent); (node.items || []).forEach(c => walk(c, fn, node)); }

test('committed programs equal a fresh derivation from the flowcharts plus the authored ones, and all validate', async () => {
  const committed = await programs();
  const fresh = await withTracks(deriveAll());
  const authored = await authoredPrograms();
  assert.deepEqual(committed.map(p => p.id), [...fresh, ...authored].map(p => p.id).sort());
  for (const p of authored) {
    assert.deepEqual(validateProgram(p), [], p.id);
    assert.deepEqual(committed.find(c => c.id === p.id), p, `${p.id}: run npm run build:data and commit the result`);
    assert.equal(p.source.verified, false, 'authored from the old planner, not from the catalog');
  }
  for (const p of fresh) {
    assert.deepEqual(validateProgram(p), [], p.id);
    assert.deepEqual(committed.find(c => c.id === p.id), p, `${p.id}: run node tools/programs/derive.mjs and commit the result`);
    assert.equal(p.source.verified, false, 'derived from a chart, not from the catalog');
  }
});

test('the recommended plan uses every requirement exactly once and its hours match the chart', async () => {
  for (const p of (await programs()).filter(x => x.recommendedPlan)) {
    const leaves = new Map(); // tile id -> credits or null (course)
    walk(p.requirements, n => {
      if (n.type === 'course') leaves.set(n.course, null);
      if (n.type === 'slot') leaves.set(n.id, n.credits);
      if (n.type === 'distinctGroups') for (let i = 1; i <= n.minCourses; i++) leaves.set(`${n.id}/${i}`, 3);
    });
    const used = p.recommendedPlan.flatMap(([, ids]) => ids);
    assert.equal(new Set(used).size, used.length, `${p.id}: a tile is planned twice`);
    assert.deepEqual([...new Set(used)].sort(), [...leaves.keys()].sort(), `${p.id}: plan and requirements disagree`);
    assert.equal(p.recommendedPlan.length, 8);
  }
});

test('requirement ids are unique and course leaves reference well-formed ids', async () => {
  for (const p of await programs()) {
    const ids = [];
    walk(p.requirements, n => { ids.push(n.id); if (n.course) assert.match(n.course, COURSE_ID); });
    assert.equal(new Set(ids).size, ids.length, p.id);
  }
});

test('every requirement id used by the advisor rules exists in the program it names', async () => {
  const pack = await readJson('data/rules/2026-2027/be-ee.json');
  const byId = Object.fromEntries((await programs()).map(p => [p.id, requirementIds(p)]));
  const missing = [];
  for (const r of pack.rules) {
    const ref = r.requirement || (r.target && r.target.requirement);
    if (!ref) continue;
    const program = ref.split('/')[0];
    if (!byId[program] || !byId[program].has(ref)) missing.push(`${r.id} -> ${ref}`);
  }
  assert.deepEqual(missing, []);
});

test('EE and BE structure matches what the advisors described', async () => {
  const [be, csSd] = [(await programs()).find(p => p.id === 'BE-BSBE'), (await programs()).find(p => p.id === 'CSC-SD')];
  const node = (p, id) => { let f; walk(p.requirements, n => { if (n.id === id) f = n; }); return f; };
  // BE: senior design is two required courses, three design electives, one tech elective, one general elective
  assert.deepEqual(node(be, 'BE-BSBE/senior-design').items.map(n => n.course), ['BE4390', 'BE4392']);
  assert.equal(node(be, 'BE-BSBE/design-electives').items.length, 3);
  assert.equal(node(be, 'BE-BSBE/tech-elective').credits, 3);
  assert.equal(node(be, 'BE-BSBE/general-elective').credits, 2);
  assert.equal(node(be, 'BE-BSBE/gen-ed').items.length, 3, 'humanity, art, social science groups');
  // CS: "CSC 2+++" means any 2000-level CSC course
  const two = node(csSd, 'CSC-SD/csc-2000');
  assert.deepEqual(two.items[0].from, { subject: 'CSC', level: { min: 2000, max: 2999 } });
});
