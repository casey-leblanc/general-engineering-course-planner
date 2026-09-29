// Runtime validation for the planner's JSON data (courses, programs, rule packs). Pure, dependency-free, and used by
// the build tools, the tests and (for share links and personal rules) the browser. Every validator returns an array of
// { path, message }; an empty array means valid. Validators are strict about unknown keys so typos fail loudly.

export const COURSE_ID = /^[A-Z]{2,5}\d{4}[A-Z]?$/;
export const REQUIREMENT_ID = /^[A-Z][A-Z0-9-]*(\/[A-Za-z0-9_.-]+)+$/;
export const PROGRAM_ID = /^[A-Z][A-Z0-9-]*$/;
export const ATTR = /^[a-z0-9-]+(:[a-z0-9-]+)?$/;
export const CATALOG_YEAR = /^\d{4}-\d{4}$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const RULE_TYPES = ['equivalent', 'enrollment', 'substitute', 'noSubstitute', 'waive', 'waivePrereq', 'grant', 'offering', 'exclusive', 'advisory'];
export const CONFIDENCE = ['confirmed', 'reported', 'unverified'];
export const SOURCE_KINDS = ['advisor', 'department', 'registrar', 'workday', 'catalog', 'student'];
export const EFFECTS = ['info', 'warn', 'block'];
export const SEASONS = ['F', 'S', 'Su'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

class Errs {
  constructor() { this.list = []; }
  add(path, message) { this.list.push({ path, message }); }
  check(cond, path, message) { if (!cond) this.add(path, message); return !!cond; }
  keys(obj, path, allowed, required = []) {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) this.add(`${path}.${k}`, 'unknown key');
    for (const k of required) if (!(k in obj)) this.add(`${path}.${k}`, 'required');
  }
}

/* ------------------------------------------------------------------ prerequisite expressions */

const EXPR_KEYS = ['course', 'concurrent', 'minGrade', 'all', 'any', 'waiver', 'standing', 'credits', 'consent', 'unparsed'];
const EXPR_KINDS = ['course', 'all', 'any', 'standing', 'credits', 'consent', 'unparsed'];

/**
 * Expr := {course, concurrent?, minGrade?} | {all:[Expr]} | {any:[Expr]} | {standing} | {credits} | {consent} | {unparsed}
 * all/any may carry a `waiver` text (e.g. "consent of division": the whole clause is waivable). `unparsed` keeps text a
 * human still has to interpret; it is never silently dropped.
 */
export function validateExpr(expr, path = 'expr', e = new Errs()) {
  if (!e.check(isObj(expr), path, 'must be an object')) return e.list;
  e.keys(expr, path, EXPR_KEYS);
  const kinds = EXPR_KINDS.filter(k => k in expr);
  if (!e.check(kinds.length === 1, path, `exactly one of ${EXPR_KINDS.join('/')} is required (found ${kinds.join(',') || 'none'})`)) return e.list;
  if ('course' in expr) {
    e.check(COURSE_ID.test(expr.course), `${path}.course`, `bad course id ${JSON.stringify(expr.course)}`);
    if ('concurrent' in expr) e.check(['no', 'ok', 'required'].includes(expr.concurrent), `${path}.concurrent`, 'must be no | ok | required');
    if ('minGrade' in expr) e.check(/^[A-D][+-]?$/.test(expr.minGrade), `${path}.minGrade`, 'must be a letter grade');
  }
  for (const k of ['all', 'any']) if (k in expr) {
    if (e.check(Array.isArray(expr[k]) && expr[k].length > 0, `${path}.${k}`, 'must be a non-empty array')) expr[k].forEach((x, i) => validateExpr(x, `${path}.${k}[${i}]`, e));
  }
  if ('waiver' in expr) e.check(isStr(expr.waiver) && ('all' in expr || 'any' in expr), `${path}.waiver`, 'waiver text is only allowed on all/any nodes');
  if ('standing' in expr) e.check(['freshman', 'sophomore', 'junior', 'senior'].includes(expr.standing), `${path}.standing`, 'bad class standing');
  if ('credits' in expr) e.check(Number.isInteger(expr.credits) && expr.credits > 0, `${path}.credits`, 'must be a positive integer');
  if ('consent' in expr) e.check(isStr(expr.consent), `${path}.consent`, 'must say whose consent (e.g. "department")');
  if ('unparsed' in expr) e.check(isStr(expr.unparsed), `${path}.unparsed`, 'must be the original text');
  return e.list;
}

