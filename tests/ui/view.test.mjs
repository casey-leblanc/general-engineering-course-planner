import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDataset, readJson, root, YEAR } from '../helpers/data.mjs';
import { derive } from '../../src/ui/model.js';
import * as view from '../../src/ui/view.js';
import { emptyState, addCustom, applyRecommended, studentOf, toggleDone, fillSlot, moveTile } from '../../src/core/state.js';
import { recommend, programPlan } from '../../src/core/plan.js';

const manifest = await readJson('data/manifest.json');

async function contextFor(programs, { tracks = {}, edit } = {}) {
  const dataset = await loadDataset();
  const state = emptyState({ catalogYear: YEAR, programs, tracks });
  applyRecommended(state, recommend({ dataset, student: studentOf(state, dataset), tracks }));
  if (edit) edit(state);
  const m = derive(state, dataset, { recommendedCredits: 193 });
  const alternatives = new Map();
  const tags = { premed: [], 'premed-late-half': [] }, labels = {};
  for (const p of m.programs) {
    (function walk(n) { if (n.course && n.anyOf) alternatives.set(n.course, n.anyOf); (n.items || []).forEach(walk); })(p.program.requirements);
    if (p.program.tracks) { const t = programPlan(p.program, state.tracks[p.id]); Object.keys(t.tags).forEach(k => tags[k].push(...t.tags[k])); Object.assign(labels, t.labels); }
  }
  const meta = manifest.years[YEAR];
  return { state, dataset, m, meta, year: YEAR, yearNames: Object.keys(manifest.years), manifestYears: manifest.years, yearLabel: meta.label, summaries: meta.programs, expanded: new Set(), alternatives, trackInfo: { tags, labels } };
}

const clean = (html, what) => {
  for (const bad of ['undefined', 'NaN', '[object', 'null']) assert.ok(!html.includes(bad), `${what} contains "${bad}": ...${html.slice(Math.max(0, html.indexOf(bad) - 60), html.indexOf(bad) + 60)}...`);
};

