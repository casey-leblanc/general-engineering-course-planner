// Build the working 2026-27 course dataset by merging sources, best first:
//   1. data/catalog/2026-2027/courses.json  read from the catalog or Workday   -> verified
//   2. data/legacy-import/2025-2026/        the old hand-typed data (renames applied) -> UNVERIFIED
//   3. stubs for courses that appear only on the flowcharts or in rules       -> requisites UNKNOWN
// Credit hours on a 2026-27 flowchart override the legacy value (the chart is newer). Every record keeps its own source.
//   node tools/data/build-2026-2027.mjs      writes data/2026-2027/{courses,overlay}.json
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../flowcharts/build.mjs';
import { validateCourse } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const YEAR = '2026-2027';

/** Courses that the 2026-27 flowcharts show under a new number. Legacy records for the old numbers are dropped. */
export const RENAMES = { EE1810: 'EE1820', EE2810: 'EE2820' };
const STUB_TITLES = { EE1820: 'Intro to ECE', EE2820: 'Intro Design' }; // short labels from the chart; not official titles
const LEGACY_LIFE_SCIENCE = ['BIOL1201', 'BIOL1202'];
/** Solver tuning carried over from the old BE planner: courses with no meaningful position in the sequence (float) and gen-ed-like light load. */
const LEGACY_FLOAT = ['ENGL1001', 'ENGL2000', 'AGEC2003'];
const LEGACY_LIGHT = ['ENGL1001', 'ENGL2000'];
/** Legacy audit list of EE design electives (2025-26, unverified). The owner confirmed the BE rule means this list. */
export const EE_DESIGN_LIST = ['EE4160', 'EE4242', 'EE4420', 'EE4530', 'EE4710', 'EE4720'];

const rename = id => RENAMES[id] || id;
function renameExpr(e) {
  if (!e) return e;
  if (e.course) return { ...e, course: rename(e.course) };
  const out = { ...e };
  for (const k of ['all', 'any']) if (e[k]) out[k] = e[k].map(renameExpr);
  return out;
}
const level = id => `level:${Math.floor(Number(/\d{4}/.exec(id)[0]) / 1000) * 1000}`;
const split = id => { const m = /^([A-Z]{2,5})(\d{4}[A-Z]?)$/.exec(id); return { subject: m[1], number: m[2] }; };

function programCourses(programs) {
  const out = new Set();
  const walk = n => {
    if (n.course) { out.add(n.course); (n.anyOf || []).forEach(c => out.add(c)); }
    if (n.groups) n.groups.forEach(g => g.courses.forEach(c => out.add(c)));
    (n.items || []).forEach(walk);
  };
  programs.forEach(p => walk(p.requirements));
  return out;
}

