// The unified planner: one page for every program. Loads the data, restores (or migrates) the student's plan, and wires the events.
import { el, esc, icons, $, $$ } from './dom.js';
import { loadData } from './data.js';
import { createStore, storage } from './store.js';
import { derive } from './model.js';
import * as view from './view.js';
import { toast, openPop, menuItem, menuLabel, menuSep, infoPop, confirmModal, noteDialog, courseDialog, dialog } from './components.js';
import { openCatalog } from './catalog.js';
import { programPicker, ruleDialog } from './pickers.js';
import { arrange } from './solver.js';
import { emptyState, normalizeState, studentOf, applyRecommended, setPrograms, switchTrack, addMissing, moveTile, addTile, toggleDone, toggleTermDone, deleteTile, addTerm, removeTerm, addCustom, setMeta, assignCourse, fillSlot, planKey, StateError, termOf } from '../core/state.js';
import { recommend, programPlan, planCredits } from '../core/plan.js';
import { buildScenario } from '../core/scenario.js';
import { encodeLink, decodeLink } from '../core/links.js';
import { readLegacyQuery, readLegacyStorage, LEGACY_STORAGE_KEYS, beToV3, fromLegacyBE } from '../core/legacy-links.js';
import { allTerms, canAddTerm, termLabel, COMPLETED } from '../core/terms.js';
import { demandInfo } from '../core/requirements.js';

const app = { data: null, store: null, year: '', dataset: null, model: null, expanded: new Set(), seq: 0, anchors: new Map(), recCredits: new Map(), dragged: null };

/* ---------------------------------------------------------------- context for the views */

function ctxFor(state, dataset, m) {
  const meta = app.data.manifest.years[app.year];
  const alternatives = new Map();
  const tags = { premed: [], 'premed-late-half': [] }, labels = {};
  for (const p of m.programs) {
    (function walk(n) { if (n.course && n.anyOf && n.anyOf.length) alternatives.set(n.course, n.anyOf); (n.items || []).forEach(walk); })(p.program.requirements);
    if (p.program.tracks) {
      const t = programPlan(p.program, state.tracks[p.id]);
      for (const k of Object.keys(t.tags)) (tags[k] = tags[k] || []).push(...t.tags[k]);
      Object.assign(labels, t.labels);
    }
  }
  return {
    state, dataset, m, meta, year: app.year, yearNames: app.data.yearNames, manifestYears: app.data.manifest.years, yearLabel: meta.label,
    summaries: app.data.summaries(app.year), expanded: app.expanded, alternatives, trackInfo: { tags, labels },
  };
}
const ctx = () => ctxFor(app.store.state, app.dataset, app.model);

/* ---------------------------------------------------------------- recommended plans */

async function recommendedFor(state) {
  const key = planKey(state);
  const presets = await app.data.presets(app.year);
  const preset = presets[key];
  if (preset) return { placed: preset.placed, assign: preset.assign, terms: preset.terms, credits: preset.credits, dropped: preset.dropped, source: 'preset' };
  const dataset = await app.data.dataset(app.year, state.programs);
  return { ...recommend({ dataset, student: studentOf(state, dataset), tracks: state.tracks }), source: 'computed' };
}

/** The merged chart arrangement the solver stays close to (not the balanced preset). Cached per selection. */
function anchorFor(state) {
  const key = planKey(state);
  if (!app.anchors.has(key)) {
    const rec = recommend({ dataset: app.dataset, student: studentOf(state, app.dataset), tracks: state.tracks });
    app.anchors.set(key, rec.placed);
    app.recCredits.set(key, rec.credits);
  }
  return app.anchors.get(key);
}

function recommendedCredits(state) {
  const key = planKey(state);
  if (app.recCredits.has(key)) return app.recCredits.get(key);
  if (state.programs.length === 1 && app.dataset) {
    const p = app.dataset.program(state.programs[0]);
    if (p) { const c = planCredits(Object.fromEntries(programPlan(p, state.tracks[p.id]).plan.flatMap(([t, ids]) => ids.map(i => [i, t]))), app.dataset); app.recCredits.set(key, c); return c; }
  }
  return 0;
}

async function loadRecommended({ reset = false, announce = true, keepUndo = false } = {}) {
  const state = app.store.state;
  const rec = await recommendedFor(state);
  app.store.update(s => applyRecommended(s, rec, { reset }), { undo: true, keepUndo });
  app.recCredits.set(planKey(app.store.state), rec.credits);
  if (announce) {
    const n = rec.dropped ? rec.dropped.length : 0;
    toast(n ? `Loaded the recommended plan. Advisor rules removed ${n} duplicate requirement${n > 1 ? 's' : ''}.` : 'Loaded the recommended plan.', 'Undo', undoAction());
  }
  if (rec.source === 'computed' && state.programs.length > 1) autoArrange({ quiet: true, keepUndo });
}

