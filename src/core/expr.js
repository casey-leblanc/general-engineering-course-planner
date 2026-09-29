// Prerequisite expressions as readable text (the catalog's own wording is always kept next to it in `prereqText`).
import { courseCode } from './tiles.js';

const STANDING = { freshman: 'freshman standing', sophomore: 'sophomore standing (30 hours)', junior: 'junior standing (60 hours)', senior: 'senior standing (90 hours)' };

export function describeExpr(expr, top = true) {
  if (!expr) return '';
  if (expr.course) {
    const c = courseCode(expr.course);
    const grade = expr.minGrade ? ` (${expr.minGrade} or better)` : '';
    if (expr.concurrent === 'ok') return `${c}${grade} (or taken together)`;
    if (expr.concurrent === 'required') return `${c}${grade} (taken together)`;
    return c + grade;
  }
  if (expr.standing) return STANDING[expr.standing];
  if (expr.credits) return `${expr.credits} credit hours`;
  if (expr.consent) return `consent of ${expr.consent}`;
  if (expr.unparsed) return expr.unparsed;
  const kids = expr.all || expr.any;
  const parts = kids.map(k => describeExpr(k, false));
  const text = expr.all ? parts.join(', ') : parts.join(' or ');
  const withWaiver = expr.waiver ? `${text}, or ${expr.waiver}` : text;
  return !top && kids.length > 1 && expr.any ? `(${withWaiver})` : withWaiver;
}
