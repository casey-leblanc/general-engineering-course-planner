'use strict';
/**
 * Computes the golden data by running the CURRENT (legacy) code on a fixed set of named states.
 * `tests/tools/generate-golden.js` writes the result to tests/golden/*.json; the characterization test recomputes
 * it and compares. After the refactor the same fixtures become the parity target for the new engine.
 */
const { loadLegacyEE, loadLegacyBE } = require('../helpers/legacy');

const clone = x => JSON.parse(JSON.stringify(x));

function eeStates(ee) {
  const PLAN_EE = ee.constants('PLAN_EE_DEFAULT');
  const PLAN_BE = ee.constants('PLAN_BE_DEFAULT');
  const PLAN_DM = ee.constants('PLAN_DOUBLE_MAJOR_DEFAULT');
  const P = plan => ee.planToPlacements(plan);
  const terms8 = ['completed', 'year1-fall', 'year1-spring', 'year2-fall', 'year2-spring', 'year3-fall', 'year3-spring', 'year4-fall', 'year4-spring'];
  const terms10 = [...terms8, 'year5-fall', 'year5-spring'];
  const base = over => Object.assign({ v: 2, major: 'EE', doubleMajor: false, secondaryMajor: 'BE', minor: 'none', terms: terms8.slice(), plan: {}, done: {}, tileMeta: {} }, over);

  const dm = () => base({ major: 'EE', doubleMajor: true, secondaryMajor: 'BE', minor: 'ROBOTICS', terms: terms10.slice(), plan: P(PLAN_DM) });

  const states = {};
  states.ee_preset = base({ plan: P(PLAN_EE) });
  states.be_preset = base({ major: 'BE', plan: P(PLAN_BE) });
  states.double_robotics_preset = dm();

  // Regression for the Biology audit bug: BIOL 1201 completed must count for BE Biological Sciences AND EE Life Science.
  states.double_bio_done = Object.assign(dm(), { done: { BIOL1201: 'year1-fall' } });

  // MATH 2090 standing in for MATH 2070, plus ENGR 3100 whose prerequisite is a nested OR group.
  states.double_math2090_sub = (() => {
    const s = dm();
    delete s.plan.MATH2070;
    s.plan.MATH2090 = 'year2-fall';
    s.plan.ENGR3100 = 'year4-fall';
    return s;
  })();

  // Everything in year 1 completed, one AP course in the bank: exercises fixed credits / AP credits in the scenario.
  states.double_partial_done = (() => {
    const s = dm();
    for (const id of Object.keys(s.plan)) if (s.plan[id] === 'year1-fall' || s.plan[id] === 'year1-spring') s.done[id] = s.plan[id];
    s.done.MATH1550 = 'completed';
    return s;
  })();

  states.ee_empty = base({});

  // Deliberate rule violations: prerequisite order, season, and a summer term.
  states.ee_broken_order = (() => {
    const s = base({ plan: P(PLAN_EE) });
    s.plan.EE2130 = 'year1-fall';
    s.plan.EE2230 = 'year1-summer';
    s.terms = ['completed', 'year1-fall', 'year1-summer', 'year1-spring', 'year2-fall', 'year2-spring', 'year3-fall', 'year3-spring', 'year4-fall', 'year4-spring'];
    return s;
  })();

  // KNOWN DEFECT (see refactor plan): breadth "passes" from 1 real group + 3 unresolved placeholders.
  states.ee_breadth_one_group = base({ plan: { EE3220: 'year3-fall', EE_BREADTH1: 'year3-fall', EE_BREADTH2: 'year3-fall', EE_BREADTH3: 'year3-spring' } });

  return states;
}

function beStates(be) {
  const states = {};
  states.standard_default = be.defaultState('standard');
  states.premed_default = be.defaultState('premed');

  states.standard_partial = (() => {
    const s = be.defaultState('standard');
    s.done = { BE1251: 'year1-fall', CHEM1201: 'year1-fall', BIOL1201: 'year1-fall', MATH1550: 'completed' };
    s.tileMeta = { 'c-test1': { custom: true, code: 'TEST 1000', title: 'Test elective', cr: 3, diff: 'normal', note: 'from a fixture' } };
    s.std['c-test1'] = 'year2-fall';
    s.pm['c-test1'] = 'year2-fall';
    s.terms = [...s.terms, 'year5-fall'];
    return s;
  })();

  states.premed_partial = (() => {
    const s = be.defaultState('premed');
    s.done = { CHEM1201: 'year1-fall', BIOL1201: 'year1-fall', MATH1550: 'completed' };
    return s;
  })();

  return states;
}

function compute() {
  const ee = loadLegacyEE();
  const be = loadLegacyBE();
  const out = { audit: {}, eeValidate: {}, eeScenario: {}, beValidate: {}, beScenario: {}, links: {} };

  const E = eeStates(ee);
  for (const [name, s] of Object.entries(E)) {
    out.audit[name] = ee.audit(clone(s));
    out.eeValidate[name] = ee.validateAll(clone(s));
    out.eeScenario[name] = ee.scenario(clone(s));
  }

  const B = beStates(be);
  for (const [name, s] of Object.entries(B)) {
    out.beValidate[name] = be.validateAll(clone(s));
    out.beScenario[name] = be.scenario(clone(s));
  }

  // ---- share links: the decoders must keep working after the refactor ----
  const links = out.links;
  links.beCompact = Object.entries(B).map(([name, s]) => {
    const link = be.encodeCompact(clone(s));
    return { name, state: clone(s), link, decoded: be.decodeCompact(link) };
  });
  links.beLegacyData = Object.entries(B).map(([name, s]) => {
    const payload = be.encodeLegacyData(clone(s));
    return { name, state: clone(s), payload, decoded: be.decodeLegacyData(payload) };
  });
  // Older payload shapes that ?data= links (and old saved state) may still contain.
  const v1 = { 'year1-fall': ['BE1251', 'CHEM1201', 'BIOL1201'], 'year1-spring': ['BE1252', 'MATH1552'], junk: 'ignored' };
  const v2 = { v: 2, columns: [{ key: 'year1-fall', tiles: ['BE1251', 'CHEM1201'] }, { key: 'year1-spring', tiles: ['BE1252'] }], tileMeta: {} };
  links.beOldFormats = [
    { name: 'v1 standard', input: v1, track: 'standard', v3: be.toV3(v1, 'standard') },
    { name: 'v2 standard', input: v2, track: null, v3: be.toV3(v2, null) },
  ];
  links.eePlan = Object.entries(E).map(([name, s]) => ({ name, state: clone(s), payload: ee.shareLink(clone(s)) }));
  return out;
}

module.exports = { compute, eeStates, beStates };
