// Applies rule packs (advisor rules) and personal rules to a student. Rules never change the course or program data;
// they are consulted while checking prerequisites and auditing requirements, and they are reported when they matter.
//
// student = { catalogYear, majors: [programId], minors: [programId], grants: { courseId: 'AP'|'transfer'|... }, entryYear? }
// A rule's scope.programs names the program that RECEIVES the benefit; the rule applies only to students in that program.

const inScopePrograms = (rule, student) => {
  const mine = new Set([...(student.majors || []), ...(student.minors || [])]);
  return !rule.scope.programs || rule.scope.programs.some(p => mine.has(p));
};
const inScopeYear = (rule, student) => !rule.scope.catalogYears || rule.scope.catalogYears.includes(student.catalogYear);

export function ruleApplies(rule, student) {
  return inScopeYear(rule, student) && inScopePrograms(rule, student);
}

/** Does `path` (a requirement node id or the ancestor chain of a demand) lie at or under `target`? */
const under = (path, target) => path.some(id => id === target);

export function createRuleset(rules, student, { countedFor = () => new Set() } = {}) {
  const active = rules.filter(r => ruleApplies(r, student));
  const majors = student.majors || [];

  function conditionHolds(cond, course, rule) {
    if (!cond) return true;
    if (cond.majors) {
      const m = cond.majors;
      if (m.hasAny && !m.hasAny.some(p => majors.includes(p))) return false;
      if (m.hasAll && !m.hasAll.every(p => majors.includes(p))) return false;
      if (m.hasOnly && !(majors.length > 0 && majors.every(p => m.hasOnly.includes(p)))) return false;
    }
    if (cond.viaAP && !(student.grants && student.grants[course] === 'AP')) return false;
    if (cond.creditFromOtherProgram) {
      // the course must count toward a program other than the one this rule benefits
      const receiving = (rule && rule.scope.programs) || [];
      const counted = [...countedFor(course)];
      if (!counted.some(p => !receiving.includes(p))) return false;
    }
    if (cond.entryYear) {
      const y = student.entryYear;
      if (y === undefined || y < cond.entryYear.from || (cond.entryYear.to !== undefined && y > cond.entryYear.to)) return false;
    }
    return true;
  }

  const ofType = t => active.filter(r => r.type === t);
  return {
    active,
    /** Courses that satisfy references to `target` (prerequisites, requirements) for this student. `program` narrows to one receiving program. */
    equivalents(target, program) {
      return ofType('equivalent')
        .filter(r => r.satisfies === target && (!program || !r.scope.programs || r.scope.programs.includes(program)))
        .filter(r => conditionHolds(r.condition, r.course, r))
        .map(r => ({ course: r.course, rule: r }));
    },
    /** Enrollment restrictions that hit this student for `course`: [{rule, effect}] */
    enrollmentIssues(course) {
      return ofType('enrollment').filter(r => r.course === course).flatMap(r => {
        if (r.deniedIf && conditionHolds(r.deniedIf, course, r)) return [{ rule: r, effect: r.effect }];
        if (r.allowedIf && !conditionHolds(r.allowedIf, course, r)) return [{ rule: r, effect: r.effect }];
        return [];
      });
    },
    waivedPrereq: (course, prereq) => ofType('waivePrereq').find(r => r.course === course && (r.prereq === '*' || r.prereq === prereq)) || null,
    /** Pools accepted for a requirement whose ancestor chain is `path` (rule targets a node: it and everything below). */
    substitutes: path => ofType('substitute').filter(r => under(path, r.requirement)),
    rejects: path => ofType('noSubstitute').filter(r => under(path, r.requirement)),
    waives: path => ofType('waive').find(r => under(path, r.requirement)) || null,
    advisories: target => ofType('advisory').filter(r => (target.course && r.target.course === target.course) || (target.requirement && r.target.requirement === target.requirement)),
    grants: () => ofType('grant'),
  };
}