/** Every course id mentioned in an expression. */
export function exprCourses(expr, out = new Set()) {
  if (!isObj(expr)) return out;
  if (expr.course) out.add(expr.course);
  for (const k of ['all', 'any']) if (Array.isArray(expr[k])) expr[k].forEach(x => exprCourses(x, out));
  return out;
}

/* ------------------------------------------------------------------ courses */

// origin: 'catalog' = read from the General Catalog (evidence says how); 'legacy' = hand-typed in the old app, NOT verified.
const SOURCE_KEYS = ['catalogYear', 'catoid', 'coid', 'url', 'sha256', 'fetchedAt', 'origin', 'verified', 'evidence'];

export function validateCourse(c, path = 'course') {
  const e = new Errs();
  if (!e.check(isObj(c), path, 'must be an object')) return e.list;
  e.keys(c, path, ['id', 'subject', 'number', 'title', 'credits', 'prereq', 'coreq', 'prereqText', 'parse', 'attrs', 'source'], ['id', 'subject', 'number', 'title', 'credits', 'source']);
  if (e.check(COURSE_ID.test(c.id), `${path}.id`, `bad id ${JSON.stringify(c.id)}`) && isStr(c.subject) && isStr(c.number))
    e.check(c.id === `${c.subject}${c.number}`, `${path}.id`, `id must equal subject+number (${c.subject}${c.number})`);
  e.check(isStr(c.title), `${path}.title`, 'required');
  if (isObj(c.credits)) {
    if ('fixed' in c.credits) e.check(Number.isInteger(c.credits.fixed) && c.credits.fixed >= 0, `${path}.credits.fixed`, 'must be a non-negative integer');
    else e.check(Number.isInteger(c.credits.min) && Number.isInteger(c.credits.max) && c.credits.min <= c.credits.max, `${path}.credits`, 'need {fixed} or {min,max}');
  } else e.add(`${path}.credits`, 'must be an object');
  for (const k of ['prereq', 'coreq']) if (k in c) validateExpr(c[k], `${path}.${k}`, e);
  // parse: auto = read from catalog text; manual = text kept for a human; none = no requisites exist / converted by hand;
  // unknown = requisite text not obtained yet (absence of prereq/coreq does NOT mean "no prerequisites").
  if ('parse' in c) e.check(['auto', 'manual', 'none', 'unknown'].includes(c.parse), `${path}.parse`, 'must be auto | manual | none | unknown');
  if ('attrs' in c) e.check(Array.isArray(c.attrs) && c.attrs.every(a => ATTR.test(a)), `${path}.attrs`, 'must be an array of attribute names like level:2000');
  if (isObj(c.source)) {
    e.keys(c.source, `${path}.source`, SOURCE_KEYS, ['catalogYear']);
    e.check(CATALOG_YEAR.test(c.source.catalogYear || ''), `${path}.source.catalogYear`, 'must look like 2026-2027');
    if ('origin' in c.source) e.check(['catalog', 'workday', 'flowchart', 'legacy'].includes(c.source.origin), `${path}.source.origin`, 'must be catalog | workday | flowchart | legacy');
    if (c.source.origin === 'flowchart') e.check(c.source.verified === false, `${path}.source.verified`, 'flowchart stubs carry no requisites and must be marked verified:false');
    if ('verified' in c.source) e.check(typeof c.source.verified === 'boolean', `${path}.source.verified`, 'must be boolean');
    if (c.source.origin === 'legacy') e.check(c.source.verified === false, `${path}.source.verified`, 'legacy data must be marked verified:false');
  } else e.add(`${path}.source`, 'must be an object');
  return e.list;
}

/* ------------------------------------------------------------------ programs and requirement trees */

