// Prerequisite, corequisite, offering-term and enrollment checks for one placed course.
//
//   plan    = { placed: { id: termKey }, done: { id: termKey } }   (done wins; 'completed' = AP / transfer bucket)
//   checkCourse(id, { dataset, ruleset, plan, student }) -> { pre, co, sem, ok, unknown, unmet[], via[], enrollment[], notes[] }
//
// Semantics carried over from the old app (and locked by the golden fixtures): a prerequisite must sit in a STRICTLY earlier
// term; a corequisite may sit in the same or an earlier term; a completed-bucket course satisfies everything; a course in
// the completed bucket is never flagged. New: prerequisite text the data could not interpret is reported as `unknown` and
// never treated as "no prerequisite"; advisor equivalences and waivers are honoured and reported in `via`.
import { COMPLETED, termPos, termSeason } from './terms.js';

const STANDING_MIN = { freshman: 0, sophomore: 30, junior: 60, senior: 90 };

export function createPlanView(plan) {
  const at = id => (plan.done && plan.done[id] !== undefined ? plan.done[id] : plan.placed ? plan.placed[id] : undefined);
  return {
    at,
    pos: id => { const t = at(id); return t === undefined ? undefined : termPos(t); },
    ids: () => [...new Set([...Object.keys(plan.placed || {}), ...Object.keys(plan.done || {})])],
  };
}

export function checkCourse(id, { dataset, ruleset, plan, student = {} }) {
  const view = createPlanView(plan);
  const here = view.at(id);
  const result = { pre: true, co: true, sem: true, ok: true, unknown: false, unmet: [], via: [], enrollment: [], notes: [] };
  if (here === undefined || here === COMPLETED) return result;

  const rec = dataset.course(id);
  if (!rec) { result.unknown = true; result.notes.push('no course record'); return result; }
  const myPos = termPos(here);
  const via = new Set();

  const creditsBefore = () => view.ids().reduce((t, cid) => { const p = view.pos(cid); return p !== undefined && p < myPos ? t + dataset.credits(cid, 0) : t; }, 0);

  /** is a course (or an advisor-equivalent) placed early enough? */
  function courseSatisfied(courseId, allowSame) {
    const candidates = [{ course: courseId }, ...ruleset.equivalents(courseId).map(e => ({ course: e.course, rule: e.rule }))];
    for (const c of candidates) {
      const p = view.pos(c.course);
      if (p !== undefined && (allowSame ? p <= myPos : p < myPos)) { if (c.rule) via.add(c.rule.id); return true; }
    }
    return false;
  }

  /** -> 'ok' | 'unmet' | 'unknown'; collects unmet leaf descriptions */
  function evalExpr(expr, allowSame, unmet) {
    if (expr.course) {
      if (ruleset.waivedPrereq(id, expr.course)) { via.add(ruleset.waivedPrereq(id, expr.course).id); return 'ok'; }
      const same = allowSame || expr.concurrent === 'ok' || expr.concurrent === 'required';
      if (courseSatisfied(expr.course, same)) return 'ok';
      unmet.push(expr.course);
      return 'unmet';
    }
    if (expr.standing) {
      if (creditsBefore() >= STANDING_MIN[expr.standing]) return 'ok';
      unmet.push(`${expr.standing} standing`);
      return 'unmet';
    }
    if (expr.credits) {
      if (creditsBefore() >= expr.credits) return 'ok';
      unmet.push(`${expr.credits} credit hours`);
      return 'unmet';
    }
    if (expr.consent) { unmet.push(`consent of ${expr.consent}`); return 'unmet'; }
    if (expr.unparsed) return 'unknown';

    const kids = expr.all || expr.any;
    const sub = [];
    const statuses = kids.map(k => { const u = []; const s = evalExpr(k, allowSame, u); sub.push(u); return s; });
    let status;
    if (expr.all) status = statuses.includes('unmet') ? 'unmet' : statuses.includes('unknown') ? 'unknown' : 'ok';
    else status = statuses.includes('ok') ? 'ok' : statuses.includes('unknown') ? 'unknown' : 'unmet';
    if (status === 'unmet') {
      if (expr.all) sub.forEach((u, i) => { if (statuses[i] === 'unmet') unmet.push(...u); });
      else unmet.push(sub.map(u => u.join(' + ')).filter(Boolean).join(' or '));
      if (expr.waiver) unmet.push(`or ${expr.waiver}`);
    }
    return status;
  }

  const partStatus = (expr, allowSame) => {
    if (!expr) return 'ok';
    const unmet = [];
    const s = evalExpr(expr, allowSame, unmet);
    result.unmet.push(...unmet);
    return s;
  };
  const pre = partStatus(rec.prereq, false);
  const co = partStatus(rec.coreq, true);
  result.pre = pre !== 'unmet';
  result.co = co !== 'unmet';
  if (pre === 'unknown' || co === 'unknown' || rec.parse === 'unknown' || rec.parse === 'manual') {
    result.unknown = true;
    if (rec.parse === 'unknown') result.notes.push('requisites not obtained yet; they are not being checked');
    else result.notes.push('requisite text needs review; it is not being checked');
  }

  const offered = dataset.offered(id);
  result.sem = !offered || offered.terms.includes(termSeason(here));
  if (!offered) result.notes.push('offering terms unknown');

  result.enrollment = ruleset.enrollmentIssues(id).map(i => ({ ruleId: i.rule.id, effect: i.effect, note: i.rule.note }));
  result.via = [...via];
  result.ok = result.pre && result.co && result.sem && !result.enrollment.some(e => e.effect === 'block');
  return result;
}

/** Check every placed course; returns { [id]: result }. */
export function checkPlan(ctx) {
  const view = createPlanView(ctx.plan);
  const out = {};
  for (const id of view.ids()) if (ctx.dataset.has(id)) out[id] = checkCourse(id, ctx);
  return out;
}
