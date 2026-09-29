// The browser learns what data exists from one small file, so adding a program or a catalog year is a data change only.
//   node tools/data/build-manifest.mjs      writes data/manifest.json
// Program summaries are listed here (the planner's program picker needs them for every program); each program's requirement
// tree is fetched only when a student selects it.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProgram, validateCourse, validateRulePack } from '../../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const exists = async p => { try { await readFile(path.join(root, p)); return true; } catch (e) { return false; } };
const jsonIn = async dir => { try { return (await readdir(path.join(root, dir))).filter(f => f.endsWith('.json')).sort(); } catch (e) { return []; } };

/** The planner opens on this selection (the owner's own double major); anything missing from a year falls back to that year's first program. */
export const DEFAULT_PROGRAMS = ['EE-BSEE', 'BE-BSBE'];

export async function buildManifest() {
  const years = {};
  const dirs = (await readdir(path.join(root, 'data'))).filter(d => /^\d{4}-\d{4}$/.test(d)).sort();
  for (const year of dirs) {
    if (!(await exists(`data/${year}/courses.json`))) continue;
    const courses = await readJson(`data/${year}/courses.json`);
    const problems = courses.flatMap(c => validateCourse(c).map(e => `${c.id} ${e.path} ${e.message}`));
    if (problems.length) throw new Error(`data/${year}/courses.json: ${problems[0]}`);
    const programs = [];
    for (const f of await jsonIn(`data/${year}/programs`)) {
      const p = await readJson(`data/${year}/programs/${f}`);
      const errs = validateProgram(p);
      if (errs.length) throw new Error(`${f}: ${errs[0].path} ${errs[0].message}`);
      programs.push({
        id: p.id, kind: p.kind, name: p.name, ...(p.degree ? { degree: p.degree } : {}), ...(p.group ? { group: p.group } : {}), ...(p.variant ? { variant: p.variant } : {}),
        ...(p.totalCredits ? { totalCredits: p.totalCredits } : {}), verified: p.source.verified === true,
        ...(p.tracks ? { tracks: p.tracks.map(t => ({ id: t.id, name: t.name, ...(t.default ? { default: true } : {}), ...(t.note ? { note: t.note } : {}) })) } : {}),
        ...(p.flowchartUrl ? { flowchartUrl: p.flowchartUrl } : {}),
        ...(p.staleness ? { staleness: p.staleness } : {}),
        file: `data/${year}/programs/${f}`,
      });
    }
    const rules = [];
    let asOf = '';
    for (const f of await jsonIn(`data/rules/${year}`)) {
      const pack = await readJson(`data/rules/${year}/${f}`);
      const errs = validateRulePack(pack);
      if (errs.length) throw new Error(`${f}: ${errs[0].path} ${errs[0].message}`);
      rules.push(`data/rules/${year}/${f}`);
      for (const r of pack.rules) if (r.source.recordedOn > asOf) asOf = r.source.recordedOn;
    }
    const count = o => courses.filter(c => c.source.origin === o).length;
    years[year] = {
      label: year.replace(/^(\d{4})-(\d{2})(\d{2})$/, '$1-$3'),
      courses: `data/${year}/courses.json`,
      overlay: `data/${year}/overlay.json`,
      ...((await exists(`data/${year}/presets.json`)) ? { presets: `data/${year}/presets.json` } : {}),
      rules,
      programs,
      defaultPrograms: DEFAULT_PROGRAMS.every(id => programs.some(p => p.id === id)) ? DEFAULT_PROGRAMS : programs.slice(0, 1).map(p => p.id),
      stats: { courses: courses.length, verified: courses.filter(c => c.source.verified === true).length, legacy: count('legacy'), flowchartOnly: count('flowchart'), catalog: count('catalog'), workday: count('workday') },
      ...(asOf ? { rulesAsOf: asOf } : {}),
    };
  }
  const names = Object.keys(years);
  return { schema: 'manifest/1', defaultYear: names[names.length - 1], years };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = await buildManifest();
  await writeFile(path.join(root, 'data', 'manifest.json'), JSON.stringify(m, null, 1) + '\n');
  for (const [y, v] of Object.entries(m.years)) console.log(`${y}: ${v.programs.length} programs, ${v.stats.courses} courses (${v.stats.verified} verified), ${v.rules.length} rule pack(s)`);
}
