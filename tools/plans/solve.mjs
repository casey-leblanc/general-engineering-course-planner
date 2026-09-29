// The auto-arrange solve (planner.js + the vendored HiGHS) run from Node, for build tools.
import { createRequire } from 'node:module';
import path from 'node:path';
import { root } from '../../tests/helpers/data.mjs';

const require = createRequire(import.meta.url);
const planner = require(path.join(root, 'planner.js'));
const HighsFactory = require(path.join(root, 'highs.js'));

/** -> { status: 'optimal'|'infeasible'|'error', placements?, reason? } */
export async function solveScenario(scn, { seconds = 60, gap = 0.03 } = {}) {
  const highs = await HighsFactory({ locateFile: f => path.join(root, f) });
  return planner.solvePlan(scn, lp => highs.solve(lp, { output_flag: false, mip_rel_gap: gap, time_limit: seconds }));
}
