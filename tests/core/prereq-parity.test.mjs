// The new prerequisite checker must reproduce the OLD app's validate() results (recorded in tests/golden) when it is fed
// the converted legacy course data. Same states, same answers: pre / co / sem for every course the data knows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataset } from '../../src/core/dataset.js';
import { createRuleset } from '../../src/core/rules.js';
import { checkCourse } from '../../src/core/prereq.js';
import { termPos, termSeason, termLabel, defaultTerms, sortTerms } from '../../src/core/terms.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const { loadLegacyEE } = require('../helpers/legacy.js');
const { eeStates } = require('../fixtures/compute-golden.js');

test('term helpers agree with the old implementation on every key form', () => {
  const ee = loadLegacyEE();
  const keys = ['completed', 'year1-fall', 'year1-spring', 'year1-summer', 'year4-spring', 'year5-fall', 'year10-summer', 'bogus', '', 'year0-fall'];
  const legacy = ee.ctx.__legacy;
  for (const k of keys) {
    const lp = Number(ee.constants(`__legacy.termPos(${JSON.stringify(k)}) === Infinity ? 1e9 : __legacy.termPos(${JSON.stringify(k)})`));
    const mine = termPos(k);
    assert.equal(Number.isFinite(mine) ? mine : 1e9, lp, `termPos(${k})`);
    assert.equal(termSeason(k), ee.constants(`__legacy.termSeason(${JSON.stringify(k)})`), `termSeason(${k})`);
  }
  assert.ok(legacy);
  assert.equal(termLabel('year2-spring'), 'Year 2 Spring');
  assert.deepEqual(defaultTerms(2), ['completed', 'year1-fall', 'year1-spring', 'year2-fall', 'year2-spring']);
  assert.deepEqual(sortTerms(['year2-fall', 'completed', 'year1-summer', 'year1-fall']), ['completed', 'year1-fall', 'year1-summer', 'year2-fall']);
});

test('prerequisite / corequisite / offering results match the golden validate() output on every recorded EE state', async () => {
  const dataset = createDataset({
    courses: await readJson('data/legacy-import/2025-2026/courses.json'),
    overlay: await readJson('data/legacy-import/2025-2026/overlay.json'),
  });
  const golden = await readJson('tests/golden/eeValidate.json');
  const ee = loadLegacyEE();
  const states = eeStates(ee);
  let compared = 0;
  const differences = [];
  for (const [name, state] of Object.entries(states)) {
    ee.setState(JSON.parse(JSON.stringify(state)));
    const placed = ee.placements();
    const student = { catalogYear: '2025-2026', majors: [] };
    const ruleset = createRuleset([], student);
    for (const [id, legacy] of Object.entries(golden[name])) {
      if (!dataset.has(id)) continue; // placeholders have no course record
      const mine = checkCourse(id, { dataset, ruleset, plan: { placed, done: {} }, student });
      compared++;
      if (mine.pre !== legacy.pre || mine.co !== legacy.co || mine.sem !== legacy.sem) differences.push(`${name}/${id}: mine ${mine.pre}/${mine.co}/${mine.sem} legacy ${legacy.pre}/${legacy.co}/${legacy.sem}`);
    }
  }
  assert.deepEqual(differences, []);
  assert.ok(compared >= 250, `only ${compared} comparisons`);
});
