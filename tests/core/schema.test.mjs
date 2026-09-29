import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCourse, validateProgram, validateRule, validateRulePack, validateExpr, exprCourses } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = { catalogYear: '2026-2027' };
const errs = list => list.map(e => `${e.path}: ${e.message}`);

test('prerequisite expressions: valid shapes, and the EE 2120 catalog example', () => {
  const ee2120 = { all: [{ course: 'EE1810', concurrent: 'ok' }, { course: 'MATH2070', concurrent: 'ok' }, { course: 'PHYS2113', concurrent: 'ok' }], waiver: 'consent of division' };
  assert.deepEqual(validateExpr(ee2120), []);
  assert.deepEqual([...exprCourses(ee2120)].sort(), ['EE1810', 'MATH2070', 'PHYS2113']);
  assert.deepEqual(validateExpr({ any: [{ course: 'MATH1552', minGrade: 'C' }, { standing: 'junior' }] }), []);
  assert.ok(validateExpr({ course: 'EE2120', all: [] }).length, 'two kinds at once');
  assert.ok(validateExpr({ course: 'ee2120' }).length, 'bad id');
  assert.ok(validateExpr({ waiver: 'x', course: 'EE2120' }).length, 'waiver only on all/any');
  assert.ok(validateExpr({ all: [] }).length, 'empty group');
});

test('course records', () => {
  const ok = { id: 'EE2120', subject: 'EE', number: '2120', title: 'Circuits I', credits: { fixed: 3 }, source };
  assert.deepEqual(validateCourse(ok), []);
  assert.ok(validateCourse({ ...ok, id: 'EE2121' }).length, 'id must equal subject+number');
  assert.ok(validateCourse({ ...ok, extra: 1 }).length, 'unknown key');
  assert.deepEqual(validateCourse({ ...ok, credits: { min: 1, max: 3 } }), []);
  assert.ok(validateCourse({ ...ok, credits: { min: 3, max: 1 } }).length);
  assert.ok(validateCourse({ ...ok, source: {} }).length, 'source needs catalogYear');
});

test('programs: stable, unique, correctly prefixed requirement ids', () => {
  const p = {
    id: 'EE-BSEE', kind: 'major', name: 'Electrical Engineering', catalogYear: '2026-2027', source,
    requirements: {
      id: 'EE-BSEE/root', type: 'all', items: [
        { id: 'EE-BSEE/core/EE2120', type: 'course', course: 'EE2120' },
        { id: 'EE-BSEE/senior-design', type: 'all', items: [{ id: 'EE-BSEE/senior-design/EE4810', type: 'course', course: 'EE4810' }] },
        { id: 'EE-BSEE/breadth', type: 'distinctGroups', minGroups: 2, groups: [{ name: 'A', courses: ['EE3160'] }, { name: 'B', courses: ['EE3410'] }] },
        { id: 'EE-BSEE/design-elective/1', type: 'slot', label: 'Design elective', credits: 3, from: { attrs: ['design'] } },
      ],
    },
  };
  assert.deepEqual(errs(validateProgram(p)), []);
  const dup = structuredClone(p); dup.requirements.items[1].items[0].id = 'EE-BSEE/core/EE2120';
  assert.ok(errs(validateProgram(dup)).some(m => m.includes('duplicate requirement id')));
  const wrongPrefix = structuredClone(p); wrongPrefix.requirements.items[0].id = 'BE-BSBE/core/EE2120';
  assert.ok(errs(validateProgram(wrongPrefix)).some(m => m.includes('must start with EE-BSEE/')));
  const fewGroups = structuredClone(p); fewGroups.requirements.items[2].minGroups = 5;
  assert.ok(validateProgram(fewGroups).length);
});

test('rules: scope is mandatory and sources stay role-level', () => {
  const base = {
    id: 'r1', type: 'equivalent', scope: { programs: ['EE-BSEE'] }, course: 'MATH2090', satisfies: 'MATH2070',
    confidence: 'reported', source: { kind: 'advisor', label: 'Advisor (in-person meeting)', recordedOn: '2026-09-28' },
  };
  assert.deepEqual(errs(validateRule(base)), []);
  assert.ok(validateRule({ ...base, scope: {} }).length, 'empty scope rejected');
  const { scope, ...noScope } = base;
  assert.ok(validateRule(noScope).length, 'missing scope rejected');
  assert.ok(validateRule({ ...base, source: { ...base.source, label: 'Pat <pat@example.edu>' } }).length, 'emails in labels rejected');
  assert.ok(validateRule({ ...base, confidence: 'sure' }).length);
  assert.ok(validateRule({ ...base, satisfies: 'MATH2090' }).length, 'self-equivalence rejected');
  assert.ok(validateRule({ ...base, surprise: 1 }).length, 'unknown keys rejected');
  assert.ok(validateRule({ id: 'e', type: 'enrollment', scope: { programs: ['EE-BSEE'] }, course: 'MATH2090', deniedIf: { majors: { hasOnly: ['EE-BSEE'] } }, confidence: 'reported', source: base.source }).length, 'enrollment needs an effect');
  assert.deepEqual(errs(validateRule({ id: 's', type: 'substitute', scope: { programs: ['BE-BSBE'] }, requirement: 'BE-BSBE/gen-ed', accepts: [{ attrs: ['gen-ed'] }, { courses: ['PHIL2000'] }], confidence: 'confirmed', source: base.source })), []);
  assert.ok(validateRule({ id: 's', type: 'substitute', scope: { programs: ['BE-BSBE'] }, requirement: 'BE-BSBE/gen-ed', accepts: { any: true, subject: 'EE' }, confidence: 'confirmed', source: base.source }).length, '"any" cannot be combined');
});

test('every committed rule pack validates', async () => {
  const dir = path.join(root, 'data', 'rules');
  const years = await readdir(dir);
  let count = 0;
  for (const y of years) {
    for (const f of (await readdir(path.join(dir, y))).filter(f => f.endsWith('.json'))) {
      const pack = JSON.parse(await readFile(path.join(dir, y, f), 'utf8'));
      assert.deepEqual(errs(validateRulePack(pack)), [], `${y}/${f}`);
      assert.equal(pack.catalogYear, y, `${y}/${f}: pack catalogYear must match its folder`);
      count++;
    }
  }
  assert.ok(count >= 1);
});
