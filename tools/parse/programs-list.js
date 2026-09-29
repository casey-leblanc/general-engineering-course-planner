import { anchors } from './html.js';

/**
 * Parse an "All Degree Programs" listing page (content.php?catoid=N&navoid=M).
 * Returns { programs: [{poid, name}], pageLinks: [absolute-or-relative hrefs for other pages of the listing] }.
 */
export function parseProgramsList(html) {
  const programs = new Map();
  const pageLinks = new Set();
  for (const a of anchors(html)) {
    const p = /preview_program\.php\?[^#]*\bpoid=(\d+)/.exec(a.href + ' ' + a.onclick);
    if (p && a.text) { if (!programs.has(p[1])) programs.set(p[1], { poid: Number(p[1]), name: a.text }); continue; }
    if (/[?&]filter(\[|%5B)cpage(\]|%5D)=\d+/.test(a.href) && !/^#/.test(a.href)) pageLinks.add(a.href);
  }
  return { programs: [...programs.values()], pageLinks: [...pageLinks] };
}
