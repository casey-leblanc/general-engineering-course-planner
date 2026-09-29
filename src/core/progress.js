// A student's own progress (completed and in-progress courses, AP / transfer credit) turned into planner state, so a plan can show
// what is done and arrange only what is left. Progress comes from a local file the student prepares (for example from their Workday
// academic progress report and transcript); it is personal, so it is never part of the repository and this module is data-agnostic.
//
//   progress = {
//     courses: [ { id:'BIOL1201', term:'year1-fall', status:'completed'|'in-progress', grade?, note?, grant?:'AP'|'transfer'|'placement',
//                  credits?, title? } ],   term 'completed' = AP / transfer credit (no semester); credits/title override the course data
//     unapplied: [ { code, title, credits, source } ]   credit on the transcript that no requirement uses (shown, not planned)
//     extraCourses: [ { id, title, credits, attrs?:['gen-ed:art'], evidence } ]   courses the LSU dataset does not have
//     calendar: { year1Fall: 2025 }  which calendar year "year 1 fall" is (for showing real semester names)
//   }
import { COMPLETED, defaultTerms, sortTerms } from './terms.js';

const split = id => { const m = /^([A-Z]{2,5})(\d{4}[A-Z]?)$/.exec(id); return m ? { subject: m[1], number: m[2] } : null; };

/** Course records and overlay entries for courses that are on the student's record but not in the dataset. */
export function extraRecords(progress, catalogYear) {
  const courses = [], overlay = {};
  for (const x of progress.extraCourses || []) {
    const s = split(x.id);
    if (!s) throw new Error(`extra course ${x.id} is not a course code`);
    courses.push({
      id: x.id, subject: s.subject, number: s.number, title: x.title, credits: { fixed: x.credits }, parse: 'unknown', attrs: [`level:${Math.floor(Number(s.number) / 1000) * 1000}`],
      source: { catalogYear, origin: 'workday', verified: false, evidence: x.evidence || 'listed on the student\'s own academic record; prerequisites not obtained' },
    });
    if (x.attrs && x.attrs.length) overlay[x.id] = { attrs: x.attrs, attrsEvidence: Object.fromEntries(x.attrs.map(a => [a, x.evidence || 'counted for this requirement area on the student\'s own academic progress report'])) };
  }
  return { courses, overlay };
}

/** Put the student's courses into a state: done + placed at the term taken, AP / transfer in the completed bucket with its credit source. */
export function applyProgress(state, progress) {
  for (const c of progress.courses) {
    state.done[c.id] = c.term;
    if (c.term === COMPLETED) state.grants[c.id] = c.grant || 'AP';
    else state.placed[c.id] = c.term;
    // what the record says overrides the catalog data for THIS student: credit hours actually awarded, the title on the transcript
    const meta = { ...(state.meta[c.id] || {}) };
    if (c.note) meta.note = c.note;
    if (c.credits !== undefined) meta.cr = c.credits;
    if (c.title) meta.title = c.title;
    if (Object.keys(meta).length) state.meta[c.id] = meta;
    if (c.term !== COMPLETED && !state.terms.includes(c.term)) state.terms.push(c.term);
  }
  state.terms = sortTerms(state.terms);
  return state;
}

/** { id: term } of everything the student has finished or is taking. */
export const doneMap = progress => Object.fromEntries(progress.courses.map(c => [c.id, c.term]));

/**
 * Terms to show: everything up to the last term with completed work, then the fewest fall/spring semesters that fit the credits
 * still to do (at most `perTerm` each).
 */
export function termsAfter(progress, remainingCredits, perTerm = 18) {
  const semester = key => { const m = /^year(\d+)-(fall|spring|summer)$/.exec(key); return m ? 2 * (Number(m[1]) - 1) + (m[2] === 'fall' ? 1 : 2) : 0; };
  const lastSem = Math.max(0, ...progress.courses.filter(c => c.term !== COMPLETED).map(c => semester(c.term)));
  const total = Math.max(8, lastSem + Math.ceil(remainingCredits / perTerm));
  return defaultTerms(Math.ceil(total / 2)).slice(0, total + 1);   // +1: the completed bucket comes first
}

/** "Fall 2026" for year2-fall when year 1 fall was fall 2025. */
export function realTermLabel(key, calendar) {
  const m = /^year(\d+)-(fall|spring|summer)$/.exec(key);
  if (!m || !calendar) return null;
  const y = Number(m[1]);
  const year = m[2] === 'fall' ? calendar.year1Fall + y - 1 : calendar.year1Fall + y;
  return `${m[2][0].toUpperCase()}${m[2].slice(1)} ${year}`;
}
