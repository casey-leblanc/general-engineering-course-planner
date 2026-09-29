// HTML for every part of the page. Each function takes the render context
//   ctx = { state, dataset, m (the model from model.js), summaries, year, meta, expanded:Set }
// and returns a string; main.js puts it in the page and handles the events (delegated, via data-act attributes).
import { esc, icons } from './dom.js';
import { courseCode } from '../core/tiles.js';
import { describeExpr } from '../core/expr.js';
import { termLabel, termSeason, COMPLETED, canRemoveTerm } from '../core/terms.js';
import { termOf } from '../core/state.js';
import { CAP } from './model.js';

const SEASON_WORD = { F: 'Fall', S: 'Spring', Su: 'Summer' };
const cr = n => `${n} ${n === 1 ? 'credit' : 'credits'}`;

/* ---------------------------------------------------------------- words for rules, pools and requirements */

const ATTR_WORDS = { 'senior-design': 'senior design courses', design: 'design elective courses', 'gen-ed': 'general education courses', ilc: 'integrated learning core courses', stem: 'STEM courses', 'gen-ed:life-science': 'life science gen-ed courses' };

export function requirementLabel(dataset, id) {
  const p = dataset.program(id.split('/')[0]);
  if (!p) return id;
  let found = null;
  (function walk(n) { if (n.id === id) found = n; (n.items || []).forEach(walk); })(p.requirements);
  if (!found) return id;
  return `${p.name}: ${found.label || (found.course ? courseCode(found.course) : id.split('/').slice(1).join(' / '))}`;
}

export function describePool(pool) {
  if (Array.isArray(pool)) return pool.map(describePool).join(' or ');
  if (pool.any) return 'any course';
  if (pool.courses && !pool.attrs && !pool.subject && !pool.level) return pool.courses.map(courseCode).join(', ');
  const words = [];
  if (pool.subject) words.push(pool.subject);
  if (pool.level) words.push(pool.level.max ? (pool.level.min % 1000 === 0 && pool.level.max - pool.level.min === 999 ? `${pool.level.min}-level` : `${pool.level.min}-${pool.level.max}-level`) : `${pool.level.min}+ level`);
  const a = (pool.attrs || []).map(x => ATTR_WORDS[x] || `${x.replace(/[:-]/g, ' ')} courses`);
  const base = `${words.join(' ')}${words.length && a.length ? ' ' : ''}${a.join(' and ')}` || 'courses';
  return pool.courses ? `${pool.courses.map(courseCode).join(', ')} or ${base}` : (a.length ? base : `${base} courses`);
}

