// Builds the input of the auto-arrange solver (planner.js, a MILP solved with HiGHS) from the student's plan and program data.
//
// Everything program- or course-specific comes from data, so a new program needs no change here:
//   * prerequisites / corequisites            course records (expression trees) + advisor equivalences
//   * offering terms, summer session          overlay `offered`
//   * difficulty                              overlay `difficulty`
//   * back-to-back pairs (senior design I/II) program `sequences`
//   * design / gen-ed / elective slots        requirement node `hints`
//   * "stay near the recommended plan"        the merged recommended plan of the selected programs (`anchor`)
//   * pre-med timing                          track `tags`
import { termPos, termSeason, COMPLETED } from './terms.js';
import { describeTile } from './tiles.js';

const DIFF_FACTOR = { normal: 1, hard: 1.5, hardest: 2 };
const SENIOR_DESIGN_LOAD = [2, 3];               // Design I counts as 2x its credits, Design II as 3x (keeps the senior year lighter)
const LIGHT_LOAD = 0.9;                          // gen-eds and free electives are a little lighter than STEM at the same credits
const SUMMER_SCHEDULABLE = { MA: 1, MJ: 1, JA: 1, BOTH: 1 };
const PREMED_AFTER = termPos('year3-fall');

export const SOLVER = {
  fsMin: 12, fsMax: 18, suMax: 6, desMinCredits: 60,
  weights: { band: 1e7, even: 1e3, flat: 20, pmLate: 2e3, desExtra: 2e3, coSep: 1.5e3, anchor: 300, anchorPair: 1500 },
};

/**
 * Turn a requisite expression into what the solver understands: strictly-earlier courses (pre), same-or-earlier courses (co),
 * and whether the corequisites are "any one of". Alternatives collapse to the one the student is already planning (or an
 * advisor-equivalent course), else the first listed. Standing, credit and consent conditions are not solver constraints.
 */
export function flattenRequisites(prereq, coreq, { has, equivalents }) {
  const pick = id => {
    if (has(id)) return id;
    const eq = equivalents(id).find(e => has(e.course));
    return eq ? eq.course : id;
  };
  const collect = (expr, into, asCo) => {
    if (!expr) return;
    if (expr.course) {
      const sameTermOk = asCo || expr.concurrent === 'ok' || expr.concurrent === 'required';
      (sameTermOk ? into.co : into.pre).push(expr.course);
    } else if (expr.all) {
      expr.all.forEach(x => collect(x, into, asCo));
    } else if (expr.any) {
      const ids = [];
      const inner = { pre: [], co: [] };
      expr.any.forEach(x => collect(x, inner, asCo));
      ids.push(...inner.pre.map(id => ({ id, co: false })), ...inner.co.map(id => ({ id, co: true })));
      if (!ids.length) return;
      const chosen = ids.find(x => has(x.id)) || ids.map(x => ({ ...x, id: pick(x.id) })).find(x => has(x.id)) || ids[0];
      (chosen.co ? into.co : into.pre).push(chosen.id);
    }
  };
  const out = { pre: [], co: [], coAny: false };
  collect(prereq, out, false);
  if (coreq && coreq.any && coreq.any.every(x => x.course)) {
    const members = coreq.any.map(x => x.course);
    out.co.push(...members);
    out.coAny = true;
    // "any one of" members that are not in the plan cannot help; keep the ones that are, unless none is
    const present = members.map(pick).filter(has);
    if (present.length) out.co = out.co.filter(id => !members.includes(id)).concat(present);
  } else {
    collect(coreq, out, true);
  }
  out.pre = out.pre.map(pick);
  out.co = out.co.map(pick);
  return out;
}

/**
 * Does the solver leave this tile unanchored (free to sit wherever the load balances best)? Only things with no meaningful position:
 * gen-ed and free-elective slots, custom courses, and the few courses the course data flags \`float\` (English composition, the
 * economics course). Every required course keeps its recommended place in the sequence, and so does a slot that can only become
 * upper-level work (breadth, design and technical electives are junior/senior courses).
 */
function makeFloats(dataset) {
  const late = new Map();
  const isLate = info => {
    if (!late.has(info.nodeId)) {
      const w = info.pools.length ? dataset.courses.filter(c => info.pools.some(p => dataset.matchesPool(c.id, p))).map(c => Number(c.number)) : [];
      late.set(info.nodeId, info.hints.includes('upper') || (w.length > 0 && Math.min(...w) >= 3000));
    }
    return late.get(info.nodeId);
  };
  return (t, req, overlay) => {
    if (t.type === 'slot') return !isLate(t.info);
    if (t.type !== 'course') return true;
    return overlay.float === true;
  };
}

