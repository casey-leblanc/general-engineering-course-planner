// Term keys: 'completed' (AP / transfer bucket) or 'year<N>-<fall|spring|summer>'. One copy of the term math.
export const COMPLETED = 'completed';

const SEASON_OFF = { fall: 0, spring: 1, summer: 2 };
const SEASON_CODE = { fall: 'F', spring: 'S', summer: 'Su' };
const SEASON_NAME = { F: 'fall', S: 'spring', Su: 'summer' };
const RE = /^year(\d+)-(fall|spring|summer)$/;

export const isTermKey = k => k === COMPLETED || RE.test(String(k));

/** Order of a term: completed = -1, otherwise year*3 + season; Infinity for anything that is not a term key. */
export function termPos(k) {
  if (k === COMPLETED) return -1;
  const m = RE.exec(String(k));
  return m ? parseInt(m[1], 10) * 3 + SEASON_OFF[m[2]] : Infinity;
}

/** 'F' | 'S' | 'Su', or '' for the completed bucket and invalid keys. */
export function termSeason(k) {
  const m = /-(fall|spring|summer)$/.exec(String(k));
  return m ? SEASON_CODE[m[1]] : '';
}

export function termLabel(k) {
  if (k === COMPLETED) return 'AP / Transfer Credit';
  const m = RE.exec(String(k));
  return m ? `Year ${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1)}` : String(k);
}

export const termKey = (year, seasonCode) => `year${year}-${SEASON_NAME[seasonCode]}`;

export function sortTerms(keys) {
  return [...keys].sort((a, b) => termPos(a) - termPos(b));
}

/** The completed bucket plus fall and spring of each year. */
export function defaultTerms(years = 4) {
  const out = [COMPLETED];
  for (let y = 1; y <= years; y++) out.push(termKey(y, 'F'), termKey(y, 'S'));
  return out;
}

/** Every term key the planner can show: the completed bucket plus fall, spring and summer of years 1..maxYear. */
export function allTerms(maxYear = 6) {
  const out = [COMPLETED];
  for (let y = 1; y <= maxYear; y++) for (const s of ['F', 'S', 'Su']) out.push(termKey(y, s));
  return out;
}

const FIXED = new Set(defaultTerms(4));
/** Years 1-4 fall and spring are always shown. */
export const isFixedTerm = k => FIXED.has(k);

/** The term that has to exist before this one can be added: spring follows fall, summer follows spring, fall follows last spring. */
export function termPredecessor(k) {
  const m = RE.exec(String(k));
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] === 'spring') return `year${y}-fall`;
  if (m[2] === 'summer') return `year${y}-spring`;
  return y <= 1 ? null : `year${y - 1}-spring`;
}

export function canAddTerm(terms, k) {
  if (k === COMPLETED || terms.includes(k) || !isTermKey(k)) return false;
  const p = termPredecessor(k);
  return p === null ? true : terms.includes(p);
}

/** A term can be removed unless it is one of the fixed eight or another present term builds on it. */
export function canRemoveTerm(terms, k) {
  if (k === COMPLETED || isFixedTerm(k)) return false;
  return !terms.some(t => termPredecessor(t) === k);
}

/** Terms to show for a plan of `credits` credit hours: the fewest fall/spring semesters that fit at `perTerm` credits each, at least eight. */
export function termsForCredits(credits, perTerm = 18) {
  const semesters = Math.max(8, Math.ceil(credits / perTerm));
  return defaultTerms(Math.ceil(semesters / 2)).slice(0, semesters + 1);   // +1: the completed bucket comes first
}
