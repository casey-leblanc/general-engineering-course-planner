// One-off converter: the old hand-typed course data (majors-data.js LSU_CATALOG, app.js CATALOG) -> the new schema.
// Output is explicitly marked origin:'legacy', verified:false. It exists so the new engine has a realistic dataset
// to develop against, and so `tools/verify.js` can measure how wrong the old data is. It is replaced, not trusted.
//
//   node tools/convert-legacy.js            writes data/legacy-import/2025-2026/{courses,overlay}.json
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const YEAR = '2025-2026'; // the catalog year the old data was built from (per its flowchart links)

/** legacy pre/co list (+ Any flag) -> Expr | undefined */
export function listToExpr(list, any) {
  if (!Array.isArray(list) || !list.length) return undefined;
  const leaf = id => ({ course: id });
  if (any) return list.flat(Infinity).length === 1 ? leaf(list.flat(Infinity)[0]) : { any: list.flat(Infinity).map(leaf) };
  const items = list.map(x => (Array.isArray(x) ? (x.length === 1 ? leaf(x[0]) : { any: x.map(leaf) }) : leaf(x)));
  return items.length === 1 ? items[0] : { all: items };
}

export function convertCourse(id, c) {
  const m = /^([A-Z]{2,5})(\d{4}[A-Z]?)$/.exec(id);
  if (!m) throw new Error(`cannot derive subject/number from id ${id}`);
  const rec = {
    id, subject: m[1], number: m[2],
    title: String(c.title || '').trim() || id,
    credits: { fixed: c.cr },
    parse: 'none',
    attrs: [`level:${Math.floor(Number(m[2]) / 1000) * 1000}`],
    source: { catalogYear: YEAR, origin: 'legacy', verified: false },
  };
  const pre = listToExpr(c.pre, c.preAny);
  const co = listToExpr(c.co, c.coreqAny);
  if (pre) rec.prereq = pre;
  if (co) rec.coreq = co;
  const overlay = {
    difficulty: c.diff || 'normal',
    offered: { terms: c.sem || [], ...(c.summer ? { summer: c.summer } : {}), confidence: 'assumed', evidence: 'legacy hand-typed' },
  };
  if (c.breadthGroup) overlay.breadthGroup = c.breadthGroup;
  if (c.isRobotics) overlay.tags = ['robotics-minor'];
  return { rec, overlay };
}

export async function build() {
  const { loadLegacyEE, loadLegacyBE } = require('../tests/helpers/legacy.js');
  const ee = loadLegacyEE().constants('LSU_CATALOG');
  const be = loadLegacyBE().constants('CATALOG');
  const merged = { ...be, ...ee }; // majors-data.js is the superset and carries the deliberate MATH 2090 edits
  const courses = [];
  const overlay = {};
  for (const id of Object.keys(merged).sort()) {
    const { rec, overlay: o } = convertCourse(id, merged[id]);
    courses.push(rec);
    overlay[id] = o;
  }
  return { courses, overlay, counts: { ee: Object.keys(ee).length, be: Object.keys(be).length, merged: courses.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { courses, overlay, counts } = await build();
  const dir = path.join(root, 'data', 'legacy-import', YEAR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'courses.json'), JSON.stringify(courses, null, 1) + '\n');
  await writeFile(path.join(dir, 'overlay.json'), JSON.stringify(overlay, null, 1) + '\n');
  console.log(`wrote ${courses.length} courses (majors-data.js ${counts.ee}, app.js ${counts.be}, merged ${counts.merged}) to ${path.relative(root, dir)}`);
}
