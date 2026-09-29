import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listToExpr, convertCourse, build } from '../../tools/convert-legacy.js';
import { compareCourse, compareDatasets } from '../../tools/verify.js';
import { validateCourse, exprCourses } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));

test('legacy lists convert to expressions: AND lists, OR groups, Any flags', () => {
  assert.equal(listToExpr([]), undefined);
  assert.deepEqual(listToExpr(['A1000']), { course: 'A1000' });
  assert.deepEqual(listToExpr(['MATH1552', 'PHYS2110']), { all: [{ course: 'MATH1552' }, { course: 'PHYS2110' }] });
  assert.deepEqual(listToExpr([['MATH2070', 'MATH2090'], ['CSC1253', 'ME2543']]), { all: [{ any: [{ course: 'MATH2070' }, { course: 'MATH2090' }] }, { any: [{ course: 'CSC1253' }, { course: 'ME2543' }] }] });
  assert.deepEqual(listToExpr(['MATH2065', 'MATH2070', 'MATH2090'], true), { any: [{ course: 'MATH2065' }, { course: 'MATH2070' }, { course: 'MATH2090' }] });
});

test('a converted course is schema-valid and marked as unverified legacy data', () => {
  const { rec, overlay } = convertCourse('EE2120', { code: 'EE 2120', title: 'Circuits I', cr: 3, sem: ['F', 'S', 'Su'], summer: 'BOTH', pre: ['MATH1552', 'PHYS2110'], co: ['PHYS2113'], diff: 'hardest', desc: 'ignored' });
  assert.deepEqual(validateCourse(rec), []);
  assert.equal(rec.source.origin, 'legacy');
  assert.equal(rec.source.verified, false);
  assert.equal('desc' in rec, false, 'descriptions are not carried over');
  assert.deepEqual(overlay.offered, { terms: ['F', 'S', 'Su'], summer: 'BOTH', confidence: 'assumed', evidence: 'legacy hand-typed' });
  assert.equal(overlay.difficulty, 'hardest');
  // an unverified record may not claim to be verified
  assert.ok(validateCourse({ ...rec, source: { ...rec.source, verified: true } }).length);
});

test('the committed legacy import matches a fresh conversion and every record validates', async () => {
  const fresh = await build();
  const committed = await readJson('data/legacy-import/2025-2026/courses.json');
  assert.deepEqual(committed, fresh.courses, 'run `node tools/convert-legacy.js` and commit the result');
  assert.equal(committed.length, 77);
  for (const c of committed) assert.deepEqual(validateCourse(c), [], c.id);
});

test('the converted dataset is internally consistent: references resolve, nothing requires itself', async () => {
  const courses = await readJson('data/legacy-import/2025-2026/courses.json');
  const ids = new Set(courses.map(c => c.id));
  const dangling = [];
  for (const c of courses) {
    for (const ref of [...exprCourses(c.prereq), ...exprCourses(c.coreq)]) {
      if (ref === c.id) dangling.push(`${c.id} requires itself`);
      else if (!ids.has(ref)) dangling.push(`${c.id} -> ${ref}`);
    }
  }
  assert.deepEqual(dangling, []);
});

test('the prerequisite graph has no cycles', async () => {
  const courses = await readJson('data/legacy-import/2025-2026/courses.json');
  const edges = new Map(courses.map(c => [c.id, [...exprCourses(c.prereq)]]));
  const state = new Map();
  const cycle = [];
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { cycle.push([...stack, id].join(' -> ')); return; }
    state.set(id, 1);
    for (const n of edges.get(id) || []) visit(n, [...stack, id]);
    state.set(id, 2);
  };
  for (const id of edges.keys()) visit(id, []);
  assert.deepEqual(cycle, []);
});

test('compareCourse: agreement, title/credit/requisite differences', () => {
  const cat = { id: 'X1000', title: 'Intro to X', credits: { fixed: 3 }, prereq: { all: [{ course: 'A1000' }, { course: 'B1000' }] } };
  assert.deepEqual(compareCourse({ ...cat, title: 'intro  to x!' }, cat), [], 'case/punctuation-insensitive titles');
  assert.equal(compareCourse({ ...cat, credits: { fixed: 4 } }, cat)[0].field, 'credits');
  const d = compareCourse({ ...cat, prereq: { course: 'A1000' }, coreq: { course: 'C1000' } }, cat).find(x => x.field === 'requisite courses');
  assert.deepEqual(d, { field: 'requisite courses', onlyInData: ['C1000'], onlyInCatalog: ['B1000'] });
});

test('FIRST BASELINE: the two catalog-sourced records disagree with the legacy data', async () => {
  const legacy = await readJson('data/legacy-import/2025-2026/courses.json');
  const catalog = await readJson('data/catalog/2025-2026/courses.json');
  for (const c of catalog) assert.deepEqual(validateCourse(c), [], c.id);
  const r = compareDatasets(legacy, catalog);
  assert.equal(r.compared, 2);
  assert.equal(r.agree, 0);
  const by = Object.fromEntries(r.mismatched.map(m => [m.id, m.diffs]));
  assert.deepEqual(by.EE2120, [{ field: 'requisite courses', onlyInData: ['MATH1552', 'PHYS2110'], onlyInCatalog: ['EE1810', 'MATH2070'] }]);
  assert.equal(by.EE3220.find(d => d.field === 'title').catalog, 'Electronics II');
  assert.equal(r.notInCatalogRecords, 75, 'the rest of the dataset is still unverified');
});
