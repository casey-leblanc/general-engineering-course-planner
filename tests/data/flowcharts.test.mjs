import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, parseRow } from '../../tools/flowcharts/build.mjs';
import { compare } from '../../tools/flowcharts/compare-legacy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('row syntax: courses, alternatives, flags, slots; bad rows throw', () => {
  assert.deepEqual(parseRow('MATH1550 5 C'), { course: 'MATH1550', credits: 5, minGrade: 'C' });
  assert.deepEqual(parseRow('EE4810 3 C F'), { course: 'EE4810', credits: 3, minGrade: 'C', offered: 'F' });
  assert.deepEqual(parseRow('MATH2065|MATH2090 3'), { course: 'MATH2065', credits: 3, alternatives: ['MATH2090'] });
  assert.deepEqual(parseRow('EE3150 3 *'), { course: 'EE3150', credits: 3, mayBePrereq: true });
  assert.deepEqual(parseRow({ slot: 'ee-design', cr: 3, label: 'EE Design' }), { slot: 'ee-design', credits: 3, label: 'EE Design' });
  assert.throws(() => parseRow('EE 4810 3'), /bad/);
  assert.throws(() => parseRow('EE4810 3 X'), /unknown flag/);
});

test('every transcription passes its own checks (semester hours and total hours match the printed values)', () => {
  const all = buildAll();
  assert.deepEqual(all.map(f => f.program), ['EE-BSEE', 'BE-BSBE', 'CSC-SD', 'CSC-CYB', 'CSC-DSA', 'CSC-SEG', 'CSC-CCN']);
  for (const f of all) {
    assert.equal(f.semesters.length, 8, f.program);
    assert.equal(f.semesters.reduce((t, s) => t + s.hours, 0), f.totalHours, f.program);
  }
  assert.deepEqual(all.map(f => f.totalHours), [127, 128, 120, 120, 120, 120, 120]);
});

test('the committed flowchart JSON matches a fresh build (ignoring the local-only PDF hash)', async () => {
  const dir = path.join(root, 'data', 'flowcharts', '2026-2027');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort();
  assert.equal(files.length, 7);
  for (const fc of buildAll()) {
    const committed = JSON.parse(await readFile(path.join(dir, `${fc.program}.json`), 'utf8'));
    for (const x of [fc, committed]) { delete x.source.sha256; delete x.source.bytes; }
    assert.deepEqual(committed, fc, `${fc.program}: run node tools/flowcharts/build.mjs and commit the result`);
  }
});

test('CS charts carry the staleness warning; EE and BE do not', () => {
  for (const f of buildAll()) {
    if (f.program.startsWith('CSC')) assert.match(f.staleness, /Rev\. 1\/25\/2024/, f.program);
    else assert.equal(f.staleness, undefined, f.program);
  }
});

test('2026-27 flowcharts versus the legacy default plans (recorded findings)', () => {
  const r = compare();
  // EE: the only differences are two renamed courses; credits and offering flags all agree.
  const eeDiffs = r['EE-BSEE'].semesters.filter(s => s.onlyChart.length || s.onlyLegacy.length);
  assert.deepEqual(eeDiffs, [
    { n: 1, chartHours: 16, legacyHours: 16, onlyChart: ['EE1820'], onlyLegacy: ['EE1810'] },
    { n: 4, chartHours: 16, legacyHours: 16, onlyChart: ['EE2820'], onlyLegacy: ['EE2810'] },
  ]);
  assert.deepEqual(r['EE-BSEE'].credits, []);
  assert.deepEqual(r['EE-BSEE'].offered, []);
  // BE: the legacy plan is identical to the chart, semester by semester, in courses and hours.
  assert.ok(r['BE-BSBE'].semesters.every(s => !s.onlyChart.length && !s.onlyLegacy.length && s.chartHours === s.legacyHours));
  assert.deepEqual(r['BE-BSBE'].credits, []);
});
