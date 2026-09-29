// A combined flowchart for an advisor to double-check: every course of the selected programs by semester, which program each counts
// toward, and exactly which advisor rules were used to combine them (with their source and open questions).
//
//   node tools/plans/advisor-sheet.mjs [--programs BE-BSBE,EE-BSEE] [--out <file>]
//        the plan for a student starting out (the pre-computed one when there is one)
//   node tools/plans/advisor-sheet.mjs --programs BE-BSBE,EE-BSEE --progress <progress.json> [--no-grades] [--name "Student"]
//        the same flowchart filled in with the student's own progress: completed courses (term and grade), the semester in progress,
//        AP / transfer credit, and the remaining courses arranged after them. See src/core/progress.js for the file format.
//
// This is the table-style sheet (HTML). The drawn flowchart in the college's format is tools/plans/flowchart.mjs; both are built
// from prepare() and explain() below.
// Output goes to .catalog-cache/exports/ (local only, never committed). Personal progress files belong in .catalog-cache/personal/.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, root, YEAR } from '../../tests/helpers/data.mjs';
import { recommend } from '../../src/core/plan.js';
import { emptyState, studentOf, applyRecommended, planKey } from '../../src/core/state.js';
import { buildScenario } from '../../src/core/scenario.js';
import { derive } from '../../src/ui/model.js';
import { ruleText, requirementLabel } from '../../src/ui/view.js';
import { termLabel, termPos, COMPLETED } from '../../src/core/terms.js';
import { extraRecords, applyProgress, doneMap, termsAfter, realTermLabel } from '../../src/core/progress.js';
import { solveScenario } from './solve.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const yearLabel = YEAR.replace(/^(\d{4})-(\d{2})(\d{2})$/, '$1-$3');

/** The state, plan and audit the sheet is drawn from. */
export async function prepare({ programs, progress, seconds }) {
  const extra = progress ? extraRecords(progress, YEAR) : { courses: [], overlay: {} };
  const dataset = await loadDataset({ extraCourses: extra.courses, extraOverlay: extra.overlay });
  const state = emptyState({ catalogYear: YEAR, programs });
  if (progress) applyProgress(state, progress);
  const done = progress ? doneMap(progress) : {};
  const student = studentOf(state, dataset);

  let presets = {};
  try { presets = JSON.parse(await readFile(path.join(root, 'data', YEAR, 'presets.json'), 'utf8')).presets; } catch (e) { /* none */ }
  const preset = !progress && presets[planKey(state)];
  const fresh = recommend({ dataset, student, done });   // what the merge dropped, and why
  const rec = preset ? { ...preset } : fresh;

  if (progress) {
    const remaining = Object.keys(fresh.placed).filter(id => !(id in done));
    const remainingCredits = remaining.reduce((t, id) => t + (id.includes('/') ? 3 : dataset.credits(id, 3)), 0);
    state.terms = termsAfter(progress, remainingCredits);
    state.placed = { ...fresh.placed };
    state.assign = { ...fresh.assign };
    const last = Math.max(...progress.courses.filter(c => c.term !== COMPLETED).map(c => termPos(c.term)));
    const closed = state.terms.filter(t => t !== COMPLETED && termPos(t) <= last);   // semesters that are over or under way
    // the ruleset must know where each course already counts, or "credited from a different major" rules would not apply
    const ruleset = derive(state, dataset).ruleset;
    const sequences = programs.flatMap(p => dataset.program(p).sequences || []);
    const scn = buildScenario({ dataset, ruleset, state, sequences, anchor: fresh.placed, closed });
    const res = await solveScenario(scn, { seconds });
    if (res.status !== 'optimal') throw new Error(`could not arrange the remaining courses: ${res.status} ${res.reason || ''}`);
    Object.assign(state.placed, res.placements);
  } else {
    applyRecommended(state, rec);
  }
  const m = derive(state, dataset, { recommendedCredits: rec.credits });
  return { dataset, state, m, fresh, done };
}

