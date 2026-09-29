// Loads the committed 2026-27 data into a dataset, the way the browser does, for tests.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataset } from '../../src/core/dataset.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
export const YEAR = '2026-2027';

// The browser loads fflate with a <script> tag; in Node the vendored file is a CommonJS module.
globalThis.fflate = createRequire(import.meta.url)(path.join(root, 'fflate.min.js'));

export async function loadDataset({ year = YEAR, extraCourses = [], extraOverlay = {}, extraRules = [] } = {}) {
  const dir = path.join(root, 'data', year, 'programs');
  const programs = await Promise.all((await readdir(dir)).filter(f => f.endsWith('.json')).sort().map(f => readJson(`data/${year}/programs/${f}`)));
  const packs = await Promise.all((await readdir(path.join(root, 'data', 'rules', year))).filter(f => f.endsWith('.json')).map(f => readJson(`data/rules/${year}/${f}`)));
  return createDataset({
    courses: [...(await readJson(`data/${year}/courses.json`)), ...extraCourses],
    overlay: { ...(await readJson(`data/${year}/overlay.json`)), ...extraOverlay },
    programs,
    rulePacks: [...packs, ...extraRules],
  });
}