export function ruleText(r, dataset) {
  switch (r.type) {
    case 'equivalent': return `${courseCode(r.course)} counts as ${courseCode(r.satisfies)}${r.condition ? ` (${conditionText(r.condition)})` : ''}.`;
    case 'substitute': return `${requirementLabel(dataset, r.requirement)} accepts ${describePool(r.accepts)}.`;
    case 'noSubstitute': return `${requirementLabel(dataset, r.requirement)} does not accept ${describePool(r.rejects)}.`;
    case 'enrollment': return `${courseCode(r.course)}: ${r.effect === 'block' ? 'not open to' : 'enrollment warning for'} ${conditionText(r.deniedIf || r.allowedIf)}.`;
    case 'waivePrereq': return `The ${r.prereq === '*' ? 'prerequisites' : `${courseCode(r.prereq)} prerequisite`} of ${courseCode(r.course)} ${r.prereq === '*' ? 'are' : 'is'} waived.`;
    case 'waive': return `${requirementLabel(dataset, r.requirement)} is waived.`;
    case 'grant': return `${courseCode(r.course)} is credited (${r.via}).`;
    case 'offering': return `${courseCode(r.course)} is offered in ${r.terms.map(t => SEASON_WORD[t]).join(', ')}.`;
    case 'exclusive': return `Credit is not given for more than one of ${r.courses.map(courseCode).join(', ')}.`;
    case 'advisory': return r.message;
    default: return r.note || r.id;
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function conditionText(c) {
  const bits = [];
  if (c.majors) {
    if (c.majors.hasOnly) bits.push(`only when ${c.majors.hasOnly.join('/')} is your only major`);
    if (c.majors.hasAny) bits.push(`when you are in ${c.majors.hasAny.join(' or ')}`);
    if (c.majors.hasAll) bits.push(`when you are in ${c.majors.hasAll.join(' and ')}`);
  }
  if (c.creditFromOtherProgram) bits.push('when the course is credited toward a different program');
  if (c.viaAP) bits.push('when earned through AP');
  if (c.entryYear) bits.push(`for students entering ${c.entryYear.from}${c.entryYear.to ? `-${c.entryYear.to}` : '+'}`);
  return bits.join('; ');
}

const CONF = { confirmed: ['confirmed', 'The advisor confirmed this in writing.'], reported: ['reported', 'Reported second-hand; worth confirming.'], unverified: ['unverified', 'Not confirmed by anyone yet.'] };

export function ruleCard(r, dataset, { mine = false } = {}) {
  const [word, hint] = CONF[r.confidence] || CONF.unverified;
  return `<div class="rule-card">
    <div class="rule-h"><span class="rule-conf ${word}" title="${esc(hint)}">${word}</span><span class="rule-text">${esc(ruleText(r, dataset))}</span></div>
    <div class="rule-src">${esc(r.source.label)} · ${esc(r.source.recordedOn)}${mine ? ' · your own rule' : ''}</div>
    ${r.note && r.type !== 'advisory' ? `<div class="rule-note">${esc(r.note)}</div>` : ''}
    ${(r.openQuestions || []).map(q => `<div class="rule-open"><b>Open question:</b> ${esc(q)}</div>`).join('')}
  </div>`;
}

/* ---------------------------------------------------------------- top bar and programs card */

export function progressBar(ctx) {
  const { totals, target } = ctx.m;
  const pct = v => Math.min(100, Math.round((v / target) * 100));
  return { done: totals.done, target, donePct: pct(totals.done), planPct: pct(totals.total) };
}

export function programsCard(ctx) {
  const { m, summaries, year, meta } = ctx;
  const opts = ctx.yearNames.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${esc(ctx.manifestYears[y].label)}</option>`).join('');
  const chips = ctx.state.programs.map(id => {
    const s = summaries.find(x => x.id === id);
    const pr = m.byProgram[id];
    const color = pr ? pr.color : '#888';
    const name = s ? s.name : id;
    const tracks = s && s.tracks
      ? `<select class="track-select" data-act="track" data-id="${id}" aria-label="Track for ${esc(name)}">${s.tracks.map(t => {
        const sel = (ctx.state.tracks[id] || (s.tracks.find(x => x.default) || s.tracks[0]).id) === t.id;
        return `<option value="${t.id}"${sel ? ' selected' : ''}>${esc(t.name)} track</option>`;
      }).join('')}</select>` : '';
    return `<div class="prog-chip" style="--pc:${color}">
      <span class="dot"></span>
      <span class="pname">${esc(name)}${s && s.degree ? ` <em>${esc(s.degree)}</em>` : ''}${s && !s.verified ? ' <span class="unv" title="Built from a flowchart or the previous planner, not yet checked against the catalog">unverified</span>' : ''}</span>
      ${tracks}
      <button class="chip-x" data-act="remove-program" data-id="${id}" title="Remove this program" aria-label="Remove ${esc(name)}">${icons.close}</button>
    </div>`;
  }).join('');
  const meters = m.programs.map(p => {
    const total = p.program.totalCredits || Math.max(1, p.audit.summary.creditsComplete + p.audit.summary.creditsPlanned + p.audit.summary.creditsMissing);
    const done = p.audit.summary.creditsComplete, planned = done + p.audit.summary.creditsPlanned;
    const w = v => Math.min(100, Math.round((v / total) * 100));
    return `<div class="dual-meter">
      <div class="meter-head"><span class="meter-name"><span class="t-prog-badge mini" style="--pc:${p.color}">${esc(p.label)}</span> ${esc(p.program.name)}</span><b class="meter-val">${Math.min(done, total)} / ${total} cr</b></div>
      <div class="meter-bar-track"><div class="meter-bar-fill plan" style="width:${w(planned)}%;--pc:${p.color}"></div><div class="meter-bar-fill" style="width:${w(done)}%;--pc:${p.color}"></div></div>
    </div>`;
  }).join('');
  return `
    <div class="major-config-row"><label for="year-select" class="major-lbl">Catalog year</label>
      <select id="year-select" class="major-select" data-act="year">${opts}</select></div>
    <div class="major-config-row"><span class="major-lbl">Programs</span>
      <div class="prog-list">${chips || '<span class="faint">No program selected</span>'}</div>
      <button class="add-program-btn" data-act="add-program">${icons.plus}Add a major or minor</button></div>
    ${meters ? `<div class="dual-prog-wrap">${meters}</div>` : ''}
    ${meta && meta.rulesAsOf ? `<div class="faint small">Advisor rules as of ${esc(meta.rulesAsOf)}</div>` : ''}`;
}

export function notice(ctx) {
  const st = ctx.meta && ctx.meta.stats;
  if (!st || st.verified >= st.courses) return '';
  return `<div class="notice" role="note"><b>Course data is partly unverified.</b>
    ${st.verified} of ${st.courses} course records for ${esc(ctx.manifestYears[ctx.year].label)} are checked against LSU. The rest come from last year's planner or the official flowcharts, so prerequisites and offering terms may be out of date.
    <button class="linklike" data-act="data-info">What does that mean?</button></div>`;
}

/* ---------------------------------------------------------------- ledger */

function diffBadge(d) {
  return d === 'hardest' ? '<span class="t-dbadge most" title="Very difficult">very difficult</span>' : d === 'hard' ? '<span class="t-dbadge avg" title="Difficult">difficult</span>' : '';
}

function badgesFor(ctx, id) {
  const list = ctx.m.counts.get(id) || [];
  const shown = ctx.m.programs.length > 1 || ctx.m.programs.some(p => p.program.kind === 'minor');
  if (!shown || !list.length) return '';
  const seen = new Map();
  for (const c of list) if (!seen.has(c.program)) seen.set(c.program, c);
  return [...seen.values()].map(c => {
    const p = ctx.m.byProgram[c.program];
    const special = c.demand.via.length || c.demand.assigned || c.demand.sharedFrom;
    return `<button class="t-prog-badge${special ? ' ruled' : ''}" style="--pc:${p.color}" data-act="why" title="How this counts toward ${esc(p.program.name)}">${esc(p.label)}${special ? '<i>§</i>' : ''}</button>`;
  }).join('');
}

export function whyHtml(ctx, id) {
  const t = ctx.m.tile(id);
  const list = ctx.m.counts.get(id) || [];
  if (!list.length) return `<div class="why"><b>${esc(t.code)}</b> is not used by any requirement yet.</div>`;
  const rows = list.map(c => {
    const p = ctx.m.byProgram[c.program];
    const d = c.demand;
    const rules = d.via.map(rid => ctx.m.rules.find(r => r.id === rid)).filter(Boolean);
    return `<div class="why-row"><div><span class="t-prog-badge" style="--pc:${p.color}">${esc(p.label)}</span> <b>${esc(p.program.name)}</b>: ${esc(requirementLabel(ctx.dataset, d.id).split(': ').slice(1).join(': ') || d.label)}</div>
      ${d.sharedFrom ? `<div class="faint">A placeholder from ${esc(ctx.dataset.program(d.sharedFrom).name)}; whatever you choose for it will count here too.</div>` : ''}
      ${d.assigned ? '<div class="faint">You chose this course for the requirement.</div>' : ''}
      ${rules.map(r => ruleCard(r, ctx.dataset)).join('')}</div>`;
  }).join('');
  return `<div class="why"><div class="why-h">Counts toward</div>${rows}</div>`;
}

function requisiteHtml(rec, which) {
  const expr = rec[which], textKey = which === 'prereq' ? 'prereqText' : 'coreqText';
  if (rec.parse === 'unknown') return '<i>not obtained yet</i>';
  if (!expr && !rec[textKey]) return 'None';
  const own = describeExpr(expr);
  return esc(own || rec[textKey]) + (rec.parse === 'manual' && rec[textKey] ? ` <i>(as printed: ${esc(rec[textKey])}; needs review)</i>` : '');
}

const DATA_STATE = (rec) => {
  const s = rec.source || {};
  if (s.verified) return `verified (${esc(s.origin)})`;
  if (rec.parse === 'unknown') return 'requisites not obtained yet';
  if (s.origin === 'legacy') return 'unverified (last year\'s planner data)';
  return 'unverified';
};

function tileDetails(ctx, id, t, check) {
  if (t.type === 'slot') {
    const pools = t.info.pools.length ? describePool(t.info.pools) : null;
    return `<div class="r"><b>Placeholder</b> for ${esc(t.code)} (${cr(t.credits)}) in ${esc(ctx.dataset.program(t.info.program).name)}.</div>
      <div class="r"><b>Accepts:</b> ${pools ? esc(pools) : 'a course your program approves'}</div>
      <div class="r"><button class="linklike" data-act="fill">Choose a course for this slot</button></div>`;
  }
  if (t.type === 'custom' || t.type === 'unknown') return '<div class="r warn-note"><b>Not checked:</b> prerequisites and semester availability are not tracked for this course.</div>';
  const rec = t.record;
  const off = ctx.dataset.offered(id);
  const offTxt = off ? `${off.terms.map(s => SEASON_WORD[s]).join(', ')}${off.summer ? ` (summer ${{ MA: 'May-Aug', MJ: 'May-Jun', JA: 'Jul-Aug', BOTH: 'May-Jun or Jul-Aug' }[off.summer]})` : ''} <i>(${esc(off.confidence)})</i>` : '<i>unknown</i>';
  const unmet = check && check.unmet.length ? `<div class="r"><b class="v">Missing:</b> ${esc(check.unmet.join('; '))}</div>` : '';
  const via = check && check.via.length ? `<div class="r"><b>Counted via:</b> ${check.via.map(rid => `<span class="rule-chip" title="${esc(ruleText(ctx.m.rules.find(r => r.id === rid) || { type: 'advisory', message: rid }, ctx.dataset))}">${esc(rid)}</span>`).join(' ')}</div>` : '';
  const enroll = check ? check.enrollment.map(e => `<div class="r warn-note"><b>${e.effect === 'block' ? 'Not allowed' : 'Heads up'}:</b> ${esc(e.note || e.ruleId)}</div>`).join('') : '';
  return `<div class="r"><b${check && !check.pre ? ' class="v"' : ''}>Prerequisites:</b> ${requisiteHtml(rec, 'prereq')}</div>
    <div class="r"><b${check && !check.co ? ' class="v"' : ''}>Corequisites:</b> ${requisiteHtml(rec, 'coreq')}</div>
    <div class="r"><b${check && !check.sem ? ' class="v"' : ''}>Offered:</b> ${offTxt}</div>
    ${unmet}${via}${enroll}
    <div class="r"><b>Data:</b> ${DATA_STATE(rec)}</div>
    ${rec.source && rec.source.url ? `<div class="r cat-link"><a href="${esc(rec.source.url)}" target="_blank" rel="noopener">LSU catalog entry ↗</a></div>` : ''}`;
}

export function renderTile(ctx, id, colKey) {
  const { state, m } = ctx;
  const t = m.tile(id);
  const done = state.done[id] !== undefined;
  const bank = colKey === COMPLETED;
  const check = m.checks[id];
  const bad = check && !check.ok && !done;
  const open = ctx.expanded.has(id);
  const track = ctx.trackInfo;
  const premed = track && track.tags && (track.tags.premed || []).includes(id) ? '<span class="t-premed" title="Required for medical school">Pre-med</span>' : '';
  const badges = badgesFor(ctx, id);
  const diff = diffBadge(t.difficulty);
  const doneBox = bank
    ? `<span class="t-done locked" title="AP / transfer credit counts as completed">${icons.check}</span>`
    : `<button class="t-done${done ? ' on' : ''}" data-act="done" title="${done ? 'Completed. Counts toward your progress' : 'Mark as completed'}" aria-pressed="${done}">${icons.check}</button>`;
  const suggestion = t.type === 'slot' && track && track.labels && track.labels[id];
  const title = t.type === 'slot'
    ? `<button class="t-title editable${t.label ? '' : ' empty'}" data-act="label" title="${t.label ? 'Edit this course' : 'Add the specific course you are using'}"><span class="txt">${t.label ? esc(t.label) : esc(suggestion ? `e.g., ${suggestion}` : 'Add course number / title')}</span>${icons.pencil}</button>`
    : (t.title ? `<div class="t-title">${esc(t.title)}</div>` : '');
  const alt = t.type === 'course' && ctx.alternatives.get(id) ? `<div class="t-alt">or ${ctx.alternatives.get(id).map(courseCode).join(' or ')}</div>` : '';
  const assigned = state.assign[id] ? `<div class="t-assign">Counts as: ${esc(requirementLabel(ctx.dataset, state.assign[id]).split(': ').slice(1).join(': '))}</div>` : '';
  const note = t.note ? `<div class="t-note">${esc(t.note)}</div>` : '';
  const summer = termSeason(colKey) === 'Su' && t.type !== 'course' ? '<div class="sn">Double-check summer offerings</div>' : '';
  const printMeta = `<span class="t-printmeta" aria-hidden="true">${t.difficulty !== 'normal' ? `<span class="pd ${t.difficulty === 'hardest' ? 'most' : 'avg'}">${t.difficulty === 'hardest' ? 'very difficult' : 'difficult'}</span> · ` : ''}${cr(t.credits)}</span>`;
  return `<div class="tile ${bad ? 'bad' : ''} ${t.type}${done ? ' done' : ''}" draggable="true" data-id="${esc(id)}">
    <div class="t-top">${doneBox}<span class="t-code${t.type === 'slot' ? ' cat' : ''}">${esc(t.code)}</span>
      <button class="t-menu" data-act="menu" title="Course actions" aria-label="Actions for ${esc(t.code)}">${icons.menu}</button></div>
    ${title}${alt}
    ${badges || premed || diff ? `<div class="t-diffrow">${badges}${premed}${diff}</div>` : ''}
    ${assigned}${note}${summer}
    <div class="t-creditrow"><span class="t-credits">${cr(t.credits)}</span>
      <button class="t-details-link${open ? ' open' : ''}" data-act="info" aria-expanded="${open}"><span class="lk">${open ? 'Hide details' : 'View details'}</span>${icons.caret}</button></div>
    <div class="t-info${open ? ' open' : ''}">${tileDetails(ctx, id, t, check)}</div>${printMeta}</div>`;
}

export function renderLedger(ctx) {
  const { state, m } = ctx;
  return m.columns.map(col => {
    const bank = col.key === COMPLETED;
    const credits = col.tiles.reduce((t, id) => t + m.tile(id).credits, 0);
    const cap = bank ? null : (termSeason(col.key) === 'Su' ? CAP.summer : CAP.term);
    const allDone = col.tiles.length > 0 && col.tiles.every(id => state.done[id] !== undefined);
    const over = cap !== null && credits > cap && !allDone;
    let nH = 0, nHH = 0;
    for (const id of col.tiles) { const d = m.tile(id).difficulty; if (d === 'hard') nH++; else if (d === 'hardest') nHH++; }
    const counts = bank ? '' : `${nH ? `<span class="tcount avg" title="${nH} difficult course${nH > 1 ? 's' : ''}">${nH}</span>` : ''}${nHH ? `<span class="tcount most" title="${nHH} very difficult course${nHH > 1 ? 's' : ''}">${nHH}</span>` : ''}`;
    const chk = bank
      ? `<span class="t-done term-chk on locked" title="AP / transfer credit always counts as completed">${icons.check}</span>`
      : `<button class="t-done term-chk${allDone ? ' on' : ''}" data-act="termdone" data-key="${col.key}"${col.tiles.length ? '' : ' disabled'} title="${allDone ? 'Uncheck every course in this semester' : 'Mark every course in this semester complete'}" aria-pressed="${allDone}">${icons.check}</button>`;
    const overInfo = over ? `<button class="col-info" data-act="overinfo" data-key="${col.key}" title="Above the recommended credit load">${icons.alert}</button>` : '';
    return `<div class="col${bank ? ' bank' : ''}${over ? ' over' : ''}" data-key="${col.key}">
      <div class="col-h"><div class="col-name">${chk}${esc(termLabel(col.key))}</div>
        ${canRemoveTerm(state.terms, col.key) ? `<button class="col-del" data-act="delterm" data-key="${col.key}" title="Remove this semester" aria-label="Remove ${esc(termLabel(col.key))}">${icons.close}</button>` : ''}
        <div class="col-meta"><span class="col-cr">${cr(credits)}</span>${overInfo}${counts ? `<span class="tcounts">${counts}</span>` : ''}</div></div>
      <div class="col-b">
        ${col.tiles.map(id => renderTile(ctx, id, col.key)).join('') || (bank ? '<div class="faint small pad">Drag AP / transfer credit here</div>' : '')}
        <div class="col-acts-row">
          <button class="col-add col-add-catalog" data-act="add-catalog" data-key="${col.key}" title="Add a course from the catalog">${icons.book}Add from catalog</button>
          <button class="col-add col-add-custom" data-act="add-custom" data-key="${col.key}" title="Add a custom course">${icons.plus}Custom</button>
        </div>
      </div></div>`;
  }).join('');
}

/* ---------------------------------------------------------------- things to review */

export function renderIssues(ctx) {
  const items = ctx.m.issues;
  const problems = items.filter(i => i.type === 'err').length;
  const heads = items.filter(i => i.type !== 'info').length;
  const pill = { cls: heads ? 'bad' : 'clear', text: problems ? `${problems} problem${problems > 1 ? 's' : ''}` : heads ? `${heads} to note` : 'All clear' };
  const icon = t => (t === 'info' ? icons.info : icons.alert);
  const html = items.length
    ? items.map(it => `<div class="iss" ${it.key ? `data-key="${it.key}"` : ''}${it.id ? ` data-id="${esc(it.id)}"` : ''}>
        <span class="ic ${it.type}">${icon(it.type)}</span>
        <span class="tx">${esc(it.title)}<br><span class="w">${esc(it.where)}: ${esc(it.msg)}</span></span></div>`).join('')
    : '<div class="pad faint">No prerequisite, credit load, or semester scheduling problems detected.</div>';
  return { pill, html };
}

/* ---------------------------------------------------------------- degree audit */

function demandName(ctx, d) {
  if (d.kind === 'course') {
    const first = d.courses[0];
    const t = ctx.m.tile(first);
    const alts = d.courses.length > 1 ? d.courses.map(courseCode).join(' or ') : t.code;
    return `${alts}${t.title ? ` (${t.title})` : ''}`;
  }
  const filled = d.course ? ctx.m.tile(d.course) : null;
  return filled ? `${d.label} ← ${filled.code}${filled.title ? ` (${filled.title})` : ''}` : d.label;
}

function demandRow(ctx, d) {
  const via = d.via.length ? d.via.map(rid => `<span class="rule-chip" data-act="rule" data-rule="${esc(rid)}" title="Counted through an advisor rule">rule</span>`).join('') : '';
  const you = d.assigned ? '<span class="rule-chip you" title="You chose this course for the requirement">your choice</span>' : '';
  const shared = d.sharedFrom ? `<span class="rule-chip" title="A placeholder from another program that counts here too">shared</span>` : '';
  const where = termOf(ctx.state, d.course || d.tile);
  let status = '', action = '';
  if (d.status === 'complete') status = `<span class="it-status done">${icons.check} Done (${esc(termLabel(where))})</span>`;
  else if (d.status === 'waived') status = '<span class="it-status done">Waived</span>';
  else if (d.status === 'planned') status = `<button class="it-status planned" data-locate-term="${where}" data-locate-id="${esc(d.course)}" title="Show in ${esc(termLabel(where))}">In ${esc(termLabel(where))}</button>`;
  else if (d.status === 'placeholder') {
    status = `<button class="it-status planned ph" data-locate-term="${where}" data-locate-id="${esc(d.tile)}" title="Show in ${esc(termLabel(where))}">Placeholder, ${esc(termLabel(where))}</button>`;
    action = `<button class="audit-add-quick-btn alt" data-act="fill-demand" data-tile="${esc(d.tile)}" title="Pick the course you will take">Choose course</button>`;
  } else {
    status = '<span class="it-status missing">Missing</span>';
    const addId = d.kind === 'course' ? d.courses[0] : d.id;
    action = `<button class="audit-add-quick-btn" data-add-id="${esc(addId)}" title="Add to your plan">+ Add to plan</button>`;
  }
  return `<div class="audit-item-row ${d.status}"><div class="audit-item-main"><span class="audit-item-name" title="${esc(demandName(ctx, d))}">${esc(demandName(ctx, d))}</span><span class="audit-item-cr">${d.credits} cr</span></div>
    <div class="audit-item-side">${shared}${via}${you}${status}${action}</div></div>`;
}

const CARD_PILL = {
  complete: ['good', 'Fulfilled'], waived: ['good', 'Waived'], planned: ['plan', 'In your plan'], placeholder: ['ph', 'Choose courses'], missing: ['warn', 'Needs courses'],
};

function auditCard(ctx, p, node) {
  const rows = p.audit.demands.filter(d => d.path.includes(node.id));
  const missing = rows.filter(d => d.status === 'missing').length;
  const [cls, word] = CARD_PILL[node.status] || CARD_PILL.missing;
  const group = p.audit.groups[node.id];
  const breadth = group ? `<div class="audit-cat-desc">Courses from at least ${group.needed} groups are needed. ${group.covered.length ? `Covered so far: ${esc(group.covered.join('; '))}.` : 'No group covered yet.'}${group.placeholders ? ` ${group.placeholders} placeholder${group.placeholders > 1 ? 's' : ''} not yet chosen.` : ''}</div>` : '';
  const fulfilled = node.status === 'complete' || node.status === 'planned' || node.status === 'waived';
  return `<div class="audit-cat-card ${fulfilled ? 'fulfilled' : 'needs-action'}">
    <div class="audit-cat-h"><div class="audit-cat-name">${esc(node.label)}</div><span class="audit-cat-pill ${cls}">${missing ? `${missing} missing` : word}</span></div>
    ${breadth}<div class="audit-items-list">${rows.map(d => demandRow(ctx, d)).join('')}</div></div>`;
}

export function renderAudit(ctx) {
  const { m } = ctx;
  let complete = 0, planned = 0, placeholder = 0, missing = 0;
  for (const p of m.programs) { const s = p.audit.summary; complete += s.complete + s.waived; planned += s.planned; placeholder += s.placeholder; missing += s.missing; }
  const pill = missing
    ? { cls: 'pending', text: `${missing} missing requirement${missing > 1 ? 's' : ''}` }
    : placeholder ? { cls: 'pending', text: `${placeholder} still to choose` } : { cls: 'all-clear', text: m.programs.length ? '✓ All requirements satisfied' : 'Add a program to see its requirements' };
  const count = `<b>${complete}</b> Completed · <b>${planned}</b> Planned · <b>${placeholder}</b> To choose · <b${missing ? ' class="bad"' : ''}>${missing}</b> Missing`;
  const body = m.programs.map(p => {
    const kids = p.audit.tree.children || [];
    const leaves = kids.filter(k => !k.children && k.type !== 'distinctGroups');
    const cards = [];
    if (leaves.length) {
      const rows = p.audit.demands.filter(d => leaves.some(k => d.path.includes(k.id)));
      const worst = leaves.reduce((w, k) => (['missing', 'placeholder', 'planned', 'complete'].indexOf(k.status) < ['missing', 'placeholder', 'planned', 'complete'].indexOf(w) ? k.status : w), 'complete');
      const [cls, word] = CARD_PILL[worst];
      const miss = rows.filter(d => d.status === 'missing').length;
      cards.push(`<div class="audit-cat-card ${worst === 'missing' || worst === 'placeholder' ? 'needs-action' : 'fulfilled'}"><div class="audit-cat-h"><div class="audit-cat-name">Requirements</div><span class="audit-cat-pill ${cls}">${miss ? `${miss} missing` : word}</span></div><div class="audit-items-list">${rows.map(d => demandRow(ctx, d)).join('')}</div></div>`);
    }
    for (const k of kids.filter(x => x.children || x.type === 'distinctGroups')) cards.push(auditCard(ctx, p, k));
    const sum = p.program.staleness ? `<div class="audit-cat-desc stale">${esc(p.program.staleness)}</div>` : '';
    const notes = (p.program.notes || []).map(n => `<div class="audit-cat-desc">${esc(n)}</div>`).join('');
    return `<div class="audit-report"><div class="audit-report-title"><h3><span class="t-prog-badge" style="--pc:${p.color}">${esc(p.label)}</span> ${esc(p.program.name)}${p.program.degree ? ` (${esc(p.program.degree)}` : ''}${p.program.totalCredits ? `${p.program.degree ? ', ' : ' ('}${p.program.totalCredits} cr)` : p.program.degree ? ')' : ''}</h3></div>${sum}${notes}<div class="audit-cats-grid">${cards.join('')}</div></div>`;
  }).join('');
  return { pill, count, body: body || '<div class="faint pad">Choose at least one major or minor above.</div>' };
}

/* ---------------------------------------------------------------- rules panel */

export function renderRules(ctx) {
  const mineIds = new Set(ctx.state.rules.map(r => r.id));
  const shared = ctx.m.ruleset.active.filter(r => !mineIds.has(r.id));
  const mine = ctx.state.rules;
  const list = shared.length
    ? shared.map(r => ruleCard(r, ctx.dataset)).join('')
    : '<div class="faint pad">No advisor rules apply to the programs you selected.</div>';
  const own = mine.length
    ? mine.map(r => `<div class="rule-wrap">${ruleCard(r, ctx.dataset, { mine: true })}<button class="rule-del" data-act="delete-rule" data-id="${esc(r.id)}" title="Remove this rule" aria-label="Remove rule">${icons.trash}</button></div>`).join('')
    : '<div class="faint pad">You have not added any. Use this for something only your own advisor approved, such as a substitution or a waived prerequisite.</div>';
  return `
    <div class="rules-intro">Some facts that decide what counts are not in the catalog: they come from advisors and departments. They are kept as rules with a source and a confidence, they never change the course data, and anything they change is marked with <span class="rule-chip">rule</span> in your plan.</div>
    <h4 class="rules-h">Advisor rules that apply to you <span class="faint">(${shared.length})</span></h4>
    <div class="rules-list">${list}</div>
    <h4 class="rules-h">Your own rules <span class="faint">(${mine.length})</span></h4>
    <div class="rules-list">${own}</div>
    <div class="rules-acts"><button class="btn2 primary" data-act="add-rule">Add a rule</button><button class="btn2" data-act="export-rules">Export</button><button class="btn2" data-act="import-rules">Import</button>
      <input type="file" id="rules-file" accept=".json" hidden></div>`;
}