/* ---------------------------------------------------------------- painting */

async function ensureDataset(state) {
  app.dataset = await app.data.dataset(app.year, state.programs);
}

async function refresh() {
  const seq = ++app.seq;
  const state = app.store.state;
  if (!state.programs.every(id => app.dataset && app.dataset.program(id))) {
    try { await ensureDataset(state); } catch (e) { console.error(e); toast('Could not load program data.'); return; }
    if (seq !== app.seq) return;
  }
  app.model = derive(state, app.dataset, { recommendedCredits: recommendedCredits(state) });
  paint();
}

function paint() {
  const c = ctx();
  const { m } = c;
  el('ledger').innerHTML = view.renderLedger(c);
  el('programs-card').innerHTML = view.programsCard(c);
  el('notice').innerHTML = view.notice(c);
  const audit = view.renderAudit(c);
  const pill = el('audit-overall-pill');
  pill.className = `audit-badge-status ${audit.pill.cls}`;
  pill.textContent = audit.pill.text;
  el('audit-summary-count').innerHTML = audit.count;
  el('audit-body').innerHTML = audit.body;
  const iss = view.renderIssues(c);
  el('ipill').className = `p ${iss.pill.cls}`;
  el('ipill').textContent = iss.pill.text;
  el('ib').innerHTML = iss.html;
  el('rules-body').innerHTML = view.renderRules(c);
  const pr = view.progressBar(c);
  el('prog-num').textContent = pr.done;
  el('prog-target').textContent = pr.target;
  el('prog-done').style.width = `${pr.donePct}%`;
  el('prog-plan').style.width = `${pr.planPct}%`;
  el('stamp').textContent = c.meta.rulesAsOf ? `${c.yearLabel} data · advisor rules as of ${c.meta.rulesAsOf}` : `${c.yearLabel} data`;
  updateChevrons();
}

function updateChevrons() {
  const led = el('ledger'), max = led.scrollWidth - led.clientWidth;
  el('sc-left').disabled = led.scrollLeft <= 2;
  el('sc-right').disabled = led.scrollLeft >= max - 2;
}

function setSaved(kind) {
  const chip = el('saved-chip');
  el('saved-indicator').textContent = kind === 'nostore' ? 'Not saved here' : 'Saved';
  chip.classList.toggle('nostore', kind === 'nostore');
}

/* ---------------------------------------------------------------- actions */

const label = id => app.model.tile(id).code || id;

/** an Undo button that only reverts the change it was shown for (not something newer) */
function undoAction() { const t = app.store.token; return () => { if (!app.store.undo(t)) toast('Nothing to undo.'); }; }
function undoToast(msg) { toast(msg, 'Undo', undoAction()); }

function locate(key, id) {
  const led = el('ledger'), col = led.querySelector(`.col[data-key="${key}"]`);
  if (col && col.scrollIntoView) col.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  if (id) {
    const t = [...led.querySelectorAll('.tile')].find(x => x.dataset.id === id);
    if (t) { t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1200); }
  }
}

function bestTermFor(id) {
  const c = app.model.tile(id).credits || 3;
  const load = key => app.model.columns.find(x => x.key === key).tiles.reduce((t, x) => t + app.model.tile(x).credits, 0);
  for (const col of app.model.columns) {
    if (col.key === COMPLETED || col.key.endsWith('summer')) continue;
    if (load(col.key) + c <= 18) return col.key;
  }
  return app.store.state.terms.find(t => t !== COMPLETED && !t.endsWith('summer')) || 'year1-fall';
}

function quickAdd(addId) {
  const term = bestTermFor(addId);
  app.store.update(s => addTile(s, addId, term));
  toast(`Added ${app.model ? label(addId) : addId} to ${termLabel(term)}`, 'Auto-arrange', () => autoArrange());
}

