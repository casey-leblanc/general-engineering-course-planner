// Derive a program (requirement tree + recommended plan) from a flowchart transcription.
//   node tools/programs/derive.mjs        writes data/2026-2027/programs/<KEY>.json
//
// A flowchart lists exactly what a degree requires, so every course and slot on it becomes a requirement. Requirement ids
// are stable and structured (<PROGRAM>/<group>/<name>), because advisor and personal rules point at them.
// Programs derived this way are marked verified:false: they say what the chart says, not what the catalog says.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../flowcharts/build.mjs';
import { validateProgram } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const YEAR = '2026-2027';
const TERM_KEYS = n => `year${Math.ceil(n / 2)}-${n % 2 === 1 ? 'fall' : 'spring'}`;
const SLOT_ROOT = { gened: 'gen-ed' };

/** Which courses may fill a slot when no rule says otherwise. Slots with no pool accept only a placeholder tile. */
// The same LSU gen-ed category is spelled differently on different charts ("HUMANITY" on the BE and CS charts, "HUMN" on the EE
// chart); one attribute per category is what lets a slot of one program stand in for a slot of another.
const GENED_ATTR = { humanity: 'humanities' };
export function poolFor(slot, fc) {
  if (slot === 'ee-design') return { attrs: ['design'] };
  if (slot === 'gened:socsci-2000') return { attrs: ['gen-ed:socsci'], level: { min: 2000 } };
  // "CSC 2+++" on a chart means any 2000-level CSC course (likewise 3+++ and 4+++)
  const level = /^csc-(\d)000$/.exec(slot);
  if (level) return { subject: 'CSC', level: { min: Number(level[1]) * 1000, max: Number(level[1]) * 1000 + 999 } };
  if (slot.startsWith('gened:')) return { attrs: [`gen-ed:${GENED_ATTR[slot.slice(6)] || slot.slice(6)}`] };
  if (slot === 'tech-elective-a') return { attrs: ['stem'], level: { min: 2000 } };
  if (slot === 'tech-elective-a-or-b') return [{ attrs: ['stem'], level: { min: 2000 } }, { attrs: ['avatar-dm'] }];
  if (slot === 'area-elective' && fc.concentration && fc.concentration.areaElectives && fc.concentration.areaElectives.length) return { courses: fc.concentration.areaElectives };
  return undefined;
}

/** Scheduling hints for the auto-arrange solver, by chart slot. */
export function hintsFor(slot) {
  if (slot === 'design-electives' || slot === 'ee-design') return ['design'];
  if (slot.startsWith('gened:')) return ['gen-ed'];
  if (slot === 'general-elective') return ['elective'];
  if (['tech-elective', 'ee-tech', 'tech-elective-a', 'tech-elective-a-or-b'].includes(slot)) return ['elective', 'upper'];
  return undefined;
}

const slotPath = slot => slot.split(':').map((p, i) => (i === 0 && SLOT_ROOT[p]) || p);