/** "Fall 2026" for a semester key when the student's calendar is known, else the generic "Year 2 Fall". */
export const termNamer = progress => {
  const calendar = progress && progress.calendar;
  return key => (calendar && realTermLabel(key, calendar)) || termLabel(key);
};

/** 'completed' | 'in progress' | 'planned' for one semester column of a student's plan; '' without progress or courses. */
export function columnState(progress, col) {
  if (!progress || !col.tiles.length) return '';
  const byId = new Map(progress.courses.map(c => [c.id, c]));
  const st = col.tiles.map(id => (byId.get(id) ? byId.get(id).status : 'planned'));
  if (st.every(s => s === 'completed')) return 'completed';
  if (st.some(s => s === 'in-progress')) return 'in progress';
  return 'planned';
}

/**
 * The words around the flowchart, whichever way it is drawn: what was combined and why, how far along each program is,
 * and what could not be settled.
 * -> { names, usedRules[], ruled[], direct[], attrNotes[], questions[], per[], finish, unapplied[], mapping[] }
 *    ruled / direct: { program, label, by, via[], n, byId }  (a course or slot left out because something else counts instead;
 *    `ruled` needed an advisor rule, `direct` fitted on its own)
 */
export function explain({ dataset, m, fresh, progress }) {
  const names = Object.fromEntries(m.programs.map(p => [p.id, p.program]));
  const byId = new Map((progress ? progress.courses : []).map(c => [c.id, c]));
  const termName = termNamer(progress);

  const usedRules = new Map();
  for (const d of fresh.dropped) for (const rid of (d.reason ? d.reason.via : [])) if (!usedRules.has(rid)) usedRules.set(rid, dataset.rules.find(r => r.id === rid));
  const label = id => m.tile(id).code;
  const grouped = new Map();
  for (const d of fresh.dropped.filter(x => x.reason)) {
    const by = d.reason.by ? `${label(d.reason.by)}${d.reason.by.includes('/') ? ' (slot)' : ''}` : '';
    const key = [d.reason.program, label(d.id), by, d.reason.via.join(',')].join('|');
    const g = grouped.get(key) || { program: d.reason.program, label: label(d.id), by, via: d.reason.via, n: 0, byId: d.reason.by };
    g.n++;
    grouped.set(key, g);
  }
  const rows = [...grouped.values()];
  const attrNotes = [...new Set(rows.filter(g => g.byId && !g.byId.includes('/') && dataset.overlay[g.byId] && Object.values(dataset.overlay[g.byId].attrsEvidence || {}).some(t => /unverified|legacy/i.test(t))).map(g => `${label(g.byId)}: ${Object.values(dataset.overlay[g.byId].attrsEvidence).join('; ')}`))];
  const questions = [...new Set([...usedRules.values()].flatMap(r => r.openQuestions || []))];

  const isIn = d => d.course && byId.get(d.course) && byId.get(d.course).status === 'in-progress';
  const sum = list => list.reduce((t, d) => t + (d.credits || 0), 0);
  const per = m.programs.map(p => {
    const ds = p.audit.demands;
    const completed = sum(ds.filter(d => d.status === 'complete' && !isIn(d)));
    const inProg = sum(ds.filter(d => d.status === 'complete' && isIn(d)));
    const left = sum(ds.filter(d => d.status !== 'complete'));
    const open = ds.filter(d => d.status === 'placeholder').length;
    const text = progress
      ? `${completed} credit hours completed${inProg ? `, ${inProg} in progress` : ''}, ${left} to go${open ? ` (${open} elective or gen-ed slots still to choose)` : ''}`
      : (p.audit.summary.satisfied ? 'all requirements satisfied' : `${open} slots still to choose, ${p.audit.summary.missing} missing`);
    return { id: p.id, name: p.program.name, degree: p.program.degree || '', totalCredits: p.program.totalCredits, text, completed, inProgress: inProg, left, open };
  });

  const future = m.columns.filter(c => c.key !== COMPLETED && c.tiles.length && columnState(progress, c) === 'planned');
  const finish = progress && future.length ? `${termName(future[future.length - 1].key)} (${future.length} more semesters after the one in progress, no summers)` : null;
  const unapplied = progress && progress.unapplied ? progress.unapplied : [];
  const mapping = progress ? progress.courses.filter(c => c.note && c.term !== COMPLETED).map(c => ({ code: m.tile(c.id).code, note: c.note })) : [];

  return {
    names, usedRules: [...usedRules.values()], ruled: rows.filter(g => g.via.length), direct: rows.filter(g => !g.via.length),
    attrNotes, questions, per, finish, unapplied, mapping,
  };
}

