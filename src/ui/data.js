// Loads the JSON data files (manifest, courses, programs, rule packs, presets) and builds the dataset the engine works on.
import { createDataset } from '../core/dataset.js';

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadData() {
  const manifest = await getJson('data/manifest.json');
  const years = new Map();

  async function year(name) {
    if (!years.has(name)) {
      const m = manifest.years[name];
      if (!m) throw new Error(`unknown catalog year ${name}`);
      years.set(name, (async () => {
        const [courses, overlay, rulePacks, presets] = await Promise.all([
          getJson(m.courses), getJson(m.overlay), Promise.all(m.rules.map(getJson)),
          m.presets ? getJson(m.presets).then(p => p.presets).catch(() => ({})) : Promise.resolve({}),
        ]);
        return { name, meta: m, courses, overlay, rulePacks, presets, programs: new Map(), dataset: null, datasetKey: '' };
      })());
    }
    return years.get(name);
  }

  return {
    manifest,
    defaultYear: manifest.defaultYear,
    yearNames: Object.keys(manifest.years),
    summaries: name => manifest.years[name].programs,
    summary: (name, id) => manifest.years[name].programs.find(p => p.id === id) || null,
    /** The dataset for a year with the given programs loaded (others already loaded stay available). */
    async dataset(name, programIds) {
      const y = await year(name);
      const wanted = programIds.filter(id => !y.programs.has(id) && y.meta.programs.some(p => p.id === id));
      await Promise.all(wanted.map(async id => { y.programs.set(id, await getJson(y.meta.programs.find(p => p.id === id).file)); }));
      const key = [...y.programs.keys()].sort().join(',');
      if (!y.dataset || y.datasetKey !== key) {
        y.dataset = createDataset({ courses: y.courses, overlay: y.overlay, programs: [...y.programs.values()], rulePacks: y.rulePacks });
        y.datasetKey = key;
      }
      return y.dataset;
    },
    async presets(name) { return (await year(name)).presets; },
    async meta(name) { return (await year(name)).meta; },
  };
}
