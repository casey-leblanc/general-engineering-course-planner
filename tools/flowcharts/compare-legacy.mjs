// Compare the 2026-27 flowchart transcriptions with the old app's hand-typed default plans and course credits.
//   node tools/flowcharts/compare-legacy.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';

const require = createRequire(import.meta.url);
const TERMS = ['year1-fall', 'year1-spring', 'year2-fall', 'year2-spring', 'year3-fall', 'year3-spring', 'year4-fall', 'year4-spring'];
const isCourseId = id => /^[A-Z]{2,5}\d{4}[A-Z]?$/.test(id);

export function compare() {
  const { loadLegacyEE } = require('../../tests/helpers/legacy.js');
  const ee = loadLegacyEE();
  const catalog = ee.constants('LSU_CATALOG');
  const placeholders = ee.constants('PLACEHOLDERS');
  const legacyPlans = { 'EE-BSEE': ee.constants('PLAN_EE_DEFAULT'), 'BE-BSBE': ee.constants('PLAN_BE_DEFAULT') };
  const report = {};
  for (const fc of buildAll().filter(f => legacyPlans[f.program])) {
    const legacy = Object.fromEntries(legacyPlans[fc.program].filter(([k]) => k !== 'completed'));
    const semesters = [];
    fc.semesters.forEach((sem, i) => {
      const chartCourses = new Set(sem.items.filter(x => x.course).map(x => x.course));
      const legacyCourses = new Set((legacy[TERMS[i]] || []).filter(id => isCourseId(id)));
      // BE chart lists "MATH 2065 or MATH 2090" and "AGEC 2003 or ECON ..." as one box; the legacy plan uses the first id
      const legacyCredits = (legacy[TERMS[i]] || []).reduce((t, id) => t + ((catalog[id] || placeholders[id] || {}).cr ?? 3), 0);
      const onlyChart = [...chartCourses].filter(c => !legacyCourses.has(c)).sort();
      const onlyLegacy = [...legacyCourses].filter(c => !chartCourses.has(c)).sort();
      semesters.push({ n: i + 1, chartHours: sem.hours, legacyHours: legacyCredits, onlyChart, onlyLegacy });
    });
    const credits = [];
    for (const sem of fc.semesters) for (const it of sem.items) {
      if (!it.course) continue;
      const leg = catalog[it.course];
      if (leg && leg.cr !== it.credits) credits.push({ course: it.course, chart: it.credits, legacy: leg.cr });
    }
    const offered = [];
    for (const sem of fc.semesters) for (const it of sem.items) {
      if (!it.course || !it.offered) continue;
      const leg = catalog[it.course];
      if (leg && !(leg.sem.length === 1 && leg.sem[0] === it.offered)) offered.push({ course: it.course, chart: it.offered, legacy: leg.sem.join('/') });
    }
    report[fc.program] = { semesters, credits, offered };
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [prog, r] of Object.entries(compare())) {
    console.log(`\n== ${prog}`);
    for (const s of r.semesters) {
      const bits = [];
      if (s.chartHours !== s.legacyHours) bits.push(`hours chart ${s.chartHours} vs legacy ${s.legacyHours}`);
      if (s.onlyChart.length) bits.push(`chart only: ${s.onlyChart.join(', ')}`);
      if (s.onlyLegacy.length) bits.push(`legacy only: ${s.onlyLegacy.join(', ')}`);
      console.log(`  semester ${s.n}: ${bits.length ? bits.join(' | ') : 'same courses'}`);
    }
    console.log(`  credit differences: ${r.credits.length ? JSON.stringify(r.credits) : 'none'}`);
    console.log(`  offering differences (chart F/S-only flags vs legacy): ${r.offered.length ? JSON.stringify(r.offered) : 'none'}`);
  }
}
