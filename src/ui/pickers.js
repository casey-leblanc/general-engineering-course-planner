// Dialogs for choosing things: a program to add, and a personal rule to create.
import { esc } from './dom.js';
import { dialog } from './components.js';
import { courseCode } from '../core/tiles.js';
import { validateRule } from '../core/schema.js';

/* ---------------------------------------------------------------- add a major or minor */

export function programPicker({ summaries, selected, onPick }) {
  const groupsOf = list => {
    const out = new Map();
    for (const p of list) {
      const key = p.kind === 'minor' ? 'Minors' : (p.group || 'Majors');
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(p);
    }
    const rank = k => (k === 'Majors' ? 0 : k === 'Minors' ? 2 : 1);
    return [...out.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  };
  const { root, close } = dialog({
    title: 'Add a major or minor', wide: true,
    body: `<div class="field"><label for="pp-q">Search programs</label><input id="pp-q" type="search" placeholder="e.g., Computer Science, Robotics, B.S.E.E." autocomplete="off"></div>
      <div class="pp-list" id="pp-list"></div>
      <div class="faint small">Adding a program only needs its data file, so more will appear here over time. Programs marked <span class="unv">unverified</span> were built from a flowchart or last year's planner and have not been checked against the catalog.</div>`,
    buttons: [{ label: 'Close', cancel: true }],
  });
  const draw = () => {
    const q = root.querySelector('#pp-q').value.trim().toLowerCase();
    const list = summaries.filter(p => !q || `${p.name} ${p.variant || ''} ${p.degree || ''} ${p.id} ${p.group || ''}`.toLowerCase().includes(q));
    root.querySelector('#pp-list').innerHTML = groupsOf(list).map(([g, items]) => `<div class="pp-group"><div class="pp-gh">${esc(g)}</div>${items.map(p => `
      <div class="pp-row"><div class="pp-name"><b>${esc(p.variant ? `${p.group}: ${p.variant}` : p.name)}</b> <span class="faint">${esc(p.degree || '')}${p.totalCredits ? ` · ${p.totalCredits} cr` : ''}</span>
        ${p.verified ? '' : '<span class="unv">unverified</span>'}${p.staleness ? `<div class="faint small">${esc(p.staleness)}</div>` : ''}</div>
        <button class="btn2 ${selected.includes(p.id) ? '' : 'primary'}" data-id="${p.id}"${selected.includes(p.id) ? ' disabled' : ''}>${selected.includes(p.id) ? 'Added' : 'Add'}</button></div>`).join('')}</div>`).join('') || '<div class="faint pad">No program matches.</div>';
  };
  root.querySelector('#pp-q').addEventListener('input', draw);
  root.querySelector('#pp-list').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b || b.disabled) return; close(); onPick(b.dataset.id); });
  draw();
}

/* ---------------------------------------------------------------- personal rules */

const TYPES = [
  { id: 'equivalent', label: 'A course counts as another course', help: 'For prerequisites and requirements, for example when an advisor accepts MATH 2090 in place of MATH 2070.' },
  { id: 'substitute', label: 'A course counts for a requirement', help: 'An approved course for one requirement, such as a technical elective.' },
  { id: 'waivePrereq', label: 'Skip a prerequisite', help: 'An advisor approved taking a course without one of its prerequisites.' },
  { id: 'waive', label: 'Waive a requirement', help: 'A requirement that does not apply to you.' },
];

const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '');
const today = () => new Date().toISOString().slice(0, 10);

/** requirement nodes of the selected programs that a rule can point at */
function requirementOptions(programs) {
  const out = [];
  for (const p of programs) (function walk(n, depth) {
    if (depth > 0 && (n.type !== 'course' || depth > 1)) out.push({ id: n.id, label: `${p.name}: ${n.label || (n.course ? courseCode(n.course) : n.id.split('/').slice(1).join(' / '))}` });
    (n.items || []).forEach(c => walk(c, depth + 1));
  })(p.requirements, 0);
  return out;
}

export function ruleDialog({ dataset, programs, catalogYear, existingIds, onSave }) {
  const reqs = requirementOptions(programs);
  const reqSelect = id => `<select id="${id}">${reqs.map(r => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('')}</select>`;
  const ids = dataset.courses.map(c => `<option value="${c.id}">${esc(courseCode(c.id))} ${esc(c.title)}</option>`).join('');
  const { root } = dialog({
    title: 'Add your own rule', wide: true,
    body: `<datalist id="dl-courses">${ids}</datalist>
      <div class="field"><label for="r-type">What did your advisor approve?</label><select id="r-type">${TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select><div class="faint small" id="r-help"></div></div>
      <div id="r-fields"></div>
      <div class="field"><label for="r-note">Note <span class="faint">(who approved it and when helps)</span></label><input id="r-note" maxlength="200" type="text" placeholder="e.g., approved by my advisor, email of 2026-10-02"></div>
      <p class="field-err" id="r-err"></p>
      <div class="faint small">Personal rules stay in your browser and in links you share. They do not change the course data or anyone else's plan, and they are always shown as your own.</div>`,
    buttons: [
      { label: 'Cancel', cancel: true },
      {
        label: 'Add rule', primary: true,
        action: ov => {
          const type = ov.querySelector('#r-type').value;
          const v = id => { const e = ov.querySelector(`#${id}`); return e ? e.value : ''; };
          const rule = { id: `me-${Date.now().toString(36)}`, type, scope: { catalogYears: [catalogYear] }, confidence: 'unverified', source: { kind: 'student', label: 'Student (own advisor)', recordedOn: today() } };
          if (v('r-note').trim()) rule.note = v('r-note').trim();
          if (type === 'equivalent') Object.assign(rule, { course: norm(v('r-a')), satisfies: norm(v('r-b')) });
          if (type === 'substitute') Object.assign(rule, { requirement: v('r-req'), accepts: { courses: [norm(v('r-a'))] } });
          if (type === 'waivePrereq') Object.assign(rule, { course: norm(v('r-a')), prereq: norm(v('r-b')) || '*' });
          if (type === 'waive') Object.assign(rule, { requirement: v('r-req') });
          while (existingIds.includes(rule.id)) rule.id += 'x';
          const errs = validateRule(rule);
          const err = ov.querySelector('#r-err');
          if (errs.length) { err.textContent = `Check the course codes (like EE 2120): ${errs[0].message}`; err.classList.add('show'); return false; }
          onSave(rule);
        },
      },
    ],
  });
  const fields = () => {
    const t = root.querySelector('#r-type').value;
    root.querySelector('#r-help').textContent = TYPES.find(x => x.id === t).help;
    const course = (id, label) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" list="dl-courses" type="text" placeholder="e.g., EE 2120" autocomplete="off"></div>`;
    root.querySelector('#r-fields').innerHTML = {
      equivalent: `${course('r-a', 'This course')}${course('r-b', 'counts as')}`,
      substitute: `${course('r-a', 'This course')}<div class="field"><label for="r-req">counts for</label>${reqSelect('r-req')}</div>`,
      waivePrereq: `${course('r-a', 'For this course')}${course('r-b', 'skip this prerequisite <span class="faint">(leave empty to skip all of them)</span>')}`,
      waive: `<div class="field"><label for="r-req">This requirement does not apply</label>${reqSelect('r-req')}</div>`,
    }[t];
  };
  root.querySelector('#r-type').addEventListener('change', fields);
  fields();
}