/**
 * @param dataset   createDataset(...)
 * @param ruleset   createRuleset(...) for this student (advisor equivalences shape the requisites)
 * @param state     { terms, placed, done, meta, custom }
 * @param sequences [{a, b, gap}] from the selected programs
 * @param anchor    { tileId: termKey } recommended arrangement to stay close to
 * @param tags      { premed: [ids], 'premed-late-half': [ids] } from the selected tracks
 */
export function buildScenario({ dataset, ruleset, state, sequences = [], anchor = {}, tags = {}, closed = [] }) {
  const closedTerms = new Set(closed);   // terms nothing new may be placed in (already over, or being taken right now)
  const done = state.done || {};
  const placed = state.placed || {};
  const sorted = [...state.terms].sort((a, b) => termPos(a) - termPos(b));
  const rankOf = Object.fromEntries(sorted.map((k, i) => [k, i]));
  const has = id => placed[id] !== undefined || done[id] !== undefined;
  const premed = new Set(tags.premed || []);
  const premedHalf = new Set(tags['premed-late-half'] || []);
  const seqRole = {};
  sequences.forEach(s => { seqRole[s.a] = 0; seqRole[s.b] = 1; });

  const floats = makeFloats(dataset);
  const movable = [], movCnt = {};
  for (const id of Object.keys(placed)) {
    if (done[id] !== undefined) continue;
    const t = describeTile(id, { dataset, state });
    const off = t.type === 'course' ? dataset.offered(id) : null;
    const summer = off && SUMMER_SCHEDULABLE[off.summer] ? off.summer : null;
    let seasons = off ? off.terms.slice() : ['F', 'S'];
    if (!summer) seasons = seasons.filter(s => s !== 'Su');
    if (!seasons.length) seasons = ['F', 'S'];

    let req = { pre: [], co: [], coAny: false };
    if (t.record) req = flattenRequisites(t.record.prereq, t.record.coreq, { has, equivalents: c => ruleset.equivalents(c) });
    const overlay = dataset.overlay[id] || {};
    const isSenior = t.attrs.includes('senior-design');
    const isDesign = t.hints.includes('design') || t.attrs.includes('design') || isSenior;
    const isGenEd = t.hints.includes('gen-ed') || t.attrs.some(a => a === 'gen-ed' || a.startsWith('gen-ed:'));
    const light = t.hints.includes('gen-ed') || t.hints.includes('elective') || overlay.light === true;
    const factor = id in seqRole && isSenior ? SENIOR_DESIGN_LOAD[seqRole[id]] : (light ? LIGHT_LOAD : (DIFF_FACTOR[t.difficulty] || 1));
    movable.push({
      id, cr: t.credits, eff: t.credits * factor, seasons, summer, isDesign, isHum: isGenEd,
      pmw: premed.has(id) ? (premedHalf.has(id) ? 0.5 : 1) : 0,
      pre: req.pre, co: req.co, coAny: req.coAny,
      float: floats(t, req, overlay),
    });
    movCnt[placed[id]] = (movCnt[placed[id]] || 0) + 1;
  }

  let apCredits = 0;
  const doneCnt = {}, fixedCr = {}, fixedEff = {}, fixedRank = {}, fixedTP = {};
  for (const id of Object.keys(done)) {
    const k = done[id];
    const t = describeTile(id, { dataset, state });
    if (k === COMPLETED) apCredits += t.credits;
    if (rankOf[k] !== undefined) { fixedRank[id] = rankOf[k]; fixedTP[id] = termPos(k); }
    if (k === COMPLETED) continue;
    doneCnt[k] = (doneCnt[k] || 0) + 1;
    fixedCr[k] = (fixedCr[k] || 0) + t.credits;
    fixedEff[k] = (fixedEff[k] || 0) + t.credits * (DIFF_FACTOR[t.difficulty] || 1);
  }

  const terms = sorted.map(k => ({
    key: k, rank: rankOf[k], season: termSeason(k), tp: termPos(k),
    open: k !== COMPLETED && termPos(k) >= 0 && !closedTerms.has(k) && !((doneCnt[k] || 0) > 0 && (movCnt[k] || 0) === 0),
  }));

  const defTerm = {}, defTP = {};
  for (const c of movable) {
    const dk = anchor[c.id] !== undefined ? anchor[c.id] : null;
    defTerm[c.id] = dk;
    defTP[c.id] = dk != null && !c.float ? termPos(dk) : null;
  }
  const pairs = sequences.filter(s => has(s.a) && has(s.b)).map(s => ({ a: s.a, b: s.b, gap: s.gap }));

  return {
    terms, movable, fixedRank, fixedTP, fixedCr, fixedEff, defTerm, defTP, pairs, apCredits,
    desMinCredits: SOLVER.desMinCredits,
    pmAfterTP: PREMED_AFTER,
    caps: { fsMin: SOLVER.fsMin, fsMax: SOLVER.fsMax, suMax: SOLVER.suMax },
    weights: { ...SOLVER.weights },
  };
}
