import test from 'node:test';
import assert from 'node:assert/strict';
import { progress } from '../helpers/student.mjs';
import { Scene, toPdf, toSvg, textWidth, wrapText } from '../../tools/plans/flowchart/scene.mjs';
import { routeEdges } from '../../tools/plans/flowchart/route.mjs';
import { assignRows, shortTitle } from '../../tools/plans/flowchart/model.mjs';
import { geometry } from '../../tools/plans/flowchart/draw.mjs';
import { buildFlowchart, chartTitle } from '../../tools/plans/flowchart/pages.mjs';
import { makeVoice } from '../../tools/plans/flowchart/voice.mjs';

/** What would make a routed chart hard to read: an arrow through a box, or two unrelated arrows running along the same line. */
function problems(model, routes) {
  const g = geometry(model);
  const boxes = [];
  model.grid.forEach((col, c) => col.ids.forEach(id => boxes.push({ id, x: g.xLeft(c), y: g.yTop(model.rows.get(id)), w: g.W, h: g.H })));
  const out = { crossings: [], overlaps: [] };
  const segments = [];
  routes.forEach((r, ri) => {
    for (let i = 1; i < r.pts.length; i++) {
      const p = r.pts[i - 1], q = r.pts[i];
      segments.push({ ri, a: p, b: q });
      for (const b of boxes) {
        const x1 = Math.min(p[0], q[0]), x2 = Math.max(p[0], q[0]), y1 = Math.min(p[1], q[1]), y2 = Math.max(p[1], q[1]), e = 0.6;
        if (x2 > b.x + e && x1 < b.x + b.w - e && y2 > b.y + e && y1 < b.y + b.h - e) out.crossings.push(`${r.edge.from}>${r.edge.to} through ${b.id}`);
      }
    }
  });
  const vertical = s => Math.abs(s.a[0] - s.b[0]) < 0.01, horizontal = s => Math.abs(s.a[1] - s.b[1]) < 0.01;
  // how far two segments overlap along axis k (0 = x, 1 = y)
  const shared = (s, t, k) => Math.min(Math.max(s.a[k], s.b[k]), Math.max(t.a[k], t.b[k])) - Math.max(Math.min(s.a[k], s.b[k]), Math.min(t.a[k], t.b[k]));
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i], t = segments[j], A = routes[s.ri].edge, B = routes[t.ri].edge;
      if (A.from === B.from || A.to === B.to) continue;   // a fan-out or fan-in shares its trunk on purpose
      const sameColumnLine = vertical(s) && vertical(t) && Math.abs(s.a[0] - t.a[0]) < 1.2 && shared(s, t, 1) > 1;
      const sameRowLine = horizontal(s) && horizontal(t) && Math.abs(s.a[1] - t.a[1]) < 1.2 && shared(s, t, 0) > 1;
      if (sameColumnLine || sameRowLine) out.overlaps.push(`${A.from}>${A.to} with ${B.from}>${B.to}`);
    }
  }
  return out;
}

// ---- drawing layer ------------------------------------------------------------------------------------------------------
test('text metrics: Helvetica widths, wrapping to a width and to a number of lines', () => {
  assert.ok(Math.abs(textWidth('Hello', 10) - 22.78) < 0.01);
  assert.ok(textWidth('Hello', 10, 'bold') > textWidth('Hello', 10));
  const lines = wrapText('Elementary Differential Equations and Linear Algebra', 66, 6.3, 'regular', 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => textWidth(l, 6.3) <= 66 + 1e-6));
  assert.match(lines[1], /…$/, 'what does not fit ends in an ellipsis');
  assert.deepEqual(wrapText('Calculus I', 66, 6.3), ['Calculus I']);
});

