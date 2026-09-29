// From a prepared plan (advisor-sheet.mjs prepare()) to what a flowchart needs: columns (semesters), boxes, prerequisite arrows,
// which row each box sits on, and the footnotes for courses that count for both programs. Pure: nothing is drawn here.
import { flattenRequisites } from '../../../src/core/scenario.js';
import { COMPLETED } from '../../../src/core/terms.js';
import { requirementLabel } from '../../../src/ui/view.js';
import { columnState, termNamer } from '../advisor-sheet.mjs';

const SUBJECT_ORDER = ['BE', 'BIOL', 'CHEM', 'MATH', 'PHYS', 'CSC', 'EE', 'CE', 'ME', 'AGEC', 'ECON', 'ENGL'];
const GRANT_WORD = { AP: 'AP', transfer: 'transfer', placement: 'test credit', other: 'credit' };
/** "BE undergraduate program director, confirmed": who a rule came from and how firm it is (what a footnote shows). */
const defaultSource = r => `${r.source.label.replace(/\s*\(.*\)\s*$/, '')}, ${r.confidence}`;

/** A course title the way the college's charts print it: short, on at most two lines. */
export function shortTitle(title) {
  let t = String(title || '').trim();
  const paren = /\(([^)]{6,})\)\s*$/.exec(t);
  if (paren) t = paren[1];   // "Differential & Integral Calculus (Calculus I)" -> "Calculus I"
  const swaps = [[/ for Science Majors/i, ''], [/\bIntroduction to\b/, 'Intro to'], [/\bLaboratory\b/, 'Lab'], [/\bEngineering\b/g, 'Eng.'], [/\bBiological\b/g, 'Bio.'], [/\bElectrical and Computer\b/, 'ECE']];
  for (const [re, to] of swaps) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

const seedRank = node => {
  if (node.kind === 'slot') return 90;
  if (node.shape === 'oval') return 80;
  const i = SUBJECT_ORDER.indexOf(node.code.split(' ')[0]);
  return i < 0 ? 20 : i;
};

/**
 * Give every box a row so that arrows run as straight and short as they can (the layered-graph "barycentre" method): each box
 * moves toward the average row of what it connects to, columns are settled left to right and back again, and a column keeps its
 * boxes in order on distinct rows (a small dynamic programme picks the closest free rows). Returns Map(id -> row).
 */
export function assignRows(grid, edges, R) {
  const colOf = new Map();
  grid.forEach((g, c) => g.ids.forEach(id => colOf.set(id, c)));
  const row = new Map();
  grid.forEach(g => g.ids.forEach((id, i) => row.set(id, Math.min(R - 1, Math.floor(((i + 0.5) * R) / g.ids.length)))));

  const left = new Map(), right = new Map();
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  for (const e of edges) {
    if (colOf.get(e.from) < colOf.get(e.to)) { add(right, e.from, e.to); add(left, e.to, e.from); }
  }
  const mean = ids => ids.reduce((s, x) => s + row.get(x), 0) / ids.length;

  const place = (g, want) => {
    if (!g.ids.length) return;
    const items = g.ids.map((id, i) => ({ id, t: want(id), cur: row.get(id), i })).sort((p, q) => p.t - q.t || p.cur - q.cur || p.i - q.i);
    const n = items.length, INF = 1e9;
    const f = items.map(() => Array(R).fill(INF)), back = items.map(() => Array(R).fill(-1));
    const cost = (it, s) => Math.abs(s - it.t) + 0.001 * Math.abs(s - it.cur);
    for (let s = 0; s < R; s++) f[0][s] = cost(items[0], s);
    for (let k = 1; k < n; k++) {
      for (let s = k; s < R; s++) {
        let best = INF, arg = -1;
        for (let p = k - 1; p < s; p++) if (f[k - 1][p] < best) { best = f[k - 1][p]; arg = p; }
        if (arg >= 0) { f[k][s] = best + cost(items[k], s); back[k][s] = arg; }
      }
    }
    let s = 0;
    for (let x = 1; x < R; x++) if (f[n - 1][x] < f[n - 1][s]) s = x;
    for (let k = n - 1; k >= 0; k--) { row.set(items[k].id, s); s = back[k][s]; }
  };

  for (let pass = 0; pass < 10; pass++) {
    const forward = pass % 2 === 0;
    const order = grid.map((_, i) => i);
    if (!forward) order.reverse();
    for (const c of order) {
      place(grid[c], id => {
        const first = forward ? left.get(id) : right.get(id), second = forward ? right.get(id) : left.get(id);
        if (first) return mean(first);
        if (second) return mean(second);
        return row.get(id);
      });
    }
  }
  return row;
}