/**
 * Scheduling hints for the auto-arrange solver: a design elective (60 credits earned first, spread out), a gen-ed (light load,
 * spread out), a free elective (light load), upper-level work (stays near its recommended place instead of floating).
 */
export const HINTS = ['design', 'gen-ed', 'elective', 'upper'];
const NODE_KEYS = ['id', 'type', 'label', 'course', 'anyOf', 'items', 'n', 'from', 'credits', 'minGrade', 'minGroups', 'minCourses', 'groups', 'note', 'hints'];
const NODE_TYPES = ['course', 'all', 'any', 'choose', 'credits', 'distinctGroups', 'slot'];

/**
 * Pool := {courses?, attrs?, subject?, level?:{min,max}, any?}  : which courses may fill something.
 * A course matches a pool if it is listed in `courses`, OR it satisfies EVERY one of the other criteria present
 * (subject, level, and all of `attrs`). `{any:true}` matches every course. A rule may give an array of pools (union).
 */
export function validatePools(p, path, e = new Errs()) {
  if (Array.isArray(p)) {
    e.check(p.length > 0, path, 'must not be an empty array');
    p.forEach((x, i) => validatePool(x, `${path}[${i}]`, e));
    return e.list;
  }
  return validatePool(p, path, e);
}

export function validatePool(p, path, e = new Errs()) {
  if (!e.check(isObj(p), path, 'must be an object')) return e.list;
  e.keys(p, path, ['courses', 'attrs', 'subject', 'level', 'any']);
  const has = ['courses', 'attrs', 'subject', 'level', 'any'].filter(k => k in p);
  e.check(has.length > 0, path, 'a pool needs at least one of courses/attrs/subject/level/any');
  if ('any' in p) { e.check(p.any === true, `${path}.any`, 'must be true'); e.check(has.length === 1, path, '"any" cannot be combined with other keys'); }
  if ('courses' in p) e.check(Array.isArray(p.courses) && p.courses.length > 0 && p.courses.every(c => COURSE_ID.test(c)), `${path}.courses`, 'must be a non-empty array of course ids');
  if ('attrs' in p) e.check(Array.isArray(p.attrs) && p.attrs.length > 0 && p.attrs.every(a => ATTR.test(a)), `${path}.attrs`, 'must be a non-empty array of attribute names');
  if ('subject' in p) e.check(/^[A-Z]{2,5}$/.test(p.subject), `${path}.subject`, 'must be a subject code like EE');
  if ('level' in p) e.check(isObj(p.level) && Number.isInteger(p.level.min) && (p.level.max === undefined || (Number.isInteger(p.level.max) && p.level.max >= p.level.min)), `${path}.level`, 'must be {min, max?}');
  return e.list;
}