function openTileMenu(anchor, id) {
  const state = app.store.state;
  const t = app.model.tile(id);
  openPop(anchor, (pop, close) => {
    const cur = termOf(state, id);
    menuLabel(pop, 'Move to');
    const sc = document.createElement('div');
    sc.className = 'sc';
    state.terms.forEach(k => {
      if (k === cur) return;
      const b = document.createElement('button');
      b.className = 'it';
      b.textContent = termLabel(k);
      b.onclick = () => { app.store.update(s => moveTile(s, id, k)); close(); toast(`Moved to ${termLabel(k)}`); };
      sc.appendChild(b);
    });
    pop.appendChild(sc);
    menuSep(pop);
    if (t.type === 'slot') menuItem(pop, { label: 'Choose a course for this slot…', icon: icons.book, onClick: () => { close(); chooseForSlot(id); } });
    if (t.type === 'course') menuItem(pop, { label: state.assign[id] ? 'Change what this counts for…' : 'Count this for a requirement…', icon: icons.check, onClick: () => { close(); openAssign(id); } });
    menuItem(pop, { label: t.note ? 'Edit note…' : 'Add note…', icon: icons.note, onClick: () => { close(); noteDialog({ heading: `${t.code}${t.title ? ` — ${t.title}` : ''}`, current: t.note, onSave: v => app.store.update(s => setMeta(s, id, { note: v })) }); } });
    if (t.type === 'custom') menuItem(pop, { label: 'Edit course…', icon: icons.pencil, onClick: () => { close(); editCustom(id); } });
    if (t.type === 'slot') menuItem(pop, { label: 'Edit credits / difficulty…', icon: icons.pencil, onClick: () => { close(); courseDialog({ mode: 'slot', initial: { cr: t.credits, diff: t.difficulty }, onSave: v => app.store.update(s => setMeta(s, id, { cr: v.cr, diff: v.diff })) }); } });
    menuItem(pop, { label: 'Delete from plan', icon: icons.trash, danger: true, onClick: () => { close(); app.store.update(s => deleteTile(s, id), { undo: true }); undoToast(`Removed ${t.code}`); } });
  });
}

function editCustom(id) {
  const c = app.store.state.custom[id];
  courseDialog({
    mode: 'custom', initial: { ...c, note: (app.store.state.meta[id] || {}).note || '' },
    onSave: v => app.store.update(s => { s.custom[id] = { code: v.code, title: v.title, cr: v.cr, diff: v.diff }; setMeta(s, id, { note: v.note }); }),
  });
}

/** placeholder demands (and missing ones) of the selected programs a course could be counted for */
function openAssign(courseId) {
  const anchor = document.querySelector(`.tile[data-id="${CSS.escape(courseId)}"] .t-menu`) || el('ledger');
  const options = [];
  for (const p of app.model.programs) for (const d of p.audit.demands) if (d.kind !== 'course' && (d.status === 'placeholder' || d.status === 'missing')) options.push({ id: d.id, text: `${p.label}: ${d.label}` });
  openPop(anchor, (pop, close) => {
    menuLabel(pop, `Count ${label(courseId)} for`);
    if (!options.length) { const d = document.createElement('div'); d.className = 'pad faint small'; d.textContent = 'Every open requirement is already filled.'; pop.appendChild(d); }
    const sc = document.createElement('div');
    sc.className = 'sc';
    pop.appendChild(sc);
    for (const o of options) { const b = document.createElement('button'); b.className = 'it'; b.textContent = o.text; b.onclick = () => { app.store.update(s => assignCourse(s, courseId, o.id)); close(); toast('Saved. It is marked "your choice" in the audit.'); }; sc.appendChild(b); }
    if (app.store.state.assign[courseId]) menuItem(pop, { label: 'Clear my choice', onClick: () => { app.store.update(s => assignCourse(s, courseId, null)); close(); } });
  });
}

function chooseForSlot(slotId) {
  const c = ctx();
  const info = demandInfo(app.dataset, slotId);
  if (!info) return;
  const program = app.dataset.program(info.program);
  const demand = app.model.programs.flatMap(p => p.audit.demands).find(d => d.id === slotId);
  const accepts = demand ? app.model.ruleset.substitutes(demand.path).flatMap(r => [].concat(r.accepts)) : [];
  openCatalog(c, {
    term: termOf(app.store.state, slotId),
    slot: { id: slotId, label: info.label, pools: info.pools, accepts, programName: program.name },
    onAdd: courseId => { app.store.update(s => fillSlot(s, slotId, courseId), { undo: true }); undoToast(`${courseCodeOf(courseId)} now fills ${info.label}`); },
  });
}
const courseCodeOf = id => app.model.tile(id).code;

