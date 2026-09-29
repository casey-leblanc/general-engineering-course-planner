// Recommended plans for one or several programs, with the advisor rules applied.
//
//   recommend({ dataset, student, tracks }) -> { placed, assign, terms, dropped[], credits }
//
// 1. Merge: take each program's recommended plan (or the plan of the chosen track) and put every course in its EARLIEST term.
// 2. Reduce: a double major lists some requirements twice. Try dropping each tile / course in turn; keep the drop only when the
//    audit still finds every requirement filled (by a rule, another program's course, or another program's placeholder) and
//    no course has a new prerequisite problem. The reason for each drop is reported, so it is never silent.
// The result is only a starting arrangement; the solver (auto-arrange) balances the terms.
import { createRuleset } from './rules.js';
import { auditAll, demandInfo } from './requirements.js';
import { checkPlan } from './prereq.js';
import { termPos, termsForCredits } from './terms.js';

/** The plan of a program for a chosen track: { plan: [[term, ids]], assign, tags, track } */
export function programPlan(program, trackId) {
  const tracks = program.tracks || [];
  const track = tracks.find(t => t.id === trackId) || tracks.find(t => t.default) || tracks[0];
  if (track) return { plan: track.recommendedPlan || program.recommendedPlan || [], assign: track.assign || {}, tags: track.tags || {}, labels: track.labels || {}, track: track.id };
  return { plan: program.recommendedPlan || [], assign: {}, tags: {}, labels: {}, track: null };
}

/** Union of the plans; a tile or course shared by several programs sits in its earliest term. */
export function mergeRecommended(programs, tracks = {}) {
  const placed = {}, assign = {}, owners = {};
  programs.forEach((program, rank) => {
    const { plan, assign: a } = programPlan(program, tracks[program.id]);
    for (const [term, ids] of plan) for (const id of ids) {
      if (!(id in placed) || termPos(term) < termPos(placed[id])) placed[id] = term;
      owners[id] = Math.min(owners[id] ?? Infinity, rank);
    }
    Object.assign(assign, a);
  });
  return { placed, assign, owners };
}

export function planCredits(placed, dataset) {
  let total = 0;
  for (const id of Object.keys(placed)) {
    if (id.includes('/')) { const info = demandInfo(dataset, id); total += info ? info.credits : 3; }
    else total += dataset.credits(id, 3);
  }
  return total;
}

const keyOf = (program, id) => `${program}:${id}`;

/** { missing: Set, failing: Set, audit } for a plan: the two things a drop must not make worse. */
function evaluate(dataset, student, placed, assign, done = {}) {
  const plan = { placed, done };
  const audit = auditAll({ dataset, plan, student, assignments: assign });
  const missing = new Set();
  for (const p of audit.programs) for (const d of p.demands) if (d.status === 'missing') missing.add(keyOf(p.program, d.id));
  const ruleset = createRuleset(dataset.rules, student, { countedFor: c => audit.countedFor.get(c) || new Set() });
  const failing = new Set();
  const checks = checkPlan({ dataset, ruleset, plan, student });
  for (const [id, r] of Object.entries(checks)) if (!r.ok) failing.add(id);
  return { missing, failing, audit };
}

const subset = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };

/**
 * `done` = courses the student has already completed or is taking ({ id: term }); they are never dropped, they are not checked for
 * prerequisites, and they are what makes other tiles redundant.
 */
export function reducePlan({ dataset, student, placed, assign = {}, owners = {}, done = {} }) {
  const kept = { ...placed };
  let base = evaluate(dataset, student, kept, assign, done);
  const dropped = [];
  // lowest-priority program's items first (ties: later term first, tiles before courses) so the primary program keeps its own tiles
  const orderNow = () => Object.keys(kept).filter(id => !(id in done)).sort((a, b) =>
    (owners[b] ?? 0) - (owners[a] ?? 0)
    || termPos(kept[b]) - termPos(kept[a])
    || (b.includes('/') ? 1 : 0) - (a.includes('/') ? 1 : 0)
    || a.localeCompare(b));
  const tryDrops = order => {
    for (const id of order) {
      const term = kept[id];
      delete kept[id];
      const next = evaluate(dataset, student, kept, assign, done);
      if (subset(next.missing, base.missing) && subset(next.failing, base.failing)) {
        // what now stands in for it: the requirement it was filling for its own program (a tile: its own slot; a course: the
        // requirement that names it), else any requirement it was filling
        const candidates = [];
        for (const p of next.audit.programs) for (const d of p.demands) {
          const was = base.audit.byProgram[p.program].demands.find(x => x.id === d.id);
          if (was && (was.course === id || was.tile === id) && d.status !== 'missing') {
            const own = d.id === id || (d.courses || []).includes(id);
            candidates.push({ own, reason: { program: p.program, requirement: d.id, by: d.course || d.tile || null, via: d.via } });
          }
        }
        const pick = candidates.find(c => c.own) || candidates[0];
        dropped.push({ id, term, reason: pick ? pick.reason : null });
        base = next;
      } else {
        kept[id] = term;
      }
    }
  };
  // A drop can make an earlier candidate droppable (MATH 2090 only counts for MATH 2070 once it stops being shadowed by MATH 2065),
  // so repeat until a whole pass drops nothing.
  for (let pass = 0; pass < 6; pass++) {
    const before = dropped.length;
    tryDrops(orderNow());
    if (dropped.length === before) break;
  }
  // The matching can move between steps, so report who fills each requirement in the FINAL plan, not at the moment of the drop.
  for (const d of dropped) {
    if (!d.reason) continue;
    const now = base.audit.byProgram[d.reason.program].demands.find(x => x.id === d.reason.requirement);
    d.reason = now && now.status !== 'missing' ? { program: d.reason.program, requirement: now.id, by: now.course || now.tile || null, via: now.via } : null;
  }
  return { placed: kept, dropped };
}

/**
 * Recommended plan for a student's programs (majors in priority order, then minors). With `done` (courses already completed or in
 * progress, { id: term }) the plan is what is LEFT: every tile or course that a completed course already satisfies is dropped,
 * and the completed courses stay where they were taken.
 */
export function recommend({ dataset, student, tracks = {}, done = {} }) {
  const programs = [...(student.majors || []), ...(student.minors || [])].map(id => dataset.program(id)).filter(Boolean);
  const merged = mergeRecommended(programs, tracks);
  for (const [id, term] of Object.entries(done)) { merged.placed[id] = term; merged.owners[id] = 0; }
  const reduced = programs.length > 1 || Object.keys(done).length
    ? reducePlan({ dataset, student, placed: merged.placed, assign: merged.assign, owners: merged.owners, done })
    : { placed: merged.placed, dropped: [] };
  const credits = planCredits(reduced.placed, dataset);
  return { placed: reduced.placed, assign: merged.assign, dropped: reduced.dropped, credits, terms: termsForCredits(credits) };
}
