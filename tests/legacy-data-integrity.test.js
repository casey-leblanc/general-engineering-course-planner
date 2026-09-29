'use strict';
// Data-integrity checks on the CURRENT hand-typed data. These document known defects: each check fails only when
// something NEW is wrong. When Phase 1 fixes an item, delete it from the KNOWN_* list below. The new data model
// must pass the same checks with empty lists (see .claude-context/refactor-plan.md, section 4).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLegacyEE, loadLegacyBE } = require('./helpers/legacy');

const ee = loadLegacyEE();
const be = loadLegacyBE();
const flat = list => list.flat(Infinity);

/** Ids that resolve to a real tile definition in the EE planner. */
const eeKnown = new Set([...Object.keys(ee.constants('LSU_CATALOG')), ...Object.keys(ee.constants('PLACEHOLDERS'))]);
const beKnown = new Set([...Object.keys(be.constants('CATALOG')), ...Object.keys(be.constants('PLACEHOLDER_DEFAULTS'))]);

test('EE planner: every id in the recommended plans exists', () => {
  const missing = [];
  for (const name of ['PLAN_EE_DEFAULT', 'PLAN_BE_DEFAULT', 'PLAN_DOUBLE_MAJOR_DEFAULT']) {
    for (const [term, ids] of ee.constants(name)) for (const id of ids) if (!eeKnown.has(id)) missing.push(`${name}/${term}/${id}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('EE planner: every prerequisite / corequisite id exists', () => {
  const KNOWN_UNRESOLVED = new Set([]);
  const cat = ee.constants('LSU_CATALOG');
  const missing = [];
  for (const [id, c] of Object.entries(cat)) {
    for (const ref of flat([c.pre || [], c.co || []])) if (!eeKnown.has(ref) && !KNOWN_UNRESOLVED.has(`${id}->${ref}`)) missing.push(`${id}->${ref}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('EE planner: major and minor definitions only reference known ids', () => {
  // Found by this test in Phase 0: the Robotics minor lists elective options that have no catalog entry, so they
  // cannot be placed or audited (ME 3133, CSC 4444) and two pseudo-ids (ROBO_CORE, ROBO_CAP) have no placeholder.
  const KNOWN_UNRESOLVED = new Set(['ROBOTICS:ME3133', 'ROBOTICS:CSC4444', 'ROBOTICS:ROBO_CORE', 'ROBOTICS:ROBO_CAP']);
  const majors = ee.constants('LSU_MAJORS');
  const minors = ee.constants('LSU_MINORS');
  const missing = [];
  for (const m of Object.values(majors)) for (const id of m.coreCourseIds) if (!eeKnown.has(id) && !KNOWN_UNRESOLVED.has(`${m.id}:${id}`)) missing.push(`${m.id}:${id}`);
  for (const m of Object.values(minors)) for (const id of flat(Object.values(m.courses))) if (!eeKnown.has(id) && !KNOWN_UNRESOLVED.has(`${m.id}:${id}`)) missing.push(`${m.id}:${id}`);
  assert.deepStrictEqual(missing, [], 'NEW ids that do not resolve to a catalog course or placeholder');
});

test('BE planner: every id in the default plans exists', () => {
  const missing = [];
  for (const name of ['DEFAULT_PLAN_STD', 'DEFAULT_PLAN_PM']) {
    for (const [term, ids] of be.constants(name)) for (const id of ids) if (!beKnown.has(id)) missing.push(`${name}/${term}/${id}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('the two hand-typed catalogs agree on shared course ids (except recorded, deliberate differences)', () => {
  const KNOWN_DIFFERENT = new Set(['BE2350.co', 'BE3340.pre', 'BE4303.pre', 'CE2460.co']); // MATH 2090 / EE 2120 additions in majors-data.js
  const a = be.constants('CATALOG');
  const b = ee.constants('LSU_CATALOG');
  const diffs = [];
  for (const id of Object.keys(a).filter(k => k in b)) {
    for (const f of ['cr', 'sem', 'summer', 'pre', 'co', 'diff']) {
      if (JSON.stringify(a[id][f] ?? null) !== JSON.stringify(b[id][f] ?? null) && !KNOWN_DIFFERENT.has(`${id}.${f}`)) diffs.push(`${id}.${f}`);
    }
  }
  assert.deepStrictEqual(diffs, []);
});

test('KNOWN DEFECT: the recommended plans break the app\'s own rules or fail its own audit', () => {
  // Recorded facts, asserted so the refactor cannot silently "fix" them without updating this test and the plan doc.
  const golden = require('./golden/eeValidate.json');
  const bad = name => Object.entries(golden[name]).filter(([, v]) => !v.ok).map(([id]) => id).sort();
  assert.deepStrictEqual(bad('ee_preset'), []);
  assert.deepStrictEqual(bad('be_preset'), []);
  assert.deepStrictEqual(bad('double_robotics_preset'), ['BIOL2051', 'BIOL2083', 'EE3530']);

  const audit = require('./golden/audit.json');
  const missing = (name, idx) => audit[name][idx].categories.flatMap(c => c.items).filter(i => i.status === 'missing').map(i => i.id).sort();
  assert.deepStrictEqual(missing('ee_preset', 0), ['EE3160', 'EE3220', 'EE3410', 'EE3530', 'EE3710'], 'EE recommended plan reports breadth groups as missing');
  assert.deepStrictEqual(missing('be_preset', 0), []);
});