export async function build() {
  const flowcharts = buildAll();
  const programFiles = (await readdir(path.join(root, 'data', YEAR, 'programs'))).filter(f => f.endsWith('.json')).sort();
  const programs = await Promise.all(programFiles.map(f => readJson(`data/${YEAR}/programs/${f}`)));
  const rulePack = await readJson(`data/rules/${YEAR}/be-ee.json`);
  const legacy = await readJson('data/legacy-import/2025-2026/courses.json');
  const legacyOverlay = await readJson('data/legacy-import/2025-2026/overlay.json');
  const catalog = await readJson(`data/catalog/${YEAR}/courses.json`);

  // credit hours and flags per course as printed on the charts
  const chart = new Map(); // id -> { credits, programs:Set, offered:Set }
  for (const f of flowcharts) for (const s of f.semesters) for (const it of s.items) {
    if (!it.course) continue;
    // A box such as "MATH 2065 or MATH 2090" prints one credit value, which belongs to the first course only.
    [it.course, ...(it.alternatives || [])].forEach((id, k) => {
      const c = chart.get(id) || { credits: it.credits, exact: false, programs: new Set(), offered: new Set(), files: new Set() };
      if (k === 0) { c.credits = it.credits; c.exact = true; }
      c.programs.add(f.program); c.files.add(f.source.file);
      if (it.offered && k === 0) c.offered.add(it.offered);
      chart.set(id, c);
    });
  }
  for (const f of flowcharts) for (const g of (f.breadth ? f.breadth.groups : [])) for (const [id, term] of Object.entries(g.courses)) {
    const c = chart.get(id) || { credits: 3, exact: false, programs: new Set(), offered: new Set(), files: new Set() };
    c.programs.add(f.program); c.files.add(f.source.file);
    if (term) c.offered.add(term);
    chart.set(id, c);
  }

  // every course the programs or rules mention
  const needed = programCourses(programs);
  for (const r of rulePack.rules) {
    for (const k of ['course', 'satisfies']) if (r[k]) needed.add(r[k]);
    for (const pool of [].concat(r.accepts || [], r.rejects || [])) (pool.courses || []).forEach(c => needed.add(c));
  }

  const notes = { creditOverrides: [], renamedFromLegacy: [], stubs: [], legacyKept: 0, catalogRecords: catalog.length };
  const courses = new Map();
  for (const c of legacy) {
    if (RENAMES[c.id]) { notes.renamedFromLegacy.push(`${c.id} -> ${RENAMES[c.id]}`); continue; }
    const rec = { ...c, source: { ...c.source, evidence: '2025-26 hand-typed record used as a stand-in; not checked against 2026-27' } };
    if (rec.prereq) rec.prereq = renameExpr(rec.prereq);
    if (rec.coreq) rec.coreq = renameExpr(rec.coreq);
    const ch = chart.get(c.id);
    if (ch && ch.exact && rec.credits.fixed !== ch.credits) { notes.creditOverrides.push({ course: c.id, legacy: rec.credits.fixed, chart: ch.credits }); rec.credits = { fixed: ch.credits }; }
    courses.set(c.id, rec);
    notes.legacyKept++;
  }
  for (const id of needed) {
    if (courses.has(id)) continue;
    const ch = chart.get(id);
    const { subject, number } = split(id);
    courses.set(id, {
      id, subject, number, title: STUB_TITLES[id] || id, credits: { fixed: ch ? ch.credits : 3 }, parse: 'unknown', attrs: [level(id)],
      source: {
        catalogYear: YEAR, origin: 'flowchart', verified: false,
        evidence: ch ? `appears on the ${[...ch.files].join(', ')} flowchart(s); requisites not obtained yet` : 'named by a program or rule; requisites and credits not obtained yet',
      },
    });
    notes.stubs.push(id);
  }
  for (const c of catalog) courses.set(c.id, c); // verified records win

  const overlay = {};
  for (const [id, o] of Object.entries(legacyOverlay)) if (courses.has(id) && !RENAMES[id]) overlay[id] = JSON.parse(JSON.stringify(o));
  for (const [id, ch] of chart) {
    if (!courses.has(id) || !ch.offered.size) continue;
    const o = overlay[id] || (overlay[id] = {});
    o.offered = { terms: [...ch.offered], confidence: 'curated', evidence: `flowchart ${YEAR} marks this course as offered in ${[...ch.offered].join('/')} only` };
  }
  const attr = (id, a, evidence) => {
    if (!courses.has(id)) return;
    const o = overlay[id] || (overlay[id] = {});
    o.attrs = [...new Set([...(o.attrs || []), a])];
    o.attrsEvidence = { ...(o.attrsEvidence || {}), [a]: evidence };
  };
  for (const f of flowcharts) for (const id of (f.groups && f.groups.seniorDesign) || []) attr(id, 'senior-design', `labelled Sr Design on the ${f.source.file} flowchart`);
  // The old EE audit accepted these two for the Life Science gen-ed. Kept until the Workday GE/ILC tags replace it.
  for (const id of LEGACY_LIFE_SCIENCE) attr(id, 'gen-ed:life-science', 'legacy EE audit (2025-26) accepted this course for the Life Science gen-ed; unverified until the Workday GE/ILC tags are imported');
  for (const id of EE_DESIGN_LIST) attr(id, 'design', 'legacy EE design elective list (2025-26), unverified; owner confirmed "design aspects" means this list');

  for (const id of LEGACY_FLOAT) if (courses.has(id)) (overlay[id] || (overlay[id] = {})).float = true;
  for (const id of LEGACY_LIGHT) if (courses.has(id)) (overlay[id] || (overlay[id] = {})).light = true;

  const sorted = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));
  return { courses: [...courses.values()].sort((a, b) => a.id.localeCompare(b.id)), overlay: sorted(overlay), notes };
}

export function invalid(courses) {
  return courses.flatMap(c => validateCourse(c).map(e => `${c.id}: ${e.path} ${e.message}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { courses, overlay, notes } = await build();
  const bad = invalid(courses);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  const dir = path.join(root, 'data', YEAR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'courses.json'), JSON.stringify(courses, null, 1) + '\n');
  await writeFile(path.join(dir, 'overlay.json'), JSON.stringify(overlay, null, 1) + '\n');
  const by = o => courses.filter(c => c.source.origin === o).length;
  console.log(`${courses.length} courses: ${by('workday') + by('catalog')} verified, ${by('legacy')} legacy (unverified), ${by('flowchart')} stubs (requisites unknown)`);
  console.log(`renamed: ${notes.renamedFromLegacy.join(', ') || 'none'}; credit overrides from charts: ${JSON.stringify(notes.creditOverrides)}`);
}
