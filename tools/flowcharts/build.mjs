// Turns the hand transcription into validated JSON: data/flowcharts/2026-2027/<KEY>.json
//   node tools/flowcharts/build.mjs
// Checks: every semester's credit hours equal the hours printed on the chart, and the semesters sum to TOTAL HOURS.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARTS } from './transcriptions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const YEAR = '2026-2027';
const BASE_URL = 'https://www.lsu.edu/eng/docs/Flowcharts/2026-2027/';
const ID = /^[A-Z]{2,5}\d{4}[A-Z]?$/;

export function parseRow(row) {
  if (typeof row !== 'string') {
    if (!row.slot) throw new Error(`bad slot row ${JSON.stringify(row)}`);
    return { slot: row.slot, credits: row.cr, label: row.label, ...(row.minGrade ? { minGrade: row.minGrade } : {}) };
  }
  const [idPart, cr, ...flags] = row.split(/\s+/);
  const ids = idPart.split('|');
  if (!ids.every(i => ID.test(i))) throw new Error(`bad course id in "${row}"`);
  if (!/^\d+$/.test(cr)) throw new Error(`bad credit hours in "${row}"`);
  const item = { course: ids[0], credits: Number(cr) };
  if (ids.length > 1) item.alternatives = ids.slice(1);
  for (const f of flags) {
    if (f === 'C') item.minGrade = 'C';
    else if (f === 'F' || f === 'S' || f === 'Su') item.offered = f;
    else if (f === '*') item.mayBePrereq = true;
    else throw new Error(`unknown flag "${f}" in "${row}"`);
  }
  return item;
}

export function buildFlowchart(chart) {
  const semesters = chart.semesters.map((s, i) => {
    const items = s.items.map(parseRow);
    const sum = items.reduce((t, x) => t + x.credits, 0);
    if (sum !== s.hours) throw new Error(`${chart.key} semester ${i + 1}: items add up to ${sum} hours but the chart prints ${s.hours}`);
    return { n: i + 1, season: i % 2 === 0 ? 'F' : 'S', hours: s.hours, items };
  });
  const total = semesters.reduce((t, s) => t + s.hours, 0);
  if (total !== chart.totalHours) throw new Error(`${chart.key}: semesters add up to ${total} but TOTAL HOURS is ${chart.totalHours}`);

  const pdf = path.join(root, '.catalog-cache', 'flowcharts', YEAR, chart.file);
  const bytes = existsSync(pdf) ? readFileSync(pdf) : null;
  const out = {
    schema: 'flowchart/1',
    program: chart.key, name: chart.name, degree: chart.degree, catalogYear: YEAR, totalHours: chart.totalHours,
    source: {
      kind: 'flowchart', file: chart.file, url: BASE_URL + chart.file, revision: chart.revision,
      sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null, bytes: bytes ? bytes.length : null,
      readOn: '2026-09-28', method: 'hand transcription of the rendered chart; hours cross-checked',
    },
    semesters,
  };
  for (const k of ['groups', 'breadth', 'concentration', 'staleness', 'notes']) if (chart[k]) out[k] = chart[k];
  return out;
}

export function buildAll() {
  return CHARTS.map(buildFlowchart);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(root, 'data', 'flowcharts', YEAR);
  await mkdir(dir, { recursive: true });
  for (const fc of buildAll()) {
    // keep an existing hash when the local PDF cache is not present
    const file = path.join(dir, `${fc.program}.json`);
    if (fc.source.sha256 === null && existsSync(file)) {
      const old = JSON.parse(readFileSync(file, 'utf8'));
      fc.source.sha256 = old.source.sha256; fc.source.bytes = old.source.bytes;
    }
    await writeFile(file, JSON.stringify(fc, null, 1) + '\n');
    console.log(`${fc.program.padEnd(9)} ${String(fc.totalHours).padStart(3)} hrs  ${fc.semesters.map(s => s.hours).join(' ')}`);
  }
}
