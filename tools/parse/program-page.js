import { anchors } from './html.js';

/**
 * Course links on a program page, in page order, de-duplicated by coid.
 * The catalog renders them as  <a href="#ttNNN" onclick="acalogPopup('preview_course.php?catoid=35&coid=222094&print', ...)">MATH 1022</a>
 */
export function courseLinks(html) {
  const seen = new Set();
  const out = [];
  for (const a of anchors(html)) {
    const m = /preview_course(?:_nopop)?\.php\?[^'")\s]*\bcoid=(\d+)/.exec(a.onclick + ' ' + a.href);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ coid: Number(m[1]), code: a.text });
  }
  return out;
}