test('a PDF is written with a correct cross-reference table, one page per scene, and the SVG carries the same text', () => {
  const a = new Scene(400, 300), b = new Scene(200, 100);
  a.rect(10, 10, 100, 50, { r: 8, stroke: '#000', lw: 1 }).rect(140, 10, 100, 50, { r: 25, fill: '#e6e6e6', dash: [3, 2] });
  a.text(60, 30, 'MATH 1550 (parens) \\ · –', { size: 9, font: 'bold', anchor: 'middle' }).text(20, 150, 'BE + EE', { size: 12, rot: 90, anchor: 'middle' });
  a.line([[10, 100], [80, 100], [80, 140]], { stroke: '#222' }).poly([[80, 140], [77, 134], [83, 134]], { fill: '#222' });
  b.text(10, 20, 'second page');
  const pdf = toPdf([a, b], { title: 'test' });
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4') && text.endsWith('%%EOF\n'));
  assert.match(text, /\/Count 2/);
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
  assert.equal(text.slice(start, start + 4), 'xref');
  const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  assert.equal(offsets.length, 6 + 2 * 2, 'catalog, page tree, three fonts, info, and a page and a content stream for each scene');
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} is where the table says`));
  const svg = toSvg(a, { title: 't' });
  assert.match(svg, /MATH 1550 \(parens\)/);
  assert.match(svg, /rotate\(-90/);
  assert.throws(() => toPdf([new Scene(10, 10).rect(0, 0, 1, 1, { stroke: 'red' })]), /bad colour/, 'colours are hex');
});

// ---- rows and arrows ----------------------------------------------------------------------------------------------------
test('rows: a chain of prerequisites settles on one row so its arrows run straight', () => {
  const grid = [{ ids: ['f0', 'a'] }, { ids: ['b', 'f1'] }, { ids: ['f2', 'c'] }];
  const rows = assignRows(grid, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], 4);
  assert.equal(rows.get('a'), rows.get('b')); assert.equal(rows.get('b'), rows.get('c'));
  for (const col of grid) assert.equal(new Set(col.ids.map(id => rows.get(id))).size, col.ids.length, 'boxes in a column never share a row');
});

test('routing: every kind of arrow avoids the boxes and does not run along another arrow', () => {
  // c0: a(0) b(2) k(5)  c1: c(1) f(0)  c2: d(0) e(2)  c3: g(0) h(1) i(3) m(4) n(5)
  const place = { c0: ['a', 'b', 'k'], c1: ['c', 'f'], c2: ['d', 'e'], c3: ['g', 'h', 'i', 'm', 'n'] };
  const rowOf = { a: 0, b: 2, k: 5, c: 1, f: 0, d: 0, e: 2, g: 0, h: 1, i: 3, m: 4, n: 5 };
  const grid = Object.values(place).map(ids => ({ ids }));
  const rows = new Map(Object.entries(rowOf));
  const edge = (from, to, kind = 'pre') => ({ from, to, kind, faded: false, or: false });
  const edges = [
    edge('a', 'c'), edge('b', 'c'), edge('c', 'd'),   // next column, up and down
    edge('a', 'd'),                                   // row 0 is blocked by f, so this runs along a row gap
    edge('b', 'e'),                                   // straight across an empty row
    edge('k', 'n'),                                   // a long straight line across an empty row
    edge('a', 'i'),                                   // a long run along the free row of the box it enters
    edge('g', 'h', 'co'),                             // same column, next row
    edge('g', 'i', 'co'),                             // same column, further apart
    edge('m', 'n', 'co'), edge('n', 'm', 'co'),       // a lecture and its lab: one line, two heads
  ];
  const model = { grid, rows, R: 6, edges };
  const routes = routeEdges(model, geometry(model));
  assert.equal(routes.length, edges.length - 1, 'the mutual pair is one line');
  assert.equal(routes.filter(r => r.both).length, 1);
  for (const r of routes) assert.ok(r.pts.length >= 2 && r.pts.every(p => p.every(Number.isFinite)));
  assert.deepEqual(problems(model, routes), { crossings: [], overlaps: [] });
  const last = id => routes.find(r => r.edge.to === id && r.edge.from === 'b').pts;
  assert.equal(last('e').length, 2, 'straight');
});

test('short titles read like the college charts', () => {
  assert.equal(shortTitle('Differential & Integral Calculus (Calculus I)'), 'Calculus I');
  assert.equal(shortTitle('Introduction to Engineering Methods'), 'Intro to Eng. Methods');
  assert.equal(shortTitle('Biology Lab for Science Majors I'), 'Biology Lab I');
  assert.equal(shortTitle('Computer Science I for Majors (AP)'), 'Computer Science I for Majors (AP)');
  assert.equal(chartTitle(['Biological Engineering', 'Electrical Engineering']), 'BIOLOGICAL + ELECTRICAL ENGINEERING');
  assert.equal(chartTitle(['Computer Science']), 'COMPUTER SCIENCE');
});

// ---- the whole chart ----------------------------------------------------------------------------------------------------
test('the flowchart of a student\'s progress: every course drawn once, arrows clean, hours add up, notes attached', async () => {
  const { pdf, svg, pages, model, ex } = await buildFlowchart({ programs: ['BE-BSBE', 'EE-BSEE'], progress, seconds: 10, today: '2026-01-01' });
  assert.ok(pages.length >= 2, 'the chart, then the notes');
  assert.equal(pages[0].width, 1224);
  assert.ok(pdf.toString('latin1').startsWith('%PDF-1.4'));

  // every course of the plan appears exactly once, in a column and on a row of its own
  const seen = model.grid.flatMap(g => g.ids);
  assert.equal(new Set(seen).size, seen.length);
  assert.equal(seen.length, model.nodes.size);
  for (const g of model.grid) {
    const rows = g.ids.map(id => model.rows.get(id));
    assert.equal(new Set(rows).size, rows.length, 'no two boxes share a cell');
    assert.ok(rows.every(r => r >= 0 && r < model.R));
  }
  const status = id => model.nodes.get(id).status;
  assert.equal(status('MATH2090'), 'completed'); assert.equal(status('BE2352'), 'in-progress'); assert.equal(status('EE2120'), 'planned');
  assert.equal(model.nodes.get('CSC1350').credit, 'AP'); assert.equal(model.nodes.get('BE1251').grade, 'A');
  assert.equal(model.nodes.get('EE2120').shape, 'box'); assert.equal(model.nodes.get('ART1001').shape, 'oval', 'general education courses are ovals');
  assert.equal(model.headers.reduce((t, h) => t + h.hours, 0), model.totalHours, 'the HOURS row adds up to the total');
  assert.equal(model.headers[0].bank, true); assert.equal(model.headers[1].label, 'FALL 2025'); assert.equal(model.headers[3].state, 'in progress');

  // arrows: between courses of the plan, forward in time, never from the AP bucket, and clean
  assert.ok(model.edges.length > 20);
  const col = new Map(); model.grid.forEach((g, c) => g.ids.forEach(id => col.set(id, c)));
  for (const e of model.edges) {
    assert.ok(model.nodes.has(e.from) && model.nodes.has(e.to));
    assert.ok(col.get(e.from) <= col.get(e.to), `${e.from} > ${e.to} runs forward`);
    assert.notEqual(model.nodes.get(e.from).credit, 'AP');
  }
  assert.ok(model.edges.some(e => e.faded) && model.edges.some(e => !e.faded), 'arrows into finished courses are drawn light');
  assert.deepEqual(problems(model, routeEdges(model, geometry(model))), { crossings: [], overlaps: [] });

  // notes: a course that also counts for the other program gets a lettered footnote, and the letter is on its box
  const csc = model.notes.find(n => /^CSC 1350 also counts for EE: CSC 1253/.test(n.text));
  assert.ok(csc, model.notes.map(n => n.text).join(' | '));
  assert.ok(model.nodes.get('CSC1350').notes.includes(csc.letter));
  assert.ok(model.notes.every((n, i) => n.letter === String.fromCharCode(65 + i)));

  // the picture and the notes say the same as the sheet does
  assert.match(svg, /FLOWCHART LEGEND/); assert.match(svg, /TOTAL HOURS = /); assert.match(svg, /BE 1251/); assert.match(svg, /Fall 2025|FALL 2025/);
  assert.match(svg, /BIOLOGICAL \+ ELECTRICAL ENGINEERING/);
  assert.ok(!/undefined|NaN|\[object/.test(svg));
  assert.ok(ex.ruled.length > 3 && ex.unapplied.length === 1);
});

test('the chart of the recommended plan (no progress) has no status marks and no grades', async () => {
  const { model, svg, pdf } = await buildFlowchart({ programs: ['BE-BSBE', 'EE-BSEE'], today: '2026-01-01' });
  assert.ok([...model.nodes.values()].every(n => n.status === 'planned' && !n.grade && !n.credit));
  assert.ok(model.headers.every(h => h.state === '' && !h.bank));
  assert.equal(model.totalHours, 193);
  assert.ok(!/credit already earned|in progress/.test(svg));
  assert.deepEqual(problems(model, routeEdges(model, geometry(model))), { crossings: [], overlaps: [] });
  assert.ok(pdf.length > 5000);
});

// ---- the voice of the notes ---------------------------------------------------------------------------------------------
const words = page => page.ops.filter(o => o.t === 'text').map(o => o.s).join(' ');
const PEOPLE = { 'BE undergraduate program director': 'Pat', 'EE program advisor': 'Sam (EE program)' };   // invented

test('voice: role names become people, the first person replaces "the student", sources read as who and how', () => {
  const v = makeVoice({ firstPerson: true, addressee: 'Pat', people: PEOPLE });
  assert.equal(v.say('BE undergraduate program director said so; the student\'s other program; The student asks'), 'Pat said so; my other program; I asks');
  assert.equal(v.say('for the student'), 'for me');
  assert.equal(v.say('Per the email from the BE undergraduate program director, and The EE program advisor said'), 'Per the email from Pat, and Sam (EE program) said');
  assert.equal(v.say('The plan assumes it; in the plan'), 'My plan assumes it; in my plan');
  assert.equal(makeVoice().say('The plan assumes it'), 'The plan assumes it');
  const rule = label => ({ source: { label } });
  assert.equal(v.who(rule('BE undergraduate program director (email)')), 'Pat');
  assert.equal(v.source(rule('BE undergraduate program director (email)')), 'Pat, email');
  assert.equal(v.source(rule('EE program advisor (in-person meeting)')), 'Sam (EE program), in-person meeting');
  assert.equal(v.source(rule('Student report (not confirmed by an advisor)')), 'my understanding, not confirmed by an advisor');
  const plain = makeVoice();
  assert.equal(plain.say('the student\'s plan'), 'the student\'s plan', 'neutral text is left alone');
  assert.equal(plain.source(rule('Student report (not confirmed by an advisor)')), 'Student report, not confirmed by an advisor');
  assert.equal(plain.addressee, null);
});

test('the notes for an advisor: first person, real names, the senior design sequence rule, nobody says "we"', async () => {
  const voice = { firstPerson: true, addressee: 'Pat', people: PEOPLE };
  const { pages } = await buildFlowchart({ programs: ['BE-BSBE', 'EE-BSEE'], progress, voice, seconds: 10, today: '2026-01-01' });
  const notes = pages.slice(1).map(words).join(' ');
  assert.match(notes, /Notes for Pat/);
  assert.match(notes, /my plan/); assert.match(notes, /my Workday academic progress report/); assert.match(notes, /Questions I could not settle/);
  assert.match(notes, /I have completed \d+ credit hours/);
  assert.match(notes, /Pat, email/); assert.match(notes, /Sam \(EE program\), in-person meeting/);
  assert.match(notes, /matched I\/II sequence within one major/, 'the senior design substitution has to be a matched sequence');
  assert.match(notes, /\(my planning tool, not an official document\)\. I may take summer classes, which can shift courses around on the flowchart\./);
  assert.ok(!/a student's planning tool/.test(notes));
  // the questions: EE 2120 is assumed to be enough by itself, and STEM is asked as "does it reach non-BE engineering classes?"
  assert.match(notes, /Does EE 2120 alone count for BE's EE 2950\? My plan assumes it does\./);
  assert.match(notes, /Per the email from Pat, an "EE 2120 level" circuits class substitutes for EE 2950/, 'no "The Pat\'s email"');
  assert.ok(!/only EE 2130/.test(notes));
  assert.match(notes, /Your email says that any STEM class counts for the BE technical elective\. Does that mean any non-BE engineering class can be a BE technical elective\?/);
  assert.match(notes, /Could any of the transcript credit I listed above count as my BE technical elective\?/);
  assert.ok(!/definition of STEM/.test(notes));
  // sections and questions that were taken out
  assert.ok(!/How credit was mapped|Unverified course attribute|legacy EE audit|taken as CHEM/.test(notes));
  assert.match(notes, /my understanding, not confirmed by an advisor/);
  assert.ok(!/undergraduate program director|EE program advisor|the student|\bwe\b|\bour\b|Advisor \(in-person/i.test(notes), notes.match(/.{30}(undergraduate program director|EE program advisor|the student|\bwe\b|\bour\b).{30}/i));
  assert.ok(!/Must a substituted senior design|advisor's department was not recorded/.test(notes), 'questions that have been answered are gone');
  // the footnotes on the chart use the same names
  const chart = words(pages[0]);
  assert.match(chart, /\(Pat, confirmed\)/); assert.match(chart, /\(Sam \(EE program\), reported\)/);
  assert.ok(!/undergraduate program director|the student/.test(chart));
});

test('without a voice the notes are neutral: no first person, no names, and still no "we"', async () => {
  const { pages } = await buildFlowchart({ programs: ['BE-BSBE', 'EE-BSEE'], progress, seconds: 10, today: '2026-01-01' });
  const notes = pages.slice(1).map(words).join(' ');
  assert.match(notes, /Notes for the advisor/); assert.match(notes, /the student's Workday academic progress report/);
  assert.match(notes, /a student's planning tool, not an official document\)\. A student may take summer classes/);
  assert.match(notes, /The guidance is that any STEM class counts for the BE technical elective\. Does that mean any non-BE engineering class/);
  assert.match(notes, /Could any of the transcript credit listed above count as the BE technical elective\?/);
  assert.match(notes, /BE undergraduate program director, email/); assert.match(notes, /EE program advisor, in-person meeting/);
  assert.ok(!/\b(we|our|my|I have)\b/.test(notes), notes.match(/.{30}\b(we|our|my|I have)\b.{30}/));
});

test('grades can be left off', async () => {
  const { model } = await buildFlowchart({ programs: ['BE-BSBE', 'EE-BSEE'], progress, showGrades: false, seconds: 10, today: '2026-01-01' });
  assert.ok([...model.nodes.values()].every(n => !n.grade));
  assert.equal(model.nodes.get('CSC1350').credit, 'AP', 'where the credit came from is not a grade');
});