function validateNode(n, path, ids, e) {
  if (!e.check(isObj(n), path, 'must be an object')) return;
  e.keys(n, path, NODE_KEYS, ['id', 'type']);
  if (e.check(REQUIREMENT_ID.test(n.id || ''), `${path}.id`, `bad requirement id ${JSON.stringify(n.id)}`)) {
    e.check(!ids.has(n.id), `${path}.id`, `duplicate requirement id ${n.id}`);
    ids.add(n.id);
  }
  if (!e.check(NODE_TYPES.includes(n.type), `${path}.type`, `must be one of ${NODE_TYPES.join(', ')}`)) return;
  switch (n.type) {
    case 'course':
      e.check(COURSE_ID.test(n.course || ''), `${path}.course`, 'required course id');
      if ('anyOf' in n) e.check(Array.isArray(n.anyOf) && n.anyOf.every(c => COURSE_ID.test(c)), `${path}.anyOf`, 'must be an array of course ids');
      if ('minGrade' in n) e.check(/^[A-D][+-]?$/.test(n.minGrade), `${path}.minGrade`, 'must be a letter grade');
      break;
    case 'all': case 'any':
      if (e.check(Array.isArray(n.items) && n.items.length > 0, `${path}.items`, 'must be a non-empty array')) n.items.forEach((c, i) => validateNode(c, `${path}.items[${i}]`, ids, e));
      break;
    case 'choose':
      e.check(Number.isInteger(n.n) && n.n > 0, `${path}.n`, 'must be a positive integer');
      validatePools(n.from, `${path}.from`, e);
      break;
    case 'credits':
      e.check(Number.isInteger(n.credits) && n.credits > 0, `${path}.credits`, 'must be a positive integer');
      validatePools(n.from, `${path}.from`, e);
      break;
    case 'slot':
      e.check(isStr(n.label), `${path}.label`, 'required');
      if ('hints' in n) e.check(Array.isArray(n.hints) && n.hints.every(h => HINTS.includes(h)), `${path}.hints`, `must be a list of ${HINTS.join(' | ')}`);
      if ('from' in n) validatePools(n.from, `${path}.from`, e);
      e.check(Number.isInteger(n.credits) && n.credits > 0, `${path}.credits`, 'must be a positive integer');
      break;
    case 'distinctGroups':
      e.check(Number.isInteger(n.minGroups) && n.minGroups > 0, `${path}.minGroups`, 'must be a positive integer');
      if ('minCourses' in n) e.check(Number.isInteger(n.minCourses) && n.minCourses >= n.minGroups, `${path}.minCourses`, 'must be an integer >= minGroups');
      if (e.check(Array.isArray(n.groups) && n.groups.length >= n.minGroups, `${path}.groups`, 'need at least minGroups groups')) {
        n.groups.forEach((g, i) => {
          e.check(isObj(g) && isStr(g.name) && Array.isArray(g.courses) && g.courses.length > 0 && g.courses.every(c => COURSE_ID.test(c)), `${path}.groups[${i}]`, 'must be {name, courses:[ids]}');
        });
      }
      break;
  }
}

function validatePlan(plan, path, e) {
  e.check(Array.isArray(plan) && plan.every(r => Array.isArray(r) && typeof r[0] === 'string' && Array.isArray(r[1])), path, 'must be [[termKey, [ids...]], ...]');
}

