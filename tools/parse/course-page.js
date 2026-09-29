// Course page text -> normalized course record. Works on the visible text of a saved page (markup independent),
// so it applies equally to pages a human saved and to pages fetched with the registrar's permission.
import { textOf } from './html.js';
import { parseRequisites } from './prereq.js';

const HEADER = /^([A-Z]{2,5})\s+(\d{4}[A-Z]?)\s+(.+?)\s*\((\d+)(?:\s*-\s*(\d+))?\)\s*(.*)$/;
const STOP = /^(Back to Top|Print-Friendly Page|Add to Portfolio|Facebook this Page|Tweet this Page|HELP)\b/i;

/** parseCourseText(text) -> record without `source` (the caller adds provenance), or null if no course header is found. */
export function parseCourseText(text) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const at = lines.findIndex(l => HEADER.test(l));
  if (at < 0) return null;
  const m = HEADER.exec(lines[at]);
  const [, subject, number, title, lo, hi, tail] = m;
  const restLines = [tail, ...lines.slice(at + 1)];
  const stop = restLines.findIndex(l => STOP.test(l));
  const rest = restLines.slice(0, stop < 0 ? undefined : stop).join(' ');
  const req = parseRequisites(rest);
  const credits = hi ? { min: Number(lo), max: Number(hi) } : { fixed: Number(lo) };
  const rec = { id: `${subject}${number}`, subject, number, title: title.trim(), credits, parse: req.parse };
  if (req.prereq) rec.prereq = req.prereq;
  if (req.coreq) rec.coreq = req.coreq;
  if (req.parse !== 'none') rec.prereqText = req.text;
  rec.parseReasons = req.reasons;
  return rec;
}

export function parseCoursePage(html) {
  return parseCourseText(textOf(html));
}
