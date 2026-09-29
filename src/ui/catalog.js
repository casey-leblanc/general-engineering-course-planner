// The course catalog dialog: search the dataset and add a course to a term, or choose the course for a placeholder slot.
import { esc, icons, $, $$ } from './dom.js';
import { courseCode } from '../core/tiles.js';
import { describeExpr } from '../core/expr.js';
import { termLabel } from '../core/terms.js';
import { termOf } from '../core/state.js';

const SEASON = { F: 'Fall', S: 'Spring', Su: 'Summer' };
const PAGE = 60;

/**
 * @param ctx    render context (state, dataset, m)
 * @param opts   { term, slot?: { id, label, pools[], programName }, onAdd(courseId, term), onClose }
 */
export function openCatalog(ctx, opts) {
  const { dataset, state, m } = ctx;
  const slot = opts.slot || null;
  const courseIsFor = new Map();       // courseId -> [program labels that list it as a requirement]
  for (const p of m.programs) {
    (function walk(n) {
      for (const c of [n.course, ...(n.anyOf || []), ...(n.groups ? n.groups.flatMap(g => g.courses) : [])].filter(Boolean)) {
        if (!courseIsFor.has(c)) courseIsFor.set(c, new Set());
        courseIsFor.get(c).add(p.id);
      }
      (n.items || []).forEach(walk);
    })(p.program.requirements);
  }
  const fitsSlot = id => {
    if (!slot) return false;
    if (slot.pools.length && dataset.matchesPool(id, slot.pools)) return true;
    return slot.accepts.some(pool => dataset.matchesPool(id, pool));
  };
  const subjects = [...new Set(dataset.courses.map(c => c.subject))].sort();
  let query = '', filter = slot ? 'fits' : 'all', shown = PAGE;
  let target = opts.term || state.terms.find(t => t !== 'completed') || 'year1-fall';

  const ov = document.createElement('div');
  ov.className = 'overlay catalog-overlay';
  ov.innerHTML = `<div class="dialog catalog-dialog" role="dialog" aria-modal="true" aria-label="Course catalog">
    <div class="cat-modal-h"><div class="cat-modal-title"><h3>${slot ? `Choose a course for ${esc(slot.label)}` : 'Course catalog'}</h3>
      <p class="cat-sub">${slot ? `Fills a slot in ${esc(slot.programName)}. Your choice is marked "your choice" in the audit.` : `Search the ${esc(ctx.yearLabel)} course data. Courses you add go to the semester you pick.`}</p></div>
      <button class="cat-close-btn" data-x="close" aria-label="Close">${icons.close}</button></div>
    <div class="cat-controls"><div class="cat-search-box">${icons.search}<input id="cat-q" type="text" placeholder="Search by course code or title (e.g. EE 2120, circuits, calculus)" aria-label="Search courses"></div>
      <div class="cat-filter-chips" id="cat-chips"></div></div>
    <div class="cat-list-wrap" id="cat-list"></div>
    <div class="cat-modal-foot"><span class="cat-foot-note">Course records are only as good as their source: each card says whether its data was verified, comes from last year's planner, or is not obtained yet.</span><button class="btn2 primary" data-x="close">Done</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $$(ov, '[data-x="close"]').forEach(b => { b.onclick = close; });
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });

  const chips = () => {
    const list = [];
    if (slot) list.push(['fits', 'Fits this slot']);
    list.push(['all', 'All courses']);
    if (m.programs.length) list.push(['mine', 'In my programs']);
    const subj = new Set(); for (const c of dataset.courses) if (courseIsFor.has(c.id)) subj.add(c.subject);
    for (const s of [...subj].sort()) list.push([`s:${s}`, s]);
    for (const s of subjects) if (!subj.has(s) && list.length < 18) list.push([`s:${s}`, s]);
    $(ov, '#cat-chips').innerHTML = list.map(([k, l]) => `<button class="filter-chip${filter === k ? ' on' : ''}" data-f="${k}">${esc(l)}</button>`).join('');
  };

  function matches(c) {
    if (filter === 'fits' && !fitsSlot(c.id)) return false;
    if (filter === 'mine' && !courseIsFor.has(c.id)) return false;
    if (filter.startsWith('s:') && c.subject !== filter.slice(2)) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(courseCode(c.id).toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function card(c) {
    const at = termOf(state, c.id);
    const off = dataset.offered(c.id);
    const diff = dataset.difficulty(c.id);
    const verified = c.source && c.source.verified;
    const data = verified ? '<span class="dv ok">verified</span>' : c.parse === 'unknown' ? '<span class="dv">requisites not obtained</span>' : '<span class="dv">unverified</span>';
    const progs = [...(courseIsFor.get(c.id) || [])].map(id => { const p = m.byProgram[id]; return p ? `<span class="t-prog-badge" style="--pc:${p.color}">${esc(p.label)}</span>` : ''; }).join('');
    const pre = c.parse === 'unknown' ? 'not obtained yet' : (describeExpr(c.prereq) || c.prereqText || 'None');
    const options = state.terms.map(tk => `<option value="${tk}"${tk === target ? ' selected' : ''}>${esc(termLabel(tk))}</option>`).join('');
    return `<div class="cat-card${at ? ' in-plan' : ''}"><div class="cat-card-h"><span class="cat-card-code">${esc(courseCode(c.id))}</span>
      <span class="cat-card-cr">${dataset.credits(c.id)} cr</span>${progs}${diff === 'hardest' ? '<span class="t-dbadge most">very difficult</span>' : diff === 'hard' ? '<span class="t-dbadge avg">difficult</span>' : ''}${slot && fitsSlot(c.id) ? '<span class="t-dbadge fit">fits</span>' : ''}
      ${at ? `<span class="cat-inplan-badge">in ${esc(termLabel(at))}</span>` : ''}</div>
      <div class="cat-card-title">${esc(c.title)}</div>
      <div class="cat-card-reqs"><span><b>Prereqs:</b> ${esc(pre)}</span><span><b>Offered:</b> ${off ? esc(off.terms.map(s => SEASON[s]).join(', ')) : 'unknown'}</span>${data}</div>
      <div class="cat-card-acts">${slot ? '' : `<select class="cat-term-sel" data-id="${c.id}" aria-label="Semester">${options}</select>`}
        <button class="btn-cat-add" data-id="${c.id}">${slot ? 'Use for this slot' : (at ? 'Move to semester' : '+ Add to plan')}</button>
        ${c.source && c.source.url ? `<a class="cat-lsu-link" href="${esc(c.source.url)}" target="_blank" rel="noopener">Catalog ↗</a>` : ''}</div></div>`;
  }

  function list() {
    const all = dataset.courses.filter(matches).sort((a, b) => (a.id < b.id ? -1 : 1));
    const host = $(ov, '#cat-list');
    if (!all.length) {
      host.innerHTML = `<div class="cat-empty">${slot && filter === 'fits' ? 'No course in the data is known to fit this slot yet. Choose "All courses" and pick what your advisor approved.' : 'No matching courses.'}</div>`;
      return;
    }
    host.innerHTML = all.slice(0, shown).map(card).join('') + (all.length > shown ? `<button class="btn2" data-more="1">Show more (${all.length - shown} more)</button>` : '');
  }

  $(ov, '#cat-q').addEventListener('input', e => { query = e.target.value.trim(); shown = PAGE; list(); });
  $(ov, '#cat-chips').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; shown = PAGE; chips(); list(); });
  $(ov, '#cat-list').addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { shown += PAGE; list(); return; }
    const b = e.target.closest('.btn-cat-add');
    if (!b) return;
    const sel = $(ov, `.cat-term-sel[data-id="${b.dataset.id}"]`);
    if (sel) target = sel.value;
    opts.onAdd(b.dataset.id, target);
    if (slot) { close(); return; }
    list();
  });
  chips();
  list();
  $(ov, '#cat-q').focus();
  return { close, refresh: list };
}