export function validateProgram(p, path = 'program') {
  const e = new Errs();
  if (!e.check(isObj(p), path, 'must be an object')) return e.list;
  e.keys(p, path, ['id', 'kind', 'name', 'degree', 'group', 'variant', 'catalogYear', 'totalCredits', 'college', 'requirements', 'constraints', 'recommendedPlan', 'sequences', 'tracks', 'flowchartUrl', 'notes', 'staleness', 'source'], ['id', 'kind', 'name', 'catalogYear', 'requirements', 'source']);
  if ('group' in p) e.check(isStr(p.group), `${path}.group`, 'must be a non-empty string');
  if ('variant' in p) e.check(isStr(p.variant), `${path}.variant`, 'must be a non-empty string');
  e.check(PROGRAM_ID.test(p.id || ''), `${path}.id`, 'bad program id');
  e.check(['major', 'minor', 'concentration', 'track'].includes(p.kind), `${path}.kind`, 'must be major | minor | concentration | track');
  e.check(isStr(p.name), `${path}.name`, 'required');
  e.check(CATALOG_YEAR.test(p.catalogYear || ''), `${path}.catalogYear`, 'must look like 2026-2027');
  if ('totalCredits' in p) e.check(Number.isInteger(p.totalCredits) && p.totalCredits > 0, `${path}.totalCredits`, 'must be a positive integer');
  const ids = new Set();
  validateNode(p.requirements, `${path}.requirements`, ids, e);
  for (const id of ids) if (!id.startsWith(p.id + '/') && id !== p.id) e.add(`${path}.requirements`, `requirement id ${id} must start with ${p.id}/`);
  if ('recommendedPlan' in p) validatePlan(p.recommendedPlan, `${path}.recommendedPlan`, e);
  if ('sequences' in p) {
    if (e.check(Array.isArray(p.sequences), `${path}.sequences`, 'must be an array')) p.sequences.forEach((q, i) => {
      const at = `${path}.sequences[${i}]`;
      if (!e.check(isObj(q), at, 'must be {a, b, gap}')) return;
      e.keys(q, at, ['a', 'b', 'gap'], ['a', 'b', 'gap']);
      e.check(COURSE_ID.test(q.a || '') && COURSE_ID.test(q.b || ''), at, 'a and b must be course ids');
      e.check(Number.isInteger(q.gap) && q.gap >= 1, `${at}.gap`, 'must be a positive integer (terms between a and b)');
    });
  }
  if ('tracks' in p) {
    if (e.check(Array.isArray(p.tracks) && p.tracks.length > 0, `${path}.tracks`, 'must be a non-empty array')) {
      const seen = new Set();
      p.tracks.forEach((t, i) => {
        const at = `${path}.tracks[${i}]`;
        if (!e.check(isObj(t), at, 'must be an object')) return;
        e.keys(t, at, ['id', 'name', 'note', 'default', 'recommendedPlan', 'assign', 'tags', 'labels', 'source'], ['id', 'name']);
        if ('labels' in t) e.check(isObj(t.labels) && Object.values(t.labels).every(isStr), `${at}.labels`, 'must map a tile id to a suggestion text');
        e.check(/^[a-z0-9-]+$/.test(t.id || '') && !seen.has(t.id), `${at}.id`, 'lower-case id, unique within the program'); seen.add(t.id);
        if ('recommendedPlan' in t) validatePlan(t.recommendedPlan, `${at}.recommendedPlan`, e);
        else e.check(!!p.recommendedPlan, `${at}.recommendedPlan`, 'a track without its own plan needs the program to have one');
        if ('assign' in t) e.check(isObj(t.assign) && Object.values(t.assign).every(v => REQUIREMENT_ID.test(v)), `${at}.assign`, 'must map course ids to requirement ids');
        if ('tags' in t) e.check(isObj(t.tags) && Object.values(t.tags).every(v => Array.isArray(v) && v.every(c => COURSE_ID.test(c))), `${at}.tags`, 'must map a tag to course ids');
      });
      e.check(p.tracks.filter(t => t.default).length <= 1, `${path}.tracks`, 'at most one default track');
    }
  }
  if (isObj(p.source)) e.keys(p.source, `${path}.source`, [...SOURCE_KEYS, 'poid'], ['catalogYear']);
  else e.add(`${path}.source`, 'must be an object');
  return e.list;
}

/** Ids of all requirement nodes in a program (used to resolve rule targets). */
export function requirementIds(program) {
  const out = new Set();
  (function walk(n) { if (!isObj(n)) return; if (n.id) out.add(n.id); (n.items || []).forEach(walk); })(program.requirements);
  return out;
}

/* ------------------------------------------------------------------ rule packs */

const CONDITION_KEYS = ['majors', 'creditFromOtherProgram', 'viaAP', 'entryYear'];

export function validateCondition(c, path, e = new Errs()) {
  if (!e.check(isObj(c), path, 'must be an object')) return e.list;
  e.keys(c, path, CONDITION_KEYS);
  e.check(Object.keys(c).length > 0, path, 'empty condition');
  if ('majors' in c) {
    if (e.check(isObj(c.majors), `${path}.majors`, 'must be an object')) {
      e.keys(c.majors, `${path}.majors`, ['hasAny', 'hasAll', 'hasOnly']);
      for (const k of ['hasAny', 'hasAll', 'hasOnly']) if (k in c.majors) e.check(Array.isArray(c.majors[k]) && c.majors[k].length > 0 && c.majors[k].every(x => PROGRAM_ID.test(x)), `${path}.majors.${k}`, 'must be a non-empty array of program ids');
    }
  }
  for (const k of ['creditFromOtherProgram', 'viaAP']) if (k in c) e.check(c[k] === true, `${path}.${k}`, 'must be true');
  if ('entryYear' in c) e.check(isObj(c.entryYear) && Number.isInteger(c.entryYear.from) && (c.entryYear.to === undefined || Number.isInteger(c.entryYear.to)), `${path}.entryYear`, 'must be {from, to?}');
  return e.list;
}