/**
 * @param {object} p  { dataset, state, m, done, progress, showGrades } as returned by prepare() (m is derive(...))
 * @returns { programs, headers[], grid[], nodes: Map, edges[], rows: Map, R, notes[], totalHours, hours }
 */
export function buildModel({ dataset, state, m, done, progress = null, showGrades = true, sourceOf = defaultSource }) {
  const byEntry = new Map((progress ? progress.courses : []).map(c => [c.id, c]));
  const termName = termNamer(progress);
  const programs = m.programs.map(p => ({ id: p.id, label: p.label, name: p.program.name, degree: p.program.degree || '', totalCredits: p.program.totalCredits }));
  const programOf = id => programs.find(p => p.id === id);

  const shown = m.columns.filter(c => c.tiles.length);

  // ---- boxes
  const nodes = new Map();
  const makeNode = id => {
    const t = m.tile(id);
    const counts = m.counts.get(id) || [];
    const entry = byEntry.get(id);
    const off = t.type === 'course' ? dataset.offered(id) : null;
    const only = off && off.terms.length === 1 && (off.terms[0] === 'F' || off.terms[0] === 'S') ? off.terms[0] : '';
    const isSlot = t.type === 'slot';
    const genEd = isSlot ? t.hints.includes('gen-ed') : counts.length > 0 && counts.every(c => /\/gen-ed(\/|$)/.test(c.demand.id));
    const status = entry ? (entry.status === 'in-progress' ? 'in-progress' : 'completed') : 'planned';
    return {
      id, code: isSlot ? t.code.replace(/\s+\d+$/, '') : t.code, title: isSlot ? '' : shortTitle(t.title), credits: t.credits,
      kind: isSlot ? 'slot' : 'course', shape: genEd ? 'oval' : 'box', status,
      grade: showGrades && entry && status === 'completed' ? entry.grade || '' : '',
      credit: entry && entry.term === COMPLETED ? GRANT_WORD[entry.grant || 'AP'] : '',
      offered: only, minGrade: (counts.find(c => c.demand.minGrade) || { demand: {} }).demand.minGrade || '',
      programs: counts.map(c => c.program).filter((x, i, a) => a.indexOf(x) === i),
      notes: [],
    };
  };
  for (const col of shown) for (const id of col.tiles) nodes.set(id, makeNode(id));

  // ---- columns: one per semester; the AP / transfer bucket may need two side by side
  // One spare row lets a chain of courses stay on one line, but every extra row squeezes the gaps the arrows travel in, so the spare is
  // only kept while there are at most 7 rows.
  const fullest = Math.max(...shown.filter(c => c.key !== COMPLETED).map(c => c.tiles.length), 4);
  const R = Math.max(fullest, Math.min(fullest + 1, 7));
  const headers = [], grid = [];
  let semester = 0;
  for (const col of shown) {
    const bank = col.key === COMPLETED;
    const ids = col.tiles.slice().sort((a, b) => seedRank(nodes.get(a)) - seedRank(nodes.get(b)) || nodes.get(a).code.localeCompare(nodes.get(b).code));
    const header = {
      key: col.key, bank, label: bank ? 'AP / TRANSFER' : termName(col.key).toUpperCase(), num: bank ? '' : String(++semester),
      state: columnState(progress, col), hours: ids.reduce((t, id) => t + nodes.get(id).credits, 0), gridStart: grid.length, gridSpan: 1,
    };
    if (bank && ids.length > R) {
      const plain = ids.filter(id => nodes.get(id).shape !== 'oval'), oval = ids.filter(id => nodes.get(id).shape === 'oval');
      const parts = plain.length && oval.length && plain.length <= R && oval.length <= R ? [plain, oval] : [ids.slice(0, Math.ceil(ids.length / 2)), ids.slice(Math.ceil(ids.length / 2))];
      parts.forEach((part, sub) => grid.push({ header: headers.length, sub, ids: part }));
      header.gridSpan = 2;
    } else {
      grid.push({ header: headers.length, sub: 0, ids });
    }
    headers.push(header);
  }
  const gridOf = new Map();
  grid.forEach((g, c) => g.ids.forEach(id => gridOf.set(id, c)));

  // ---- arrows: every prerequisite (solid) and "credit or registration" (dashed) between two courses that are in the plan.
  // Requisites come from the planner's course data; alternatives collapse to the course the student actually has.
  const has = id => state.placed[id] !== undefined || done[id] !== undefined;
  const edges = [];
  const seen = new Set();
  for (const [id, node] of nodes) {
    const rec = dataset.course(id);
    if (node.kind !== 'course' || !rec) continue;
    const req = flattenRequisites(rec.prereq, rec.coreq, { has, equivalents: c => m.ruleset.equivalents(c) });
    const push = (from, kind) => {
      const key = `${from}>${id}>${kind}`;
      if (from === id || seen.has(key) || !nodes.has(from) || (done[from] === COMPLETED)) return;   // AP / transfer credit satisfies prerequisites without an arrow
      if (gridOf.get(from) > gridOf.get(id) || (kind === 'pre' && gridOf.get(from) === gridOf.get(id))) return;   // out of order: the audit reports it, the picture does not draw it
      seen.add(key);
      edges.push({ from, to: id, kind, faded: node.status !== 'planned', or: false });
    };
    const pre = [...new Set(req.pre.filter(has))], co = [...new Set(req.co.filter(has))];   // the data can list a course twice
    pre.forEach(f => push(f, 'pre'));
    co.forEach(f => push(f, 'co'));
    if (req.coAny && co.length > 1) for (const e of edges) if (e.to === id && e.kind === 'co') e.or = true;
  }

  const rows = assignRows(grid, edges, R);

  // ---- footnotes: a box that also counts for the other program through a rule or a shared placeholder
  const notes = [];
  const noteBy = new Map();
  const basis = via => [...new Set(via.map(rid => {
    const r = dataset.rules.find(x => x.id === rid);
    return r ? sourceOf(r) : null;
  }).filter(Boolean))].join('; ');
  const order = grid.flatMap(g => g.ids.slice().sort((a, b) => rows.get(a) - rows.get(b)));
  for (const id of order) {
    const node = nodes.get(id);
    for (const c of m.counts.get(id) || []) {
      if (!c.demand.sharedFrom && !c.demand.via.length) continue;
      // "Design electives 2" is one of several identical slots; "CSC 1253" is a course, so only slot numbering is dropped
      let requirement = requirementLabel(dataset, c.demand.id).split(': ').slice(1).join(': ');
      if (/\/\d+$/.test(c.demand.id)) requirement = requirement.replace(/\s+\d+$/, '');
      const key = `${node.code}|${c.program}|${requirement}|${c.demand.via.join(',')}`;
      let note = noteBy.get(key);
      if (!note) {
        const why = basis(c.demand.via);
        note = { letter: String.fromCharCode(65 + notes.length), ids: [], text: `${node.code} also counts for ${programOf(c.program).label}: ${requirement}${why ? ` (${why})` : ''}`, via: c.demand.via };
        noteBy.set(key, note);
        notes.push(note);
      }
      note.ids.push(id);
      node.notes.push(note.letter);
    }
  }

  const totalHours = [...nodes.values()].reduce((t, n) => t + n.credits, 0);
  return { programs, headers, grid, nodes, edges, rows, R, notes, totalHours };
}