export async function buildSheet({ programs = ['EE-BSEE', 'BE-BSBE'], progress = null, showGrades = true, name = null, today = new Date().toLocaleDateString('en-CA'), seconds = 45 } = {}) {
  const { dataset, m, fresh } = await prepare({ programs, progress, seconds });
  const ex = explain({ dataset, m, fresh, progress });
  const { names } = ex;
  const byId = new Map((progress ? progress.courses : []).map(c => [c.id, c]));
  const termName = termNamer(progress);

  const status = id => {
    const p = byId.get(id);
    if (!p) return '';
    if (p.status === 'in-progress') return '<span class="st ip">in progress</span>';
    const kind = p.term === COMPLETED ? { AP: 'AP', transfer: 'transfer', placement: 'test credit', other: 'credit' }[p.grant || 'AP'] : null;
    return `<span class="st ok">&#10003;${kind ? ` ${esc(kind)}` : ''}${showGrades && p.grade ? ` &middot; ${esc(p.grade)}` : ''}</span>`;
  };
  const cell = id => {
    const t = m.tile(id);
    const counts = m.counts.get(id) || [];
    const badges = counts.map(c => { const p = m.byProgram[c.program]; const special = c.demand.via.length || c.demand.sharedFrom; return `<span class="b" style="--pc:${p.color}">${esc(p.label)}${special ? '&nbsp;&sect;' : ''}</span>`; }).join('');
    const shared = counts.filter(c => c.demand.sharedFrom || c.demand.via.length).map(c => `also counts for ${esc(names[c.program].name)}: ${esc(requirementLabel(dataset, c.demand.id).split(': ').slice(1).join(': '))}`);
    const note = byId.get(id) && byId.get(id).note ? `<div class="cs">${esc(byId.get(id).note)}</div>` : '';
    const cls = byId.has(id) ? (byId.get(id).status === 'in-progress' ? 'ip' : 'done') : '';
    return `<div class="c ${t.type} ${cls}"><div class="cc"><b>${esc(t.code)}</b><span>${t.credits} cr</span></div>${t.title ? `<div class="ct">${esc(t.title)}</div>` : ''}<div class="cb">${badges}${status(id)}</div>${shared.length ? `<div class="cs">${shared.join('; ')}</div>` : ''}${note}</div>`;
  };
  const termState = col => columnState(progress, col);
  const cols = m.columns.filter(c => c.tiles.length).map(col => {
    const cr = col.tiles.reduce((t, id) => t + m.tile(id).credits, 0);
    const bank = col.key === COMPLETED;
    const title = bank ? 'AP / transfer / test credit' : termName(col.key);
    const st = termState(col);
    return `<section class="t ${st.replace(' ', '-')}"><h3>${esc(title)} <em>${st ? `${st} &middot; ` : ''}${cr} cr</em></h3>${col.tiles.map(cell).join('')}</section>`;
  }).join('');

  // what was combined, and why
  const row = g => `<tr><td>${esc(names[g.program].name.replace('Engineering', 'Eng.'))}</td><td><b>${esc(g.label)}</b>${g.n > 1 ? ` &times;${g.n}` : ''} is not in the plan</td><td>${esc(g.by)} counts instead</td><td>${g.via.map(rid => esc(rid)).join('<br>') || 'it fits directly'}</td></tr>`;
  const { ruled, direct, usedRules, attrNotes, questions, finish, unapplied, mapping } = ex;
  const per = ex.per.map(p => `<li><b>${esc(p.name)}</b> (${esc(p.degree)}, ${p.totalCredits} cr in the flowchart): ${p.text}</li>`).join('');
  const unappliedHtml = unapplied.length
    ? `<h2>Other credit on the transcript that no requirement uses</h2><p class="small">${unapplied.map(u => `${esc(u.code)} ${esc(u.title)} (${u.credits} cr, ${esc(u.source)})`).join('; ')}.</p>` : '';

  const heading = m.programs.map(p => `${p.program.degree} ${p.program.name}`).join(' + ');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${progress ? 'Progress and plan' : 'Combined flowchart'}: ${esc(m.programs.map(p => p.program.name).join(' + '))}</title>
<style>
  @page{size:letter landscape;margin:.45in;}
  *{box-sizing:border-box}body{font:12px/1.4 system-ui,Segoe UI,Roboto,sans-serif;color:#1c1a26;margin:0;padding:22px;background:#fff}
  h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 6px;border-bottom:2px solid #d8b4fe;padding-bottom:3px}
  .draft{display:inline-block;background:#fef3c7;border:1px solid #fde68a;color:#78350f;font-weight:700;padding:2px 8px;border-radius:5px;font-size:11px;margin-left:8px;vertical-align:middle}
  .sub{color:#55506a;margin:0 0 10px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  .t{border:1px solid #cfc9de;border-radius:8px;padding:6px;break-inside:avoid}.t h3{font-size:12px;margin:0 0 5px;display:flex;justify-content:space-between;gap:6px}.t h3 em{font-style:normal;font-weight:500;color:#55506a;text-align:right}
  .t.completed{background:#f4faf6}.t.in-progress{background:#eff6ff;border-color:#93c5fd}
  .c{border:1px solid #cfc9de;border-radius:6px;padding:4px 6px;margin-bottom:4px;background:#fff}.c.slot{border-style:dashed;background:#faf7fe}.c.done{border-left:3px solid #15803d}.c.ip{border-left:3px solid #2563eb}
  .cc{display:flex;justify-content:space-between;gap:6px}.cc span{color:#55506a;white-space:nowrap}.ct{color:#39354a;font-size:11px}.cs{font-size:11px;color:#5b21b6;margin-top:2px}
  .b{display:inline-block;font:700 11px ui-monospace,monospace;padding:0 4px;border-radius:3px;margin:2px 3px 0 0;color:var(--pc);border:1px solid var(--pc)}
  .st{display:inline-block;font:600 11px system-ui,sans-serif;border-radius:3px;padding:0 5px;margin:2px 3px 0 0}.st.ok{background:#dcfce7;color:#14532d}.st.ip{background:#dbeafe;color:#1e3a8a}
  table{border-collapse:collapse;width:100%;font-size:11.5px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e4e1ec;padding:4px 8px 4px 0}th{color:#55506a;font-weight:600}
  ul{margin:4px 0 0 18px;padding:0}.small{color:#55506a;font-size:11.5px}.rc{border:1px solid #e4e1ec;border-radius:6px;padding:4px 8px;margin:4px 0;font-size:11.5px}
  @media print{body{padding:0}.t,.c{break-inside:avoid}}
</style></head><body>
<h1>${esc(heading)}<span class="draft">${progress ? 'PROGRESS + PLAN, for advisor review' : 'DRAFT for advisor review'}</span></h1>
<p class="sub">${name ? `${esc(name)} &middot; ` : ''}Catalog ${esc(yearLabel)} &middot; one plan for both programs &middot; prepared ${esc(today)} with the LSU Course Planner (a student's planning tool, not an official document).${progress ? ' Completed work and the semester in progress come from the student\'s Workday academic progress report and unofficial transcript.' : ''}</p>
<ul>${per}</ul>
${finish ? `<p class="small"><b>If nothing changes,</b> the last semester of this plan is ${esc(finish)}.</p>` : ''}
<p class="small">${m.programs.map(p => `<span class="b" style="--pc:${p.color}">${esc(p.label)}</span> ${esc(p.program.name)}`).join(' &nbsp; ')} &nbsp; &sect; = counts through an advisor rule or a shared placeholder. Dashed boxes are slots (electives, gen-eds) whose course is not chosen yet.${progress ? ' Green = completed, blue = in progress.' : ''}</p>
<div class="grid">${cols}</div>

<h2>Where the two programs share requirements (please check these)</h2>
<p class="small">Each line is a requirement that the guidance we were given lets the two programs share. The course or slot named is left out of the plan because something else already satisfies it.</p>
<table><thead><tr><th>Program</th><th>Requirement</th><th>Satisfied by</th><th>Rule used</th></tr></thead><tbody>${ruled.map(row).join('')}</tbody></table>
${direct.length ? `<p class="small">${progress ? 'Already satisfied by completed credit or a matching slot' : 'Slots that fit each other directly'} (no special rule): ${direct.map(g => `${esc(g.label)}${g.n > 1 ? ` &times;${g.n}` : ''} &rarr; ${esc(g.by)} (${esc(names[g.program].name.replace(' Engineering', ''))})`).join('; ')}.</p>` : ''}

<h2>The guidance behind it</h2>
${usedRules.map(r => `<div class="rc"><b>${esc(ruleText(r, dataset))}</b><br><span class="small">${esc(r.confidence)} &middot; ${esc(r.source.label)} &middot; ${esc(r.source.recordedOn)}${r.note ? ` &middot; ${esc(r.note)}` : ''}</span></div>`).join('')}
${mapping.length ? `<h2>How credit was mapped</h2><ul>${mapping.map(x => `<li>${esc(x.code)}: ${esc(x.note)}</li>`).join('')}</ul>` : ''}
${unappliedHtml}
<h2>Questions we could not settle</h2>
<ul>${questions.map(q => `<li>${esc(q)}</li>`).join('')}${attrNotes.map(q => `<li>Unverified course attribute used: ${esc(q)}.</li>`).join('')}
<li>Technical elective: the guidance is that any STEM class counts for the BE technical elective, but the definition of STEM was not available, so that elective is still shown as its own slot.</li>${unapplied.length ? '<li>Could any of the transcript credit listed above count as an elective (any class for the BE elective, any STEM class for the BE technical elective)?</li>' : ''}</ul>

<h2>How reliable is the course data?</h2>
<p class="small">The semester structure and credit hours come from the official ${esc(yearLabel)} flowcharts. Prerequisites and offering terms for most courses are carried over from last year's planner data and have not been checked against the ${esc(yearLabel)} catalog, so please treat the order of the remaining courses as a proposal.${progress ? ' The remaining semesters do not include summers; using them would shorten the plan.' : ''}</p>
</body></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const programs = (arg('--programs') || 'EE-BSEE,BE-BSBE').split(',');
  const progressFile = arg('--progress');
  const progress = progressFile ? JSON.parse(await readFile(path.resolve(progressFile), 'utf8')) : null;
  const html = await buildSheet({ programs, progress, showGrades: !process.argv.includes('--no-grades'), name: arg('--name') });
  const out = arg('--out') || path.join(root, '.catalog-cache', 'exports', `${progress ? 'progress' : 'combined'}-flowchart-${programs.join('+')}-${YEAR}.html`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`wrote ${out}`);
}