const COMMON_RULE_KEYS = ['id', 'type', 'scope', 'confidence', 'source', 'note', 'openQuestions', 'effect'];
const TYPE_KEYS = {
  equivalent: [['course', 'satisfies'], ['condition', 'noDoubleCredit', 'both']],
  enrollment: [['course'], ['deniedIf', 'allowedIf']],
  substitute: [['requirement', 'accepts'], []],
  noSubstitute: [['requirement', 'rejects'], []],
  waive: [['requirement'], ['credits']],
  waivePrereq: [['course', 'prereq'], []],
  grant: [['course', 'via'], ['credits']],
  offering: [['course', 'terms'], ['summer', 'evidence']],
  exclusive: [['courses'], []],
  advisory: [['target', 'message'], []],
};

export function validateRule(r, path = 'rule') {
  const e = new Errs();
  if (!e.check(isObj(r), path, 'must be an object')) return e.list;
  if (!e.check(RULE_TYPES.includes(r.type), `${path}.type`, `must be one of ${RULE_TYPES.join(', ')}`)) return e.list;
  const [req, opt] = TYPE_KEYS[r.type];
  e.keys(r, path, [...COMMON_RULE_KEYS, ...req, ...opt], ['id', 'type', 'scope', 'confidence', 'source', ...req]);
  e.check(/^[A-Za-z0-9._-]+$/.test(r.id || ''), `${path}.id`, 'bad rule id');
  // scope: a rule that applies to nobody (or everybody) by accident is rejected.
  if (e.check(isObj(r.scope), `${path}.scope`, 'required')) {
    e.keys(r.scope, `${path}.scope`, ['programs', 'catalogYears']);
    e.check(('programs' in r.scope) || ('catalogYears' in r.scope), `${path}.scope`, 'needs programs and/or catalogYears');
    if ('programs' in r.scope) e.check(Array.isArray(r.scope.programs) && r.scope.programs.length > 0 && r.scope.programs.every(x => PROGRAM_ID.test(x)), `${path}.scope.programs`, 'must be a non-empty array of program ids');
    if ('catalogYears' in r.scope) e.check(Array.isArray(r.scope.catalogYears) && r.scope.catalogYears.length > 0 && r.scope.catalogYears.every(x => CATALOG_YEAR.test(x)), `${path}.scope.catalogYears`, 'must be a non-empty array like ["2026-2027"]');
  }
  e.check(CONFIDENCE.includes(r.confidence), `${path}.confidence`, `must be one of ${CONFIDENCE.join(', ')}`);
  if (e.check(isObj(r.source), `${path}.source`, 'required')) {
    e.keys(r.source, `${path}.source`, ['kind', 'label', 'recordedOn'], ['kind', 'label', 'recordedOn']);
    e.check(SOURCE_KINDS.includes(r.source.kind), `${path}.source.kind`, `must be one of ${SOURCE_KINDS.join(', ')}`);
    e.check(isStr(r.source.label) && !/@|\bhttps?:/i.test(r.source.label), `${path}.source.label`, 'role-level label only (no emails or URLs)');
    e.check(ISO_DATE.test(r.source.recordedOn || ''), `${path}.source.recordedOn`, 'must be YYYY-MM-DD');
  }
  if ('effect' in r) e.check(EFFECTS.includes(r.effect), `${path}.effect`, `must be one of ${EFFECTS.join(', ')}`);
  if ('note' in r) e.check(isStr(r.note), `${path}.note`, 'must be a non-empty string');
  if ('openQuestions' in r) e.check(Array.isArray(r.openQuestions) && r.openQuestions.every(isStr), `${path}.openQuestions`, 'must be an array of strings');

  const course = k => e.check(COURSE_ID.test(r[k] || ''), `${path}.${k}`, `bad course id ${JSON.stringify(r[k])}`);
  switch (r.type) {
    case 'equivalent':
      course('course'); course('satisfies');
      if (r.course === r.satisfies) e.add(`${path}.satisfies`, 'a course cannot be equivalent to itself');
      if ('condition' in r) validateCondition(r.condition, `${path}.condition`, e);
      if ('noDoubleCredit' in r) e.check(typeof r.noDoubleCredit === 'boolean', `${path}.noDoubleCredit`, 'must be boolean');
      if ('both' in r) e.check(typeof r.both === 'boolean', `${path}.both`, 'must be boolean');
      break;
    case 'enrollment':
      course('course');
      e.check(('deniedIf' in r) !== ('allowedIf' in r), path, 'exactly one of deniedIf / allowedIf is required');
      for (const k of ['deniedIf', 'allowedIf']) if (k in r) validateCondition(r[k], `${path}.${k}`, e);
      e.check(r.effect === 'warn' || r.effect === 'block', `${path}.effect`, 'enrollment rules need effect warn or block');
      break;
    case 'substitute':
      e.check(REQUIREMENT_ID.test(r.requirement || ''), `${path}.requirement`, 'bad requirement id');
      validatePools(r.accepts, `${path}.accepts`, e);
      break;
    case 'noSubstitute':
      e.check(REQUIREMENT_ID.test(r.requirement || ''), `${path}.requirement`, 'bad requirement id');
      validatePools(r.rejects, `${path}.rejects`, e);
      break;
    case 'waive':
      e.check(REQUIREMENT_ID.test(r.requirement || ''), `${path}.requirement`, 'bad requirement id');
      if ('credits' in r) e.check(Number.isInteger(r.credits) && r.credits > 0, `${path}.credits`, 'must be a positive integer');
      break;
    case 'waivePrereq':
      course('course');
      e.check(r.prereq === '*' || COURSE_ID.test(r.prereq || ''), `${path}.prereq`, 'must be a course id or "*"');
      break;
    case 'grant':
      course('course');
      e.check(['AP', 'transfer', 'placement', 'other'].includes(r.via), `${path}.via`, 'must be AP | transfer | placement | other');
      if ('credits' in r) e.check(Number.isInteger(r.credits) && r.credits >= 0, `${path}.credits`, 'must be a non-negative integer');
      break;
    case 'offering':
      course('course');
      e.check(Array.isArray(r.terms) && r.terms.length > 0 && r.terms.every(t => SEASONS.includes(t)), `${path}.terms`, 'must be a non-empty array of F | S | Su');
      if ('summer' in r) e.check(['MA', 'MJ', 'JA', 'BOTH'].includes(r.summer), `${path}.summer`, 'must be MA | MJ | JA | BOTH');
      break;
    case 'exclusive':
      e.check(Array.isArray(r.courses) && r.courses.length >= 2 && r.courses.every(c => COURSE_ID.test(c)), `${path}.courses`, 'need at least two course ids');
      break;
    case 'advisory':
      if (e.check(isObj(r.target), `${path}.target`, 'required')) {
        e.keys(r.target, `${path}.target`, ['course', 'requirement']);
        e.check(('course' in r.target) !== ('requirement' in r.target), `${path}.target`, 'exactly one of course / requirement');
        if ('course' in r.target) e.check(COURSE_ID.test(r.target.course), `${path}.target.course`, 'bad course id');
        if ('requirement' in r.target) e.check(REQUIREMENT_ID.test(r.target.requirement), `${path}.target.requirement`, 'bad requirement id');
      }
      e.check(isStr(r.message), `${path}.message`, 'required');
      break;
  }
  return e.list;
}

export function validateRulePack(pack, path = 'pack') {
  const e = new Errs();
  if (!e.check(isObj(pack), path, 'must be an object')) return e.list;
  e.keys(pack, path, ['schema', 'catalogYear', 'description', 'rules'], ['schema', 'catalogYear', 'rules']);
  e.check(pack.schema === 'rules/1', `${path}.schema`, 'must be "rules/1"');
  e.check(CATALOG_YEAR.test(pack.catalogYear || ''), `${path}.catalogYear`, 'must look like 2026-2027');
  if (e.check(Array.isArray(pack.rules), `${path}.rules`, 'must be an array')) {
    const ids = new Set();
    pack.rules.forEach((r, i) => {
      e.list.push(...validateRule(r, `${path}.rules[${i}]`));
      if (isObj(r) && r.id) { e.check(!ids.has(r.id), `${path}.rules[${i}].id`, `duplicate rule id ${r.id}`); ids.add(r.id); }
    });
  }
  return e.list;
}
