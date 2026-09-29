// Read-only view over the JSON data: course records + overlay + programs + rule packs.
// Pool matching (used by requirements and rules) lives here so there is exactly one definition of "this course fits".

// Ids that are not course codes (a custom course, a course the data does not know) get an empty subject and level -1, so they can
// only match a pool that names them or accepts any course.
const numberOf = id => { const m = /\d{4}/.exec(id); return m ? parseInt(m[0], 10) : -1; };
const subjectOf = id => { const m = /^[A-Z]+/.exec(id); return m ? m[0] : ''; };

/** Attribute match with hierarchy: a pool attribute "gen-ed" matches a course attribute "gen-ed" or "gen-ed:humanities". */
const hasAttr = (attrs, wanted) => { for (const a of attrs) if (a === wanted || a.startsWith(wanted + ':')) return true; return false; };

export function createDataset({ courses, overlay = {}, programs = [], rulePacks = [] }) {
  const byId = new Map(courses.map(c => [c.id, c]));
  const programById = new Map(programs.map(p => [p.id, p]));
  const attrCache = new Map();

  const ds = {
    courses, programs, overlay,
    rules: rulePacks.flatMap(pack => pack.rules.map(r => ({ ...r, catalogYear: pack.catalogYear }))),
    course: id => byId.get(id) || null,
    has: id => byId.has(id),
    program: id => programById.get(id) || null,
    subject: subjectOf,
    number: numberOf,
    credits(id, fallback = 3) {
      const c = byId.get(id);
      if (!c) return fallback;
      return 'fixed' in c.credits ? c.credits.fixed : c.credits.max;
    },
    attrs(id) {
      if (!attrCache.has(id)) {
        const c = byId.get(id);
        attrCache.set(id, new Set([...(c && c.attrs ? c.attrs : []), ...((overlay[id] && overlay[id].attrs) || [])]));
      }
      return attrCache.get(id);
    },
    /** { terms:['F','S'], summer?, confidence, evidence } or null when nothing is known about when it is offered. */
    offered: id => (overlay[id] && overlay[id].offered) || null,
    difficulty: id => (overlay[id] && overlay[id].difficulty) || 'normal',

    /**
     * Does a course fit a pool (or any pool of a list)? A course matches if it is listed in `courses`, or if it satisfies
     * EVERY other criterion present (subject, level range, all attrs). {any:true} matches everything.
     */
    matchesPool(id, pool) {
      if (Array.isArray(pool)) return pool.some(p => ds.matchesPool(id, p));
      if (!pool) return false;
      if (pool.any === true) return true;
      if (pool.courses && pool.courses.includes(id)) return true;
      const criteria = ['subject', 'level', 'attrs'].filter(k => pool[k] !== undefined);
      if (!criteria.length) return false;
      if (pool.subject && subjectOf(id) !== pool.subject) return false;
      if (pool.level) {
        const n = numberOf(id);
        if (n < pool.level.min || (pool.level.max !== undefined && n > pool.level.max)) return false;
      }
      if (pool.attrs) { const a = ds.attrs(id); if (!pool.attrs.every(w => hasAttr(a, w))) return false; }
      return true;
    },

    /**
     * Is every course that fits pool `a` also a fit for `b` (a pool or a list of pools)? Used to let a placeholder tile of
     * one program stand in for a slot of another: "a course from a's list would be accepted there".
     * Structural first (same or tighter subject, level and attributes); otherwise decided by the courses actually in the
     * dataset, which needs at least one witness (an empty pool is never "within"), so missing data never grants a match.
     */
    poolWithin(a, b) {
      if (Array.isArray(b)) return b.some(x => ds.poolWithin(a, x)) || (isCriteriaPool(a) === false && listOf(a).length > 0 && listOf(a).every(c => ds.matchesPool(c, b)));
      if (!a || !b) return false;
      if (b.any === true) return true;
      if (a.any === true) return false;
      const listed = listOf(a);
      if (!listed.every(c => ds.matchesPool(c, b))) return false;
      if (!isCriteriaPool(a)) return listed.length > 0;
      if (structurallyWithin(a, b)) return true;
      const witnesses = courses.filter(c => ds.matchesPool(c.id, a)).map(c => c.id);
      return witnesses.length > 0 && witnesses.every(id => ds.matchesPool(id, b));
    },
  };
  return ds;
}

const listOf = pool => (pool && pool.courses) || [];
const isCriteriaPool = pool => !!pool && (pool.subject !== undefined || pool.level !== undefined || pool.attrs !== undefined);

/** Criteria of `a` imply every criterion of `b` (b needs a criteria part; a list in b cannot contain an open-ended a). */
function structurallyWithin(a, b) {
  if (!isCriteriaPool(b)) return false;
  if (b.subject !== undefined && a.subject !== b.subject) return false;
  if (b.level !== undefined) {
    if (a.level === undefined) return false;
    if (a.level.min < b.level.min) return false;
    if (b.level.max !== undefined && (a.level.max === undefined || a.level.max > b.level.max)) return false;
  }
  if (b.attrs !== undefined) {
    const mine = a.attrs || [];
    if (!b.attrs.every(w => mine.some(x => x === w || x.startsWith(w + ':')))) return false;
  }
  return true;
}
