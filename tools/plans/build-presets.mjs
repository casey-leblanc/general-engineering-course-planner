// Pre-computed recommended plans for the program combinations students pick most, so the planner opens instantly on them.
//   node tools/plans/build-presets.mjs        writes data/<year>/presets.json (about half a minute per combination)
//
// A preset is `recommend()` (merge the programs' plans, drop what the advisor rules make redundant) followed by the same
// auto-arrange solve the Auto-arrange button runs, given more time. tests/data/presets.test.mjs re-checks every preset against the
// current data (same tiles, no prerequisite or offering problem, nothing missing), so a stale preset fails the build.
// A combination with no preset still works: the planner computes the merge itself and balances it with Auto-arrange.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, root, YEAR } from '../../tests/helpers/data.mjs';
import { recommend } from '../../src/core/plan.js';
import { emptyState, studentOf, applyRecommended, rulesOf, planKey } from '../../src/core/state.js';
import { createRuleset } from '../../src/core/rules.js';
import { buildScenario } from '../../src/core/scenario.js';

const require = createRequire(import.meta.url);
const planner = require(path.join(root, 'planner.js'));
const HighsFactory = require(path.join(root, 'highs.js'));

/** The combinations worth a preset. Order matters: the first program is the primary one. */
export const COMBOS = [
  { programs: ['EE-BSEE', 'BE-BSBE'], tracks: {} },
  { programs: ['BE-BSBE', 'EE-BSEE'], tracks: {} },
];

export async function buildPreset(dataset, combo, { seconds = 60, gap = 0.03 } = {}) {
  const state = emptyState({ catalogYear: YEAR, programs: combo.programs, tracks: combo.tracks });
  const student = studentOf(state, dataset);
  const rec = recommend({ dataset, student, tracks: combo.tracks });
  applyRecommended(state, rec);
  const ruleset = createRuleset(rulesOf(state, dataset), student);
  const sequences = combo.programs.flatMap(p => dataset.program(p).sequences || []);
  const scn = buildScenario({ dataset, ruleset, state, sequences, anchor: rec.placed });
  const highs = await HighsFactory({ locateFile: f => path.join(root, f) });
  const res = await planner.solvePlan(scn, lp => highs.solve(lp, { output_flag: false, mip_rel_gap: gap, time_limit: seconds }));
  if (res.status !== 'optimal') throw new Error(`${planKey(state)}: solver said ${res.status} ${res.reason || ''}`);
  const placed = { ...rec.placed, ...res.placements };
  const sortedPlaced = Object.fromEntries(Object.keys(placed).sort().map(k => [k, placed[k]]));
  return {
    programs: combo.programs, tracks: combo.tracks, terms: state.terms, placed: sortedPlaced, assign: rec.assign, credits: rec.credits,
    dropped: rec.dropped.map(d => ({ id: d.id, ...(d.reason ? { by: d.reason.by, via: d.reason.via } : {}) })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataset = await loadDataset();
  const presets = {};
  for (const combo of COMBOS) {
    const t0 = Date.now();
    const key = planKey({ programs: combo.programs, tracks: combo.tracks });
    presets[key] = await buildPreset(dataset, combo);
    console.log(`${key}: ${presets[key].credits} credits, ${presets[key].terms.length - 1} semesters, ${presets[key].dropped.length} dropped (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await writeFile(path.join(root, 'data', YEAR, 'presets.json'), JSON.stringify({ schema: 'presets/1', catalogYear: YEAR, presets }, null, 1) + '\n');
}
