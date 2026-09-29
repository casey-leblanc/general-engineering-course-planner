import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDataset, readJson, YEAR } from '../helpers/data.mjs';
import { buildManifest } from '../../tools/data/build-manifest.mjs';
import { recommend } from '../../src/core/plan.js';
import { emptyState, studentOf, rulesOf, planKey } from '../../src/core/state.js';
import { createRuleset } from '../../src/core/rules.js';
import { auditAll } from '../../src/core/requirements.js';
import { checkPlan } from '../../src/core/prereq.js';
import { describeTile } from '../../src/core/tiles.js';
import { termPos, termSeason, isTermKey } from '../../src/core/terms.js';

test('the manifest is current: run npm run build:data when a program, course file or rule pack changes', async () => {
  assert.deepEqual(await readJson('data/manifest.json'), JSON.parse(JSON.stringify(await buildManifest())));
});

test('the manifest lists every program with what the picker needs', async () => {
  const m = await readJson('data/manifest.json');
  const y = m.years[m.defaultYear];
  assert.equal(m.defaultYear, YEAR);
  const ids = y.programs.map(p => p.id);
  assert.deepEqual(ids, [...ids].sort());
  for (const id of ['EE-BSEE', 'BE-BSBE', 'ROBO-MIN', 'CSC-SD', 'CSC-CYB']) assert.ok(ids.includes(id), id);
  const be = y.programs.find(p => p.id === 'BE-BSBE');
  assert.deepEqual(be.tracks.map(t => t.id), ['standard', 'premed']);
  assert.equal(y.programs.find(p => p.id === 'ROBO-MIN').kind, 'minor');
  assert.equal(y.programs.find(p => p.id === 'CSC-CYB').group, 'Computer Science');
  assert.ok(y.presets && y.rules.length >= 1);
});

test('every preset is fresh and sound: same tiles as the merge, nothing missing, no prerequisite/offering problem, loads within the cap', async () => {
  const ds = await loadDataset();
  const { presets } = await readJson(`data/${YEAR}/presets.json`);
  assert.ok(Object.keys(presets).length >= 1);
  for (const [key, p] of Object.entries(presets)) {
    assert.equal(planKey({ programs: p.programs, tracks: p.tracks }), key);
    const state = emptyState({ catalogYear: YEAR, programs: p.programs, tracks: p.tracks });
    const student = studentOf(state, ds);
    const rec = recommend({ dataset: ds, student, tracks: p.tracks });
    assert.deepEqual(Object.keys(p.placed).sort(), Object.keys(rec.placed).sort(), `${key}: the preset is stale; run npm run build:presets`);
    assert.deepEqual(p.assign, rec.assign);
    assert.equal(p.credits, rec.credits);
    for (const t of Object.values(p.placed)) assert.ok(p.terms.includes(t), `${key}: ${t} is not one of the preset's terms`);
    assert.ok(p.terms.every(isTermKey));

    const st = { ...state, placed: p.placed, assign: p.assign, terms: p.terms };
    const plan = { placed: p.placed, done: {} };
    const audit = auditAll({ dataset: ds, plan, student, rules: rulesOf(st, ds), assignments: p.assign });
    for (const a of audit.programs) assert.equal(a.summary.missing, 0, `${key}/${a.program}`);
    const ruleset = createRuleset(rulesOf(st, ds), student, { countedFor: c => audit.countedFor.get(c) || new Set() });
    const bad = Object.entries(checkPlan({ dataset: ds, ruleset, plan, student })).filter(([, r]) => !r.ok).map(([id]) => id);
    assert.deepEqual(bad, [], `${key}: prerequisite or offering problems`);

    const load = {};
    for (const [id, t] of Object.entries(p.placed)) load[t] = (load[t] || 0) + describeTile(id, { dataset: ds, state: st }).credits;
    for (const [t, cr] of Object.entries(load)) assert.ok(cr <= (termSeason(t) === 'Su' ? 6 : 18), `${key}: ${t} has ${cr} credits`);
    // senior design of every program runs back to back
    for (const prog of p.programs) for (const s of ds.program(prog).sequences || []) {
      if (s.a in p.placed && s.b in p.placed) assert.equal(termPos(p.placed[s.b]) - termPos(p.placed[s.a]), s.gap, `${key}: ${s.a} / ${s.b}`);
    }
  }
});

test('the double-major preset reflects the advisor rules', async () => {
  const { presets } = await readJson(`data/${YEAR}/presets.json`);
  const p = presets['EE-BSEE+BE-BSBE'];
  assert.ok(p, 'the default combination has a preset');
  for (const id of ['BE4390', 'BE4392', 'EE2950']) assert.ok(!(id in p.placed), `${id} is covered by an advisor rule`);
  assert.ok('EE4810' in p.placed && 'EE4820' in p.placed);
  const via = new Set(p.dropped.flatMap(d => d.via || []));
  for (const r of ['be-senior-design-1-any-major', 'be-senior-design-2-any-major', 'be-ee2950-via-ee2120', 'be-design-electives-ee-4000-design', 'be-general-elective-any-course']) assert.ok(via.has(r), r);
});
