// Compare a course dataset against catalog-sourced records and report mismatches.
//   node tools/verify.js [--data <courses.json>] [--catalog <courses.json>] [--json]
// Defaults compare the converted legacy data with the catalog records committed under data/catalog/.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exprCourses } from '../src/core/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const creditsKey = c => (c && 'fixed' in c ? String(c.fixed) : c ? `${c.min}-${c.max}` : '?');
const requisiteSet = c => new Set([...exprCourses(c.prereq), ...exprCourses(c.coreq)]);
const diffSets = (a, b) => ({ onlyInData: [...a].filter(x => !b.has(x)).sort(), onlyInCatalog: [...b].filter(x => !a.has(x)).sort() });

/** Field-level differences between one data record and the catalog record for the same course. Empty array = agrees. */
export function compareCourse(data, catalog) {
  const out = [];
  if (norm(data.title) !== norm(catalog.title)) out.push({ field: 'title', data: data.title, catalog: catalog.title });
  if (creditsKey(data.credits) !== creditsKey(catalog.credits)) out.push({ field: 'credits', data: creditsKey(data.credits), catalog: creditsKey(catalog.credits) });
  const d = diffSets(requisiteSet(data), requisiteSet(catalog));
  if (d.onlyInData.length || d.onlyInCatalog.length) out.push({ field: 'requisite courses', ...d });
  return out;
}

export function compareDatasets(dataCourses, catalogCourses) {
  const byId = new Map(dataCourses.map(c => [c.id, c]));
  const report = { compared: 0, agree: 0, mismatched: [], missingFromData: [], notInCatalogRecords: dataCourses.length - 0 };
  for (const cat of catalogCourses) {
    const dat = byId.get(cat.id);
    if (!dat) { report.missingFromData.push(cat.id); continue; }
    report.compared++;
    const diffs = compareCourse(dat, cat);
    if (diffs.length) report.mismatched.push({ id: cat.id, diffs, source: cat.source }); else report.agree++;
  }
  report.notInCatalogRecords = dataCourses.length - report.compared;
  return report;
}

export function formatReport(r) {
  const lines = [`Compared ${r.compared} course(s) that have catalog-sourced records: ${r.agree} agree, ${r.mismatched.length} differ.`,
    `${r.notInCatalogRecords} course(s) in the dataset have no catalog record yet, so they are unverified.`];
  for (const m of r.mismatched) {
    lines.push('', `${m.id}  (catalog: ${m.source.catalogYear}${m.source.coid ? `, coid ${m.source.coid}` : ''})`);
    for (const d of m.diffs) {
      if (d.field === 'requisite courses') lines.push(`  requisites: dataset-only [${d.onlyInData.join(', ')}]  catalog-only [${d.onlyInCatalog.join(', ')}]`);
      else lines.push(`  ${d.field}: dataset "${d.data}"  catalog "${d.catalog}"`);
    }
  }
  if (r.missingFromData.length) lines.push('', `In the catalog records but not in the dataset: ${r.missingFromData.join(', ')}`);
  return lines.join('\n');
}

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataPath = path.resolve(root, opt('data', 'data/legacy-import/2025-2026/courses.json'));
  const catPath = path.resolve(root, opt('catalog', 'data/catalog/2025-2026/courses.json'));
  const report = compareDatasets(JSON.parse(await readFile(dataPath, 'utf8')), JSON.parse(await readFile(catPath, 'utf8')));
  console.log(args.includes('--json') ? JSON.stringify(report, null, 1) : formatReport(report));
  process.exitCode = report.mismatched.length ? 2 : 0;
}
