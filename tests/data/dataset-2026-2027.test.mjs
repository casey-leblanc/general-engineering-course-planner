import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, invalid, RENAMES } from '../../tools/data/build-2026-2027.mjs';
import { buildAll } from '../../tools/flowcharts/build.mjs';
import { exprCourses } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));

test('the committed 2026-27 dataset equals a fresh merge and every record validates', async () => {
  const fresh = await build();
  assert.deepEqual(invalid(fresh.courses), []);
  assert.deepEqual(await readJson('data/2026-2027/courses.json'), fresh.courses, 'run node tools/data/build-2026-2027.mjs and commit');
  assert.deepEqual(await readJson('data/2026-2027/overlay.json'), fresh.overlay);
});

test('every requisite reference resolves, nothing requires itself, renamed courses are not referenced by their old number', async () => {
  const courses = await readJson('data/2026-2027/courses.json');
  const ids = new Set(courses.map(c => c.id));
  const problems = [];
  for (const c of courses) for (const r of [...exprCourses(c.prereq), ...exprCourses(c.coreq)]) {
    if (r === c.id) problems.push(`${c.id} requires itself`);
    else if (!ids.has(r)) problems.push(`${c.id} -> ${r} (missing)`);
    else if (RENAMES[r]) problems.push(`${c.id} -> ${r} (renamed to ${RENAMES[r]})`);
  }
  assert.deepEqual(problems, []);
  for (const old of Object.keys(RENAMES)) assert.equal(ids.has(old), false, `${old} was renamed`);
});

test('credit hours agree with the flowcharts wherever a chart states them for the course itself', async () => {
  const courses = new Map((await readJson('data/2026-2027/courses.json')).map(c => [c.id, c]));
  const disagreements = [];
  for (const f of buildAll()) for (const s of f.semesters) for (const it of s.items) {
    if (!it.course) continue;
    const c = courses.get(it.course);
    if (!c) { disagreements.push(`${it.course} has no record`); continue; }
    if (c.credits.fixed !== it.credits) disagreements.push(`${it.course}: record ${c.credits.fixed} vs ${f.program} chart ${it.credits}`);
  }
  assert.deepEqual(disagreements, []);
});

test('provenance is honest: one verified record, legacy marked unverified, chart-only stubs have unknown requisites', async () => {
  const courses = await readJson('data/2026-2027/courses.json');
  const verified = courses.filter(c => c.source.verified);
  assert.deepEqual(verified.map(c => [c.id, c.source.origin]), [['EE2120', 'workday']]);
  assert.match(verified[0].prereqText, /EE 1820/);
  const stubs = courses.filter(c => c.source.origin === 'flowchart');
  assert.ok(stubs.length >= 30);
  for (const s of stubs) { assert.equal(s.parse, 'unknown', s.id); assert.equal(s.prereq, undefined, s.id); assert.equal(s.coreq, undefined, s.id); }
  assert.ok(courses.filter(c => c.source.origin === 'legacy').every(c => c.source.verified === false));
  // the two chart renames exist as stubs, not as copies of the old records
  assert.equal(courses.find(c => c.id === 'EE1820').source.origin, 'flowchart');
  assert.equal(courses.find(c => c.id === 'EE2820').source.origin, 'flowchart');
});

test('overlay: offering terms from the charts are curated, senior design and design-elective attributes are recorded', async () => {
  const o = await readJson('data/2026-2027/overlay.json');
  assert.deepEqual(o.EE4810.offered.terms, ['F']);
  assert.equal(o.EE4810.offered.confidence, 'curated');
  assert.deepEqual(o.EE3530.offered.terms, ['F']);
  assert.deepEqual(o.EE4820.attrs, ['senior-design']);
  assert.deepEqual(o.BE4390.attrs, ['senior-design']);
  assert.deepEqual(o.EE4160.attrs, ['design']);
  assert.ok(o.EE2120.offered.confidence === 'assumed', 'un-flagged courses stay assumed');
});