test('the double-major page renders every part with no broken values', async () => {
  const c = await contextFor(['EE-BSEE', 'BE-BSBE']);
  const ledger = view.renderLedger(c);
  clean(ledger, 'ledger');
  assert.equal((ledger.match(/class="tile /g) || []).length, Object.keys(c.state.placed).length);
  assert.equal((ledger.match(/class="col[ "]/g) || []).length, c.state.terms.length);
  const ids = [...ledger.matchAll(/data-id="([^"]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length, 'a tile appears twice');
  assert.match(ledger, /t-prog-badge ruled/, 'a course that counts through a rule carries the marker');
  assert.match(ledger, /EE 2130/);

  const card = view.programsCard(c);
  clean(card, 'programs card');
  assert.match(card, /Electrical Engineering/); assert.match(card, /Biological Engineering/); assert.match(card, /Standard track/);
  assert.match(card, /0 \/ 127 cr/); assert.match(card, /0 \/ 128 cr/);

  const audit = view.renderAudit(c);
  clean(audit.body + audit.count + audit.pill.text, 'audit');
  assert.equal(audit.pill.cls, 'pending');
  assert.match(audit.body, /rule-chip/, 'rule-based fills are marked');
  assert.match(audit.body, /shared/, 'shared placeholders are marked');
  assert.match(audit.body, /Choose course/);

  const issues = view.renderIssues(c);
  clean(issues.html, 'issues');
  const rules = view.renderRules(c);
  clean(rules, 'rules');
  assert.match(rules, /EE 2130 counts as EE 2950/);
  assert.match(rules, /Open question/);
  assert.match(view.notice(c), /partly unverified/);
  const pr = view.progressBar(c);
  assert.deepEqual([pr.done, pr.target], [0, 193]);
});

test('tile details say what is known and what is not', async () => {
  const c = await contextFor(['EE-BSEE']);
  c.expanded.add('EE2120'); c.expanded.add('EE1820'); c.expanded.add('EE-BSEE/ee-design/1');
  const ledger = view.renderLedger(c);
  assert.match(ledger, /Prerequisites:<\/b> EE 1820 \(or taken together\)/, 'EE 2120: credit-or-registration wording');
  assert.match(ledger, /verified \(workday\)/);
  assert.match(ledger, /requisites not obtained yet/, 'a chart-only stub says so');
  assert.match(ledger, /Placeholder<\/b> for EE Design/);
  assert.match(ledger, /Choose a course for this slot/);
});

test('user text is escaped everywhere it is shown', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const c = await contextFor(['BE-BSBE'], { edit: s => { const id = addCustom(s, { code: evil, title: evil, cr: 3, note: evil }, 'year1-fall'); s.meta['BE-BSBE/gen-ed/socsci'] = { label: evil }; void id; } });
  const html = view.renderLedger(c) + view.renderAudit(c).body;
  assert.ok(!html.includes('<img src=x'), 'raw markup got through');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('pre-med track: flagged courses and the suggestion for the social science slot', async () => {
  const c = await contextFor(['BE-BSBE'], { tracks: { 'BE-BSBE': 'premed' } });
  const ledger = view.renderLedger(c);
  assert.equal((ledger.match(/class="t-premed"/g) || []).length, 17, 'the 17 medical-school courses in the plan');
  assert.match(ledger, /e\.g\., PSYC 2000: Introduction to Psychology/);
  assert.match(view.programsCard(c), /Pre-med track/);
  clean(view.renderAudit(c).body, 'premed audit');
});

test('completed work, AP credit and a filled slot show up in the audit', async () => {
  const c = await contextFor(['EE-BSEE'], { edit: s => { toggleDone(s, 'CHEM1201'); moveTile(s, 'MATH1550', 'completed'); fillSlot(s, 'EE-BSEE/ee-design/1', 'EE4160'); } });
  const audit = view.renderAudit(c);
  assert.match(audit.body, /Done \(Year 1 Fall\)/);
  assert.match(audit.body, /Done \(AP \/ Transfer Credit\)/);
  assert.match(audit.body, /your choice/);
  assert.match(audit.body, /EE 4160/);
  const ledger = view.renderLedger(c);
  assert.match(ledger, /t-done locked/);
  assert.match(ledger, /Counts as: EE Design/);
});

test('a minor with a flat requirement list and a program with placeholders and groups both render', async () => {
  const c = await contextFor(['CSC-CYB', 'ROBO-MIN']);
  const audit = view.renderAudit(c);
  clean(audit.body, 'CS + minor audit');
  assert.match(audit.body, /Robotics Engineering Minor/);
  assert.match(audit.body, /Requirements/);
  assert.match(view.renderRules(c), /No advisor rules apply/);
});

test('every kind of rule can be described in words', async () => {
  const ds = await loadDataset();
  for (const r of ds.rules) {
    const text = view.ruleText(r, ds);
    assert.ok(text && text.length > 8, r.id);
    clean(text, r.id);
  }
  for (const type of ['waivePrereq', 'waive', 'grant', 'offering', 'exclusive', 'noSubstitute', 'enrollment']) {
    const r = { id: 'x', type, course: 'EE2120', prereq: '*', requirement: 'EE-BSEE/senior-design', via: 'AP', terms: ['F'], courses: ['EE2120', 'EE2130'], rejects: { any: true }, effect: 'warn', deniedIf: { majors: { hasOnly: ['EE-BSEE'] } }, source: { label: 'x', recordedOn: '2026-01-01' } };
    clean(view.ruleText(r, ds), type);
  }
  assert.equal(view.describePool({ attrs: ['stem'], level: { min: 2000 } }), '2000+ level STEM courses');
  assert.equal(view.describePool({ subject: 'EE', level: { min: 4000, max: 4999 }, attrs: ['design'] }), 'EE 4000-level design elective courses');
  assert.equal(view.describePool({ courses: ['EE4810'], attrs: ['senior-design'] }), 'EE 4810 or senior design courses');
  assert.equal(view.describePool([{ attrs: ['gen-ed'] }, { courses: ['PHIL2020'] }]), 'general education courses or PHIL 2020');
});

test('every id the page code looks up exists in index.html, and every action a view emits has a handler', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const main = await readFile(path.join(root, 'src/ui/main.js'), 'utf8');
  const viewSrc = await readFile(path.join(root, 'src/ui/view.js'), 'utf8');
  const have = new Set([...(html + viewSrc).matchAll(/id="([^"]+)"/g)].map(m => m[1]));   // ids in the page or rendered by a view
  const dynamic = new Set(['pop-host']);
  const wanted = new Set([...main.matchAll(/\bel\('([^']+)'\)/g)].map(m => m[1]));
  for (const id of wanted) assert.ok(have.has(id) || dynamic.has(id) || ['year-select'].includes(id), `main.js uses #${id}, missing from index.html`);
  const acts = new Set([...viewSrc.matchAll(/data-act="([a-z-]+)"/g)].map(m => m[1]));
  for (const a of acts) assert.ok(new RegExp(`['"]${a}['"]`).test(main), `no handler for data-act="${a}"`);
  for (const src of ['planner.js', 'fflate.min.js', 'src/ui/main.js', 'tour.js', 'styles.css']) assert.ok(html.includes(src), `index.html no longer loads ${src}`);
  assert.ok(!/majors-data\.js|ee-app\.js|src="app\.js"/.test(html), 'the retired scripts must not be loaded');
});