function openCatalogFor(term) {
  openCatalog(ctx(), {
    term,
    onAdd: (courseId, target) => {
      const had = termOf(app.store.state, courseId);
      app.store.update(s => (had && s.done[courseId] === undefined ? moveTile(s, courseId, target) : addTile(s, courseId, target)));
      toast(`${had ? 'Moved' : 'Added'} ${courseCodeOf(courseId)} ${had ? 'to' : 'to'} ${termLabel(target)}`);
    },
  });
}

/* ---- programs */

async function addProgram(id) {
  const before = app.store.state;
  const wasPristine = before.pristine || Object.keys(before.placed).length === 0;
  const summary = app.data.summary(app.year, id);
  await app.data.dataset(app.year, [...before.programs, id]);
  app.store.update(s => setPrograms(s, [...s.programs, id]), { undo: true });
  if (wasPristine) { await loadRecommended({ announce: false, keepUndo: true }); toast(`Added ${summary.name}. Loaded the recommended plan for your programs.`, 'Undo', undoAction()); return; }
  const rec = await recommendedFor(app.store.state);
  toast(`Added ${summary.name}. Its requirements are checked now.`, 'Add its courses', () => { app.store.update(s => addMissing(s, rec), { undo: true }); toast('Added the recommended courses that were missing.', 'Auto-arrange', () => autoArrange()); });
}

function removeProgram(id) {
  const s0 = app.store.state;
  if (s0.programs.length <= 1) { toast('Keep at least one program selected.'); return; }
  const summary = app.data.summary(app.year, id);
  app.store.update(s => setPrograms(s, s.programs.filter(p => p !== id)), { undo: true });
  undoToast(`Removed ${summary ? summary.name : id}. Its placeholders are gone; your courses stay.`);
}

async function changeTrack(programId, trackId) {
  const summary = app.data.summary(app.year, programId);
  const isDefault = !!summary.tracks.find(t => t.id === trackId && t.default);
  let restored = false;
  app.store.update(s => { restored = switchTrack(s, programId, trackId, { isDefault }); }, { undo: true });
  if (!restored) await loadRecommended({ announce: false, keepUndo: true });
  const t = summary.tracks.find(x => x.id === trackId);
  undoToast(restored ? `Switched to the ${t.name} track. Your earlier work on it is back.` : `Switched to the ${t.name} track. Loaded its recommended plan; your other track is saved.`);
}

/* ---- terms */

function openAddTermMenu(anchor) {
  const state = app.store.state;
  const options = allTerms(6).filter(k => canAddTerm(state.terms, k));
  openPop(anchor, (pop, close) => {
    menuLabel(pop, options.length ? 'Add a semester' : 'All semesters are already shown');
    const sc = document.createElement('div');
    sc.className = 'sc';
    pop.appendChild(sc);
    for (const k of options) { const b = document.createElement('button'); b.className = 'it'; b.textContent = termLabel(k); b.onclick = () => { app.store.update(s => addTerm(s, k)); close(); scrollToTerm(k); toast(`${termLabel(k)} added`); }; sc.appendChild(b); }
  });
}
function scrollToTerm(key) {
  setTimeout(() => {
    const led = el('ledger'), col = led.querySelector(`.col[data-key="${key}"]`);
    if (!col) return;
    const cr = col.getBoundingClientRect(), lr = led.getBoundingClientRect();
    led.scrollBy({ left: (cr.left - lr.left) - (led.clientWidth - cr.width) / 2, behavior: 'smooth' });
  }, 0);
}

/* ---- auto-arrange */

async function autoArrange({ quiet = false, keepUndo = false } = {}) {
  const btn = el('btn-auto');
  btn.disabled = true; btn.classList.add('busy');
  try {
    const state = app.store.state;
    const m = app.model;
    const sequences = m.programs.flatMap(p => p.program.sequences || []);
    const c = ctx();
    const scn = buildScenario({ dataset: app.dataset, ruleset: m.ruleset, state, sequences, anchor: anchorFor(state), tags: c.trackInfo.tags });
    if (!scn.movable.length) { toast('Nothing to arrange. Every course is already marked complete.'); return; }
    // let the "Arranging…" label paint first; a hidden tab never fires animation frames, so do not wait for them forever
    await new Promise(r => { const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16)); raf(() => raf(r)); setTimeout(r, 80); });
    const res = await arrange(scn);
    if (res.status === 'unavailable') { toast(res.reason); return; }
    if (res.status === 'infeasible') { toast(`Could not fit every course into the semesters you have. ${res.reason || 'Try adding a semester, then auto-arrange again.'}`); return; }
    if (res.status !== 'optimal') { toast(`Auto-arrange hit a snag${res.reason ? `: ${res.reason}` : ''}. Nothing was changed.`); return; }
    app.store.update(s => { for (const id of Object.keys(res.placements)) s.placed[id] = res.placements[id]; s.pristine = false; }, { undo: true, keepUndo });
    if (!quiet) toast('Auto-arranged your plan', 'Undo', undoAction());
  } catch (e) {
    toast(`Auto-arrange failed: ${(e && e.message) || e}`);
  } finally {
    btn.disabled = false; btn.classList.remove('busy');
  }
}

