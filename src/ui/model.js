// Everything the screen needs, worked out from the state and the data in one place (pure: no DOM).
import { auditAll } from '../core/requirements.js';
import { createRuleset } from '../core/rules.js';
import { checkPlan } from '../core/prereq.js';
import { describeTile } from '../core/tiles.js';
import { studentOf, rulesOf, planOf, tilesIn, creditTotals } from '../core/state.js';
import { termSeason, termLabel, COMPLETED } from '../core/terms.js';

export const CAP = { term: 18, summer: 6 };
const PALETTE = ['#5b21b6', '#15803d', '#b45309', '#0e7490', '#be185d', '#4338ca', '#a16207', '#0f766e'];

const short = (id, all) => {
  const prefix = id.split('-')[0];
  return all.filter(x => x.split('-')[0] === prefix).length > 1 ? id : prefix;
};

export function derive(state, dataset, { recommendedCredits = 0 } = {}) {
  const student = studentOf(state, dataset);
  const rules = rulesOf(state, dataset);
  const plan = planOf(state);
  const audit = auditAll({ dataset, plan, student, rules, assignments: state.assign });
  const ruleset = createRuleset(rules, student, { countedFor: c => audit.countedFor.get(c) || new Set() });
  const checks = checkPlan({ dataset, ruleset, plan, student });

  const tiles = new Map();
  const tile = id => { if (!tiles.has(id)) tiles.set(id, describeTile(id, { dataset, state })); return tiles.get(id); };
  const sortKey = id => { const t = tile(id); return `${t.code} ${t.title}`.toLowerCase(); };
  const columns = state.terms.map(key => ({ key, tiles: tilesIn(state, key).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0)) }));

  const programs = audit.programs.map((a, i) => {
    const p = dataset.program(a.program);
    return { id: a.program, program: p, audit: a, color: PALETTE[i % PALETTE.length], label: short(a.program, audit.programs.map(x => x.program)) };
  });
  const byProgram = Object.fromEntries(programs.map(p => [p.id, p]));

  // which programs a tile counts toward, and through what
  const counts = new Map();
  for (const p of programs) for (const d of p.audit.demands) {
    const id = d.course || d.tile;
    if (!id) continue;
    if (!counts.has(id)) counts.set(id, []);
    counts.get(id).push({ program: p.id, demand: d });
  }

  const totals = creditTotals(state, id => tile(id).credits);
  const largest = Math.max(0, ...programs.map(p => p.program.totalCredits || 0));
  const target = Math.max(recommendedCredits, largest, totals.total);

  return { student, rules, ruleset, audit, checks, tile, columns, programs, byProgram, counts, totals, target, issues: issues(state, dataset, columns, checks, audit, tile) };
}

const seasonWord = k => ({ F: 'Fall', S: 'Spring', Su: 'Summer' }[termSeason(k)] || '');

function issues(state, dataset, columns, checks, audit, tile) {
  const out = [];
  const unknown = [];
  for (const col of columns) {
    for (const id of col.tiles) {
      const c = checks[id];
      if (!c) continue;
      const done = state.done[id] !== undefined;
      if (!c.ok && !done) {
        const why = [];
        if (!c.pre) why.push(`prerequisite not completed earlier${c.unmet.length ? ` (${c.unmet.join('; ')})` : ''}`);
        if (!c.co) why.push('corequisite must be taken before or together');
        if (!c.sem) why.push(`not offered in ${seasonWord(col.key).toLowerCase()}`);
        for (const e of c.enrollment) if (e.effect === 'block') why.push('enrollment restricted for your program');
        out.push({ type: 'err', id, key: col.key, title: `${tile(id).code} — ${tile(id).title}`, where: termLabel(col.key), msg: why.join('; ') });
      }
      if (!done) for (const e of c.enrollment) if (e.effect === 'warn') out.push({ type: 'warn', id, key: col.key, title: `${tile(id).code} — ${tile(id).title}`, where: termLabel(col.key), msg: e.note || 'enrollment may be restricted', rule: e.ruleId });
      if (c.unknown && !done) unknown.push(tile(id).code);
    }
    if (col.key !== COMPLETED) {
      const cap = termSeason(col.key) === 'Su' ? CAP.summer : CAP.term;
      const cr = col.tiles.reduce((t, id) => t + tile(id).credits, 0);
      const allDone = col.tiles.length > 0 && col.tiles.every(id => state.done[id] !== undefined);
      if (cr > cap && !allDone) out.push({ type: 'err', key: col.key, title: termLabel(col.key), where: termLabel(col.key), msg: `${cr} credits is above the recommended ${cap}-credit maximum` });
    }
  }
  if (unknown.length) out.push({ type: 'warn', key: null, title: 'Requisites not checked', where: `${unknown.length} course${unknown.length > 1 ? 's' : ''}`, msg: `${unknown.join(', ')}: the prerequisite data has not been obtained or needs review, so nothing is checked for these` });
  const seen = new Set();
  for (const p of audit.programs) for (const a of p.advisories) {
    if (seen.has(a.ruleId)) continue;
    seen.add(a.ruleId);
    out.push({ type: 'info', key: null, title: 'Advisor note', where: dataset.program(p.program).name, msg: a.message, rule: a.ruleId });
  }
  return out;
}