export function deriveProgram(fc) {
  const key = fc.program;
  const seniorSet = new Set((fc.groups && fc.groups.seniorDesign) || []);
  const concSet = new Set((fc.concentration && fc.concentration.courses) || []);
  const courseGroups = { core: [], 'senior-design': [], concentration: [] };
  const slotOrder = [];            // path keys in first-appearance order
  const slots = new Map();         // path key -> [{item}]
  const plan = fc.semesters.map(() => []);
  const breadthTiles = [];

  fc.semesters.forEach((sem, si) => {
    for (const it of sem.items) {
      if (it.course) {
        const g = seniorSet.has(it.course) ? 'senior-design' : concSet.has(it.course) ? 'concentration' : 'core';
        const node = { id: `${key}/${g}/${it.course}`, type: 'course', course: it.course };
        if (it.alternatives) node.anyOf = it.alternatives;
        if (it.minGrade) node.minGrade = it.minGrade;
        courseGroups[g].push(node);
        plan[si].push(it.course);
      } else if (it.slot === 'ee-breadth') {
        breadthTiles.push(si);
        plan[si].push(null); // placeholder id filled in below
      } else {
        const k = it.slot;
        if (!slots.has(k)) { slots.set(k, []); slotOrder.push(k); }
        slots.get(k).push({ it, si, planIndex: plan[si].length });
        plan[si].push(null);
      }
    }
  });

  // breadth tiles get ids <PROGRAM>/breadth/1..n in plan order
  let bn = 0;
  fc.semesters.forEach((sem, si) => sem.items.forEach((it, ii) => { if (it.slot === 'ee-breadth') { bn++; plan[si][ii] = `${key}/breadth/${bn}`; } }));

  const nodes = [];
  const label = { core: 'Core courses', 'senior-design': 'Senior design', concentration: 'Concentration courses' };
  for (const g of ['core', 'senior-design', 'concentration']) {
    if (courseGroups[g].length) nodes.push({ id: `${key}/${g}`, type: 'all', label: label[g], items: courseGroups[g] });
  }
  if (fc.breadth) {
    nodes.push({
      id: `${key}/breadth`, type: 'distinctGroups', label: 'Breadth electives', minGroups: fc.breadth.minGroups, minCourses: fc.breadth.minCourses,
      groups: fc.breadth.groups.map(g => ({ name: g.name, courses: Object.keys(g.courses) })),
    });
  }

  const slotNode = (id, it, k) => {
    const n = { id, type: 'slot', label: it.label, credits: it.credits };
    const from = poolFor(k, fc);
    if (from) n.from = from;
    const hints = hintsFor(k);
    if (hints) n.hints = hints;
    if (it.minGrade) n.minGrade = it.minGrade;
    return n;
  };
  const genEd = [];
  const genEdChildren = new Map();
  const tileOf = (k, list, idx) => {
    const p = slotPath(k).join('/');
    return list.length === 1 ? `${key}/${p}` : `${key}/${p}/${idx + 1}`;
  };
  for (const k of slotOrder) {
    const list = slots.get(k);
    const p = slotPath(k);
    const build = () => {
      if (list.length === 1) return slotNode(`${key}/${p.join('/')}`, list[0].it, k);
      return {
        id: `${key}/${p.join('/')}`, type: 'all', label: list[0].it.label,
        items: list.map((s, i) => slotNode(`${key}/${p.join('/')}/${i + 1}`, s.it, k)),
      };
    };
    if (p[0] === 'gen-ed') genEdChildren.set(k, build()); else nodes.push(build());
    list.forEach((s, i) => { plan[s.si][s.planIndex] = tileOf(k, list, i); });
  }
  if (genEdChildren.size) nodes.push({ id: `${key}/gen-ed`, type: 'all', label: 'General education', items: [...genEdChildren.values()] });

  const program = {
    id: key, kind: 'major', name: fc.name, degree: fc.degree, catalogYear: YEAR, totalCredits: fc.totalHours, college: 'Engineering',
    requirements: { id: `${key}/root`, type: 'all', label: fc.name, items: nodes },
    recommendedPlan: plan.map((ids, i) => [TERM_KEYS(i + 1), ids]),
    flowchartUrl: fc.source.url,
    source: { catalogYear: YEAR, origin: 'flowchart', verified: false, evidence: `derived from ${fc.source.file} (read 2026-09-28); not checked against the General Catalog` },
  };
  const seniorList = (fc.groups && fc.groups.seniorDesign) || [];
  if (seniorList.length === 2) program.sequences = [{ a: seniorList[0], b: seniorList[1], gap: 1 }];
  const m = /^(.+?) \((.+)\)$/.exec(fc.name);
  if (m) { program.group = m[1]; program.variant = m[2]; }
  if (fc.notes) program.notes = fc.notes;
  if (fc.staleness) program.staleness = fc.staleness;
  return program;
}

export function deriveAll() {
  return buildAll().map(deriveProgram);
}

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
async function jsonFiles(dir) { try { return (await readdir(dir)).filter(f => f.endsWith('.json')).sort().map(f => path.join(dir, f)); } catch (e) { return []; } }

/** Programs nobody has a flowchart for (minors, ...) are hand-authored under data/authored/<year>/programs and copied through. */
export async function authoredPrograms() {
  return Promise.all((await jsonFiles(path.join(root, 'data', 'authored', YEAR, 'programs'))).map(readJson));
}

/** Tracks (for example pre-med) are hand-authored per program under data/authored/<year>/tracks and merged into that program. */
export async function withTracks(programs) {
  const files = await Promise.all((await jsonFiles(path.join(root, 'data', 'authored', YEAR, 'tracks'))).map(readJson));
  return programs.map(p => {
    const t = files.find(f => f.program === p.id);
    return t ? { ...p, tracks: t.tracks } : p;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(root, 'data', YEAR, 'programs');
  await mkdir(dir, { recursive: true });
  for (const p of [...(await withTracks(deriveAll())), ...(await authoredPrograms())]) {
    const errs = validateProgram(p);
    if (errs.length) { console.error(p.id, errs); process.exitCode = 1; continue; }
    await writeFile(path.join(dir, `${p.id}.json`), JSON.stringify(p, null, 1) + '\n');
    console.log(`${p.id.padEnd(9)} ${JSON.stringify(p.requirements).length} bytes of requirements`);
  }
}