/* ---- sharing, saving, resetting */

function shareLink() {
  const url = `${location.origin}${location.pathname}?s=${encodeLink(app.store.state)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied to clipboard')).catch(() => window.prompt('Copy this link:', url));
  else window.prompt('Copy this link:', url);
}

function resetPlan() {
  confirmModal({
    title: 'Reset plan?', message: 'This clears your arrangement and completed marks and loads the recommended plan for your selected programs. Your personal rules are kept.', confirmText: 'Reset', danger: true,
    onConfirm: async () => {
      if (location.search) history.replaceState(null, '', location.pathname);
      await loadRecommended({ reset: true });
    },
  });
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(app.store.state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'course-plan.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Backup downloaded');
}

function loadBackupText(text) {
  const year = app.year;
  let state = null;
  try {
    const obj = JSON.parse(text);
    if (obj && obj.v === 3 && Array.isArray(obj.programs)) state = normalizeState(obj, { defaultCatalogYear: year }).state;
    else if (obj && obj.plan && obj.major) state = readLegacyStorage('lsuee.v2.state', text, { catalogYear: year }).state;
    else state = readLegacyStorage('becp.v3.state', text, { catalogYear: year }).state;
  } catch (e) {
    try {   // the oldest backup format: <semester id="year1-fall"><course id="BE1251"/></semester>
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (xml.getElementsByTagName('parsererror').length) throw new Error('xml');
      const obj = {};
      for (const s of xml.getElementsByTagName('semester')) { const id = s.getAttribute('id'); if (id) obj[id] = [...s.getElementsByTagName('course')].map(c => c.getAttribute('id')).filter(Boolean); }
      if (!Object.keys(obj).length) throw new Error('empty');
      state = normalizeState(fromLegacyBE(beToV3(obj, null), { catalogYear: year }), { defaultCatalogYear: year }).state;
    } catch (e2) { toast('Could not read that file. Expected a planner backup (.json) or an old .xml course plan.'); return; }
  }
  app.store.replace(state, { arm: true });
  if (location.search) history.replaceState(null, '', location.pathname);
  toast('Backup loaded');
}

/* ---- personal rules */

function rulesExport() {
  const blob = new Blob([JSON.stringify({ schema: 'personal-rules/1', rules: app.store.state.rules }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'my-rules.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function rulesImport(text) {
  try {
    const obj = JSON.parse(text);
    const merged = { ...app.store.state, rules: [...app.store.state.rules, ...(Array.isArray(obj.rules) ? obj.rules : [])] };
    const { state, warnings } = normalizeState(merged, { defaultCatalogYear: app.year });
    const before = app.store.state.rules.length;
    app.store.update(s => { s.rules = state.rules; });
    toast(`Imported ${state.rules.length - before} rule(s)${warnings.length ? `; ${warnings.length} skipped` : ''}`);
  } catch (e) { toast('Could not read that rules file.'); }
}

/* ---------------------------------------------------------------- events */

function wire() {
  const ledger = el('ledger');
  ledger.addEventListener('scroll', updateChevrons, { passive: true });
  window.addEventListener('resize', updateChevrons);
  el('sc-left').onclick = () => ledger.scrollBy({ left: -222, behavior: 'smooth' });
  el('sc-right').onclick = () => ledger.scrollBy({ left: 222, behavior: 'smooth' });

  /* drag and drop with edge auto-scroll */
  ledger.addEventListener('dragstart', e => {
    const t = e.target.closest('.tile');
    if (!t) return;
    app.dragged = t.dataset.id;
    t.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', app.dragged); } catch (_) { /* some browsers refuse */ }
  });
  ledger.addEventListener('dragend', () => { app.dragged = null; $$(ledger, '.tile.drag').forEach(t => t.classList.remove('drag')); $$(ledger, '.col.drop').forEach(c => c.classList.remove('drop')); });
  ledger.addEventListener('dragover', e => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const c = e.target.closest('.col');
    $$(ledger, '.col.drop').forEach(x => { if (x !== c) x.classList.remove('drop'); });
    if (c) c.classList.add('drop');
    const r = ledger.getBoundingClientRect();
    if (e.clientX < r.left + 44) ledger.scrollLeft -= 16; else if (e.clientX > r.right - 44) ledger.scrollLeft += 16;
  });
  ledger.addEventListener('drop', e => { e.preventDefault(); const c = e.target.closest('.col'); if (c && app.dragged) app.store.update(s => moveTile(s, app.dragged, c.dataset.key)); });

  ledger.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const tile = act.closest('.tile');
    const id = tile && tile.dataset.id;
    switch (act.dataset.act) {
      case 'delterm': { const k = act.dataset.key; const r = { moved: 0, target: null }; app.store.update(s => { Object.assign(r, removeTerm(s, k) || {}); }, { undo: true }); undoToast(`Removed ${termLabel(k)}${r.moved ? `; moved ${r.moved} course${r.moved > 1 ? 's' : ''} to ${termLabel(r.target)}` : ''}`); break; }
      case 'overinfo': { const k = act.dataset.key; const col = app.model.columns.find(x => x.key === k); const credits = col.tiles.reduce((t, x) => t + app.model.tile(x).credits, 0); const summer = k.endsWith('summer'); infoPop(act, `<b>${credits} credits planned</b><br>That is above the recommended maximum of ${summer ? 6 : 18} for ${summer ? 'a summer semester' : 'a fall or spring semester'}.`); break; }
      case 'add-catalog': openCatalogFor(act.dataset.key); break;
      case 'add-custom': courseDialog({ mode: 'custom', onSave: v => app.store.update(s => addCustom(s, v, act.dataset.key)) }); break;
      case 'done': app.store.update(s => toggleDone(s, id)); break;
      case 'termdone': app.store.update(s => toggleTermDone(s, act.dataset.key)); break;
      case 'menu': openTileMenu(act, id); break;
      case 'why': infoPop(act, view.whyHtml(ctx(), id)); break;
      case 'fill': chooseForSlot(id); break;
      case 'label': startLabelEdit(tile, id); break;
      case 'info': {
        const open = app.expanded.has(id) ? (app.expanded.delete(id), false) : (app.expanded.add(id), true);
        tile.querySelector('.t-info').classList.toggle('open', open);
        act.classList.toggle('open', open);
        act.querySelector('.lk').textContent = open ? 'Hide details' : 'View details';
        act.setAttribute('aria-expanded', String(open));
        break;
      }
      default: break;
    }
  });

  el('ib').addEventListener('click', e => { const row = e.target.closest('.iss'); if (row && row.dataset.key) locate(row.dataset.key, row.dataset.id); });

  el('audit-toggle-header').onclick = e => { if (e.target.closest('button') && e.target.id !== 'audit-collapse-toggle') return; el('degree-audit-section').classList.toggle('collapsed'); };
  el('rules-toggle-header').onclick = () => el('rules-section').classList.toggle('collapsed');
  el('audit-body').addEventListener('click', e => {
    const add = e.target.closest('.audit-add-quick-btn[data-add-id]');
    if (add) { quickAdd(add.dataset.addId); return; }
    const fill = e.target.closest('[data-act="fill-demand"]');
    if (fill) { chooseForSlot(fill.dataset.tile); return; }
    const loc = e.target.closest('[data-locate-term]');
    if (loc) { locate(loc.dataset.locateTerm, loc.dataset.locateId); return; }
    const rule = e.target.closest('[data-act="rule"]');
    if (rule) { const r = app.model.rules.find(x => x.id === rule.dataset.rule); if (r) infoPop(rule, view.ruleCard(r, app.dataset)); }
  });

  el('programs-card').addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'add-program') programPicker({ summaries: app.data.summaries(app.year), selected: app.store.state.programs, onPick: addProgram });
    if (act.dataset.act === 'remove-program') removeProgram(act.dataset.id);
  });
  el('programs-card').addEventListener('change', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'track') changeTrack(act.dataset.id, act.value);
    if (act.dataset.act === 'year') changeYear(act.value);
  });
  el('notice').addEventListener('click', e => { if (e.target.closest('[data-act="data-info"]')) dataInfo(); });

  el('rules-body').addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'add-rule') ruleDialog({ dataset: app.dataset, programs: app.model.programs.map(p => p.program), catalogYear: app.year, existingIds: app.store.state.rules.map(r => r.id), onSave: r => { app.store.update(s => { s.rules.push(r); s.pristine = false; }); toast('Rule added. It is marked as your own everywhere it applies.'); } });
    if (act.dataset.act === 'delete-rule') { const id = act.dataset.id; app.store.update(s => { s.rules = s.rules.filter(r => r.id !== id); }, { undo: true }); undoToast('Rule removed'); }
    if (act.dataset.act === 'export-rules') rulesExport();
    if (act.dataset.act === 'import-rules') el('rules-file').click();
  });
  el('rules-body').addEventListener('change', e => {
    if (e.target.id !== 'rules-file' || !e.target.files[0]) return;
    const r = new FileReader();
    r.onload = () => rulesImport(r.result);
    r.readAsText(e.target.files[0]);
    e.target.value = '';
  });

  el('btn-share').onclick = shareLink;
  el('btn-print').onclick = () => window.print();
  el('btn-reset').onclick = resetPlan;
  el('btn-auto').onclick = () => autoArrange();
  el('btn-addterm').onclick = function () { openAddTermMenu(this); };
  el('btn-open-catalog').onclick = () => openCatalogFor();
  el('ih').onclick = () => el('issues').classList.toggle('cl');
  el('file-load').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadBackupText(r.result); r.readAsText(f); e.target.value = ''; });
  el('btn-more').onclick = function () {
    openPop(this, (pop, close) => {
      menuItem(pop, { label: 'Download backup (.json)', icon: icons.down, onClick: () => { close(); downloadBackup(); } });
      menuItem(pop, { label: 'Load backup…', icon: icons.up, onClick: () => { close(); el('file-load').click(); } });
      menuSep(pop);
      menuItem(pop, { label: 'About the course data', icon: icons.info, onClick: () => { close(); dataInfo(); } });
    });
  };
  el('btn-preset-plan').onclick = function () {
    openPop(this, (pop, close) => {
      menuLabel(pop, 'Load a plan');
      menuItem(pop, { label: 'Recommended plan for my programs', icon: icons.check, onClick: () => { close(); confirmLoad(); } });
      const flow = app.model.programs.filter(p => p.program.flowchartUrl);
      if (flow.length) menuSep(pop);
      for (const p of flow) {
        const a = document.createElement('a');
        a.className = 'it';
        a.href = p.program.flowchartUrl; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = `Official flowchart: ${p.program.name} ↗`;
        pop.appendChild(a);
      }
    });
  };

  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/input|textarea|select/i.test((e.target.tagName || ''))) { if (app.store.undo()) e.preventDefault(); } });
}

function confirmLoad() {
  const state = app.store.state;
  if (state.pristine || !Object.keys(state.placed).length) { loadRecommended(); return; }
  confirmModal({ title: 'Load the recommended plan?', message: 'This replaces your current arrangement. Courses you marked completed stay marked. You can undo it right after.', confirmText: 'Load plan', onConfirm: () => loadRecommended() });
}

function startLabelEdit(tile, id) {
  const btn = tile.querySelector('[data-act="label"]');
  if (!btn) return;
  const cur = app.store.state.meta[id] || {};
  const inp = document.createElement('input');
  inp.className = 'sub-input'; inp.value = cur.label || ''; inp.maxLength = 80; inp.placeholder = 'e.g., PSYC 2000: Introduction to Psychology';
  btn.replaceWith(inp);
  inp.focus(); inp.select();
  let finished = false;
  const commit = save => { if (finished) return; finished = true; if (save) app.store.update(s => setMeta(s, id, { label: inp.value.trim() })); else paint(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(true); } else if (e.key === 'Escape') { e.preventDefault(); commit(false); } });
  inp.addEventListener('blur', () => commit(true));
}

async function changeYear(name) {
  if (name === app.year) return;
  const state = app.store.state;
  const summaries = app.data.summaries(name);
  const keep = state.programs.filter(id => summaries.some(p => p.id === id));
  if (!keep.length) { toast('None of your programs exist in that catalog year.'); paint(); return; }
  app.year = name;
  app.anchors.clear();
  await app.data.dataset(name, keep);
  app.store.update(s => { s.catalogYear = name; setPrograms(s, keep); }, { undo: true });
  toast(`Switched to the ${app.data.manifest.years[name].label} catalog`);
}

function dataInfo() {
  const st = app.data.manifest.years[app.year].stats;
  dialog({
    title: 'About the course data', wide: true,
    body: `<div class="about-data"><p>For <b>${esc(app.data.manifest.years[app.year].label)}</b> the planner knows ${st.courses} courses. <b>${st.verified}</b> ${st.verified === 1 ? 'is' : 'are'} checked against an LSU source; ${st.legacy} come from last year's hand-typed planner data and ${st.flowchartOnly} appear only on an official flowchart, so their prerequisites are not known yet.</p>
      <p>Program structures (what each degree requires and the recommended semester plan) come from the official <b>2026-27 College of Engineering flowcharts</b>. Everything the planner says is labelled with where it came from, and prerequisites it could not read are reported as <i>not checked</i> rather than treated as "none".</p>
      <p>Advisor guidance is kept separately as <b>rules</b> with a source and a confidence level (see "Advisor and custom rules" below the audit). This planner is an advising aid; the LSU General Catalog and your advisor are the authority.</p></div>`,
    buttons: [{ label: 'Close', primary: true }],
  });
}

/* ---------------------------------------------------------------- start */

async function chooseInitial(data) {
  const params = new URLSearchParams(location.search);
  const year = data.defaultYear;
  let failure = null;
  if (params.get('s')) {
    try { return { state: decodeLink(params.get('s'), { defaultCatalogYear: year }).state, armed: false, failure }; } catch (e) { failure = e instanceof StateError ? e.message : 'This link looks incomplete or damaged.'; }
  } else {
    try { const r = readLegacyQuery(params, { catalogYear: year }); if (r) return { state: r.state, armed: false, failure }; } catch (e) { failure = 'This link looks incomplete or damaged.'; }
  }
  if (!failure) {
    const want = (params.get('programs') || '').split(',').map(x => x.trim()).filter(id => data.summary(year, id));
    const track = params.get('track') === 'premed' ? 'premed' : null;
    if (want.length || track) {
      const programs = want.length ? want : ['BE-BSBE'];
      const tracks = track && programs.includes('BE-BSBE') ? { 'BE-BSBE': track } : {};
      return { state: emptyState({ catalogYear: year, programs, tracks }), armed: false, fresh: true, failure };
    }
    const saved = storage.read();
    if (saved) { try { return { state: normalizeState(JSON.parse(saved), { defaultCatalogYear: year }).state, armed: true, failure }; } catch (e) { console.warn('saved plan unreadable', e); } }
    for (const key of LEGACY_STORAGE_KEYS) {
      const old = storage.readLegacy(key);
      if (!old) continue;
      try { return { state: readLegacyStorage(key, old, { catalogYear: year }).state, armed: true, migrated: true, failure }; } catch (e) { console.warn('old plan unreadable', key, e); }
    }
  }
  return { state: emptyState({ catalogYear: year, programs: data.manifest.years[year].defaultPrograms }), armed: false, fresh: true, failure };
}

async function boot() {
  try {
    app.data = await loadData();
  } catch (e) {
    console.error(e);
    el('ledger').innerHTML = '<div class="pad"><b>The planner could not load its data.</b> Check your connection and reload. If you opened this page as a file, serve it over http (see the documentation).</div>';
    return;
  }
  const init = await chooseInitial(app.data);
  let state = init.state;
  if (!app.data.manifest.years[state.catalogYear]) state = { ...state, catalogYear: app.data.defaultYear };
  app.year = state.catalogYear;
  const known = state.programs.filter(id => app.data.summary(app.year, id));
  if (known.length !== state.programs.length) state = { ...state, programs: known.length ? known : app.data.manifest.years[app.year].defaultPrograms };
  app.dataset = await app.data.dataset(app.year, state.programs);

  app.store = createStore(state, { catalogYear: app.year, onChange: () => refresh(), onSaved: setSaved });
  wire();
  if (init.fresh) {
    const rec = await recommendedFor(app.store.state);
    applyRecommended(app.store.state, rec);
    app.recCredits.set(planKey(app.store.state), rec.credits);
    if (init.armed) app.store.arm();
  }
  if (init.armed) { app.store.arm(); setSaved('saved'); }
  await refresh();
  if (init.migrated) toast('Your saved plan was moved to the new planner.');
  if (init.failure) confirmModal({ alert: true, title: 'This shared link could not be opened', message: `${init.failure} You are seeing the default plan, not the plan that was shared with you. Ask the sender to copy the full link and send it again.`, confirmText: 'OK' });
  if (init.fresh && init.state.programs.length > 1 && app.store.state.pristine && !(await app.data.presets(app.year))[planKey(app.store.state)]) autoArrange({ quiet: true });
  window.plannerApp = app;   // handy for debugging in the console
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
