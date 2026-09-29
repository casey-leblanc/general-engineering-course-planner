// Draws a flowchart model in the format of the College of Engineering's four-year flowcharts (https://www.lsu.edu/eng/docs/Flowcharts/):
//   - a title block ("TOTAL HOURS = n", the program name, the catalog year) and a numbered FALL / SPRING header over every column
//   - one rounded box per course: credit hours in parentheses, F / S when it is offered one semester only, C when a grade of C or better
//     is required, then the course number and a short title; ovals are general education courses
//   - solid arrows = credit required, dashed arrows with an open head = credit or registration required
//   - a HOURS row under the columns with the semester totals and the grand total, and a FLOWCHART LEGEND
// Additions for a combined, in-progress plan: program tags on every box, completed / in-progress shading, circled letters that point to
// footnotes for courses that count for both programs, and a page of notes.
import { Scene, textWidth, wrapText } from './scene.mjs';
import { routeEdges } from './route.mjs';

export const PAGE = { w: 1224, h: 792 };            // 17 x 11 in, landscape (prints on letter by "fit to page")
const INK = '#111111', FADE = '#b5b5b5', MUTED = '#4b4b4b', RULE = '#8a8a8a';
const TAG = ['#6b21a8', '#b45309', '#0e7490', '#be123c'];
const DONE = '#e2e2e2', UNDER_WAY = '#dbeafe', GREEN = '#15803d', BLUE = '#1d4ed8';

/** Where everything goes: a grid of columns (semesters) and rows, with gaps between them for the arrows. */
export function geometry(model) {
  const G = model.grid.length, X0 = 56, X1 = PAGE.w - 56, P = (X1 - X0) / G, W = 72, gap = P - W;
  const Y0 = 152, H = 52, Q = Math.min(68, Math.floor((612 - Y0) / model.R));
  const g = {
    G, X0, X1, P, W, H, Q, Y0, gapW: gap, rowGapH: Q - H,
    xLeft: c => X0 + c * P + gap / 2, xRight: c => X0 + c * P + gap / 2 + W, xGap: c => X0 + (c + 1) * P,
    yMid: r => Y0 + r * Q + Q / 2, yTop: r => Y0 + r * Q + Q / 2 - H / 2, yBottom: r => Y0 + r * Q + Q / 2 + H / 2, yRowGap: k => Y0 + k * Q,
  };
  g.bottom = Y0 + model.R * Q;
  return g;
}

const tagColor = (model, id) => TAG[Math.max(0, model.programs.findIndex(p => p.id === id)) % TAG.length];

/** Text set as one centred line made of differently coloured pieces. */
function centred(s, cx, y, parts, size, font = 'regular') {
  const total = parts.reduce((t, p) => t + textWidth(p.text, size, p.font || font), 0);
  let x = cx - total / 2;
  for (const p of parts) { s.text(x, y, p.text, { size, font: p.font || font, fill: p.fill || INK }); x += textWidth(p.text, size, p.font || font); }
}

function arrowHead(s, tip, from, { open, color }) {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const L = 5.5, hw = 2.7, bx = tip[0] - ux * L, by = tip[1] - uy * L;
  s.poly([tip, [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]], { fill: open ? '#ffffff' : color, stroke: color, lw: 0.7 });
  return [bx, by];
}

function drawArrow(s, r) {
  const color = r.edge.faded ? FADE : INK, open = r.edge.kind === 'co';
  const pts = r.pts.map(p => p.slice());
  const n = pts.length;
  // a dashed line stops where its hollow head starts
  const endBase = arrowHead(s, pts[n - 1], pts[n - 2], { open, color });
  if (open) pts[n - 1] = endBase;
  if (r.both) {   // a same-semester pair that needs each other: a head at both ends
    const startBase = arrowHead(s, pts[0], pts[1], { open, color });
    if (open) pts[0] = startBase;
  }
  s.line(pts, { stroke: color, lw: r.edge.faded ? 0.7 : 0.95, dash: open ? [3, 2] : null });
}

function drawBox(s, model, node, x, y, g) {
  const { W, H } = g;
  const oval = node.shape === 'oval', slot = node.kind === 'slot';
  const fill = node.status === 'completed' ? DONE : node.status === 'in-progress' ? UNDER_WAY : '#ffffff';
  s.rect(x, y, W, H, { r: oval ? H / 2 : 7, fill, stroke: node.status === 'in-progress' ? BLUE : INK, lw: node.status === 'in-progress' ? 1.3 : 0.9, dash: slot ? [3, 2] : null });
  const cx = x + W / 2, ink = node.status === 'completed' ? '#3d3d3d' : INK;
  const inner = W - (oval ? 22 : 10);
  // an oval has less room at the top and bottom, so its lines sit a little closer together
  const at = oval ? { cr: 10.5, code: 20, title: 27.6, lead: 6.8, tags: H - 7 } : { cr: 11, code: 22, title: 30.5, lead: 7.2, tags: H - 5 };

  // (3) with F / S before it and C after it, as on the college's charts
  s.text(cx, y + at.cr, `${node.offered ? `${node.offered}   ` : ''}(${node.credits})${node.minGrade ? `   ${node.minGrade}` : ''}`, { size: 7.4, anchor: 'middle', fill: ink });
  if (slot) {
    const lines = wrapText(node.code, inner, 7.4, 'bold', 2);
    lines.forEach((l, i) => s.text(cx, y + at.code + i * 8, l, { size: 7.4, font: 'bold', anchor: 'middle', fill: ink }));
    s.text(cx, y + at.code + lines.length * 8, 'to be chosen', { size: 6.2, font: 'italic', anchor: 'middle', fill: MUTED });
  } else {
    s.text(cx, y + at.code, node.code, { size: 8.6, font: 'bold', anchor: 'middle', fill: ink });
    wrapText(node.title, inner, 6.3, 'regular', 2).forEach((l, i) => s.text(cx, y + at.title + i * at.lead, l, { size: 6.3, anchor: 'middle', fill: ink === INK ? '#222222' : ink }));
  }

  // program tags, then the grade or where the credit came from
  const parts = [];
  node.programs.forEach((id, i) => { if (i) parts.push({ text: ' ' }); parts.push({ text: model.programs.find(p => p.id === id).label, font: 'bold', fill: tagColor(model, id) }); });
  const extra = node.credit || node.grade;
  if (extra) parts.push({ text: `${parts.length ? '  ' : ''}${extra}`, fill: '#3d3d3d' });
  if (parts.length) centred(s, cx, y + at.tags, parts, 6, 'regular');

  // status badge on the top right corner, circled note letters on the top left
  const bx = oval ? x + W - 8 : x + W - 3, by = oval ? y + 8 : y + 3;
  if (node.status === 'completed') {
    s.circle(bx, by, 5.6, { fill: GREEN, stroke: '#ffffff', lw: 0.8 });
    s.line([[bx - 2.6, by + 0.2], [bx - 0.7, by + 2.2], [bx + 2.8, by - 2.4]], { stroke: '#ffffff', lw: 1.3 });
  } else if (node.status === 'in-progress') {
    s.circle(bx, by, 5.6, { fill: BLUE, stroke: '#ffffff', lw: 0.8 });
    s.text(bx, by + 1.9, 'IP', { size: 5.2, font: 'bold', fill: '#ffffff', anchor: 'middle' });
  }
  node.notes.forEach((letter, i) => noteMark(s, (oval ? x + 8 : x + 3) + i * 11.5, oval ? y + 8 : y + 3, letter));
}

function noteMark(s, cx, cy, letter, r = 5) {
  s.circle(cx, cy, r, { fill: '#ffffff', stroke: INK, lw: 0.75 });
  s.text(cx, cy + 2.1, letter, { size: 6.2, font: 'bold', anchor: 'middle' });
}

/** Page 1: the flowchart. */
export function drawChart(model, ctx) {
  const s = new Scene(PAGE.w, PAGE.h);
  const g = geometry(model);
  const total = model.totalHours;

  // ---- title block
  s.text(g.X0, 42, `TOTAL HOURS = ${total}`, { size: 12, font: 'bold' });
  s.text(g.X0, 56, model.programs.map(p => `${p.label} ${p.totalCredits} hrs`).join('  +  '), { size: 8, fill: MUTED });
  s.text(PAGE.w / 2, 56, ctx.title, { size: 27, anchor: 'middle' });
  s.text(PAGE.w / 2, 73, ctx.subtitle, { size: 9, anchor: 'middle', fill: MUTED });
  s.text(g.X1, 42, ctx.year, { size: 12, font: 'bold', anchor: 'end' });
  const tag = 'DRAFT FOR ADVISOR REVIEW', tw = textWidth(tag, 6.8, 'bold') + 14;
  s.rect(g.X1 - tw, 49, tw, 13, { r: 3, fill: '#fef3c7', stroke: '#d97706', lw: 0.7 });
  s.text(g.X1 - tw / 2, 58.3, tag, { size: 6.8, font: 'bold', anchor: 'middle', fill: '#78350f' });

  // ---- column headers
  for (const h of model.headers) {
    const x1 = g.xLeft(h.gridStart), x2 = g.xRight(h.gridStart + h.gridSpan - 1), cx = (x1 + x2) / 2;
    if (h.num) s.text(cx, 104, h.num, { size: 10, font: 'bold', anchor: 'middle' });
    s.rect(x1, 110, x2 - x1, 18, { r: 9, fill: '#ffffff', stroke: INK, lw: 0.9 });
    s.text(cx, 122.2, h.label, { size: 8.4, font: 'bold', anchor: 'middle' });
    const state = h.bank ? 'credit already earned' : h.state || '';
    s.text(cx, 139, state, { size: 6.8, anchor: 'middle', fill: h.state === 'completed' || h.bank ? '#2f6b3f' : h.state === 'in progress' ? BLUE : MUTED, font: h.state === 'in progress' ? 'bold' : 'regular' });
  }
  s.line([[g.X0, 146], [g.X1, 146]], { stroke: INK, lw: 0.9 });

  // ---- side labels, as on the official charts
  const mid = (g.Y0 + g.bottom) / 2, side = model.programs.map(p => p.label).join(' + ');
  s.text(30, mid, side, { size: 17, font: 'bold', anchor: 'middle', rot: 90 });
  s.text(PAGE.w - 30, mid, side, { size: 17, font: 'bold', anchor: 'middle', rot: -90 });

  // ---- arrows (under the boxes), then boxes
  const routes = routeEdges(model, g);
  routes.filter(r => r.edge.faded).forEach(r => drawArrow(s, r));
  routes.filter(r => !r.edge.faded).forEach(r => drawArrow(s, r));
  model.grid.forEach((col, c) => col.ids.forEach(id => drawBox(s, model, model.nodes.get(id), g.xLeft(c), g.yTop(model.rows.get(id)), g)));
  const labelled = new Set();
  for (const r of routes) {
    if (!r.edge.or || labelled.has(r.edge.to)) continue;
    labelled.add(r.edge.to);
    const end = r.pts[r.pts.length - 1];
    s.text(end[0] - 8, end[1] - 3, '(OR)', { size: 6, font: 'bold', anchor: 'end' });
  }

  // ---- hours
  const yH = g.bottom + 12;
  s.text(g.X0 - 4, yH, 'HOURS:', { size: 8, font: 'bold' });
  for (const h of model.headers) s.text((g.xLeft(h.gridStart) + g.xRight(h.gridStart + h.gridSpan - 1)) / 2, yH, String(h.hours), { size: 9, font: 'bold', anchor: 'middle' });
  s.text(g.X1, yH, `= ${total}`, { size: 9, font: 'bold', anchor: 'end' });
  s.text(PAGE.w / 2, yH + 14, ctx.caption, { size: 7.4, anchor: 'middle', fill: MUTED });

  // ---- legend and notes
  const top = yH + 24, bottom = PAGE.h - 22, h = bottom - top;
  s.rect(g.X0, top, g.X1 - g.X0, h, { r: 6, stroke: INK, lw: 0.9 });
  const cut1 = g.X0 + 470, cut2 = cut1 + 372;
  s.line([[cut1, top + 6], [cut1, bottom - 6]], { stroke: RULE, lw: 0.6 });
  s.line([[cut2, top + 6], [cut2, bottom - 6]], { stroke: RULE, lw: 0.6 });
  drawLegend(s, model, g.X0 + 12, top, cut1 - g.X0 - 24);
  drawNotes(s, model, cut1 + 12, top, cut2 - cut1 - 24, h);
  drawAbout(s, ctx, cut2 + 12, top, g.X1 - cut2 - 24, h);
  return s;
}

function drawLegend(s, model, x, top, w) {
  s.text(x, top + 16, 'FLOWCHART LEGEND', { size: 11, font: 'bold' });
  const colB = x + w / 2 + 6, y0 = top + 33, step = 14.6, tx = 46;
  const sampleLine = (px, y, o) => {
    const pts = [[px, y], [px + 32, y]];
    const color = o.faded ? FADE : INK;
    if (o.open) { const base = arrowHead(s, pts[1], pts[0], { open: true, color }); s.line([pts[0], base], { stroke: color, lw: 0.95, dash: [3, 2] }); } else { arrowHead(s, pts[1], pts[0], { open: false, color }); s.line(pts, { stroke: color, lw: o.faded ? 0.7 : 0.95 }); }
  };
  const label = (px, y, t) => s.text(px + tx, y + 2.3, t, { size: 7.2 });
  // column A: arrows and box shapes
  sampleLine(x, y0, {}); label(x, y0, 'Credit required (prerequisite)');
  sampleLine(x, y0 + step, { open: true }); label(x, y0 + step, 'Credit or registration required');
  sampleLine(x, y0 + 2 * step, { faded: true }); label(x, y0 + 2 * step, 'Prerequisite already met (course done or under way)');
  s.rect(x + 3, y0 + 3 * step - 6, 28, 12, { r: 4, stroke: INK, lw: 0.8 }); label(x, y0 + 3 * step, 'Course');
  s.rect(x + 3, y0 + 4 * step - 6, 28, 12, { r: 6, stroke: INK, lw: 0.8 }); label(x, y0 + 4 * step, 'General education course (oval)');
  s.rect(x + 3, y0 + 5 * step - 6, 28, 12, { r: 4, stroke: INK, lw: 0.8, dash: [2.5, 1.8] }); label(x, y0 + 5 * step, 'Elective or gen ed still to choose (dashed)');
  // column B: what the marks mean
  s.rect(colB + 3, y0 - 6, 28, 12, { r: 4, fill: DONE, stroke: INK, lw: 0.8 }); s.circle(colB + 29, y0 - 5, 4.6, { fill: GREEN, stroke: '#fff', lw: 0.6 });
  s.line([[colB + 27, y0 - 4.8], [colB + 28.4, y0 - 3.4], [colB + 31, y0 - 6.6]], { stroke: '#fff', lw: 1 });
  s.text(colB + tx, y0 + 2.3, 'Completed (grade or AP / transfer credit shown)', { size: 7.2 });
  s.rect(colB + 3, y0 + step - 6, 28, 12, { r: 4, fill: UNDER_WAY, stroke: BLUE, lw: 1 }); s.circle(colB + 29, y0 + step - 5, 4.6, { fill: BLUE, stroke: '#fff', lw: 0.6 });
  s.text(colB + 29, y0 + step - 3.3, 'IP', { size: 4.3, font: 'bold', fill: '#fff', anchor: 'middle' });
  s.text(colB + tx, y0 + step + 2.3, 'In progress this semester', { size: 7.2 });
  s.text(colB + 17, y0 + 2 * step + 2.4, 'F  S', { size: 8, font: 'bold', anchor: 'middle' }); s.text(colB + tx, y0 + 2 * step + 2.3, 'Offered in the fall / spring semester only', { size: 7.2 });
  s.text(colB + 17, y0 + 3 * step + 2.4, '(3)  C', { size: 8, font: 'bold', anchor: 'middle' }); s.text(colB + tx, y0 + 3 * step + 2.3, 'Credit hours; C = grade of C or better required', { size: 7.2 });
  centred(s, colB + 17, y0 + 4 * step + 2.4, model.programs.map((p, i) => ({ text: `${i ? ' ' : ''}${p.label}`, font: 'bold', fill: TAG[i % TAG.length] })), 7.6);
  s.text(colB + tx, y0 + 4 * step + 2.3, 'Program(s) the course counts toward', { size: 7.2 });
  noteMark(s, colB + 17, y0 + 5 * step, 'A'); s.text(colB + tx, y0 + 5 * step + 2.3, 'Also counts for the other program: see the note', { size: 7.2 });
}

function drawNotes(s, model, x, top, w, h) {
  s.text(x, top + 16, 'WHERE ONE COURSE COUNTS FOR BOTH PROGRAMS', { size: 9, font: 'bold' });
  if (!model.notes.length) { s.text(x, top + 34, 'No course counts for both programs through a shared rule.', { size: 7.2 }); return; }
  let size = 7, lines;
  const wrap = sz => model.notes.map(n => wrapText(n.text, w - 18, sz, 'regular', 3));
  for (; size >= 5.6; size -= 0.2) { lines = wrap(size); const need = lines.reduce((t, l) => t + l.length * (size + 1.6) + 2.5, 0); if (need <= h - 30) break; }
  lines = wrap(size);
  let y = top + 32;
  model.notes.forEach((n, i) => {
    noteMark(s, x + 5, y - 2.4, n.letter, 4.7);
    lines[i].forEach((l, k) => s.text(x + 15, y + k * (size + 1.6), l, { size }));
    y += lines[i].length * (size + 1.6) + 2.5;
  });
}

function drawAbout(s, ctx, x, top, w, h) {
  s.text(x, top + 16, 'ABOUT THIS CHART', { size: 9, font: 'bold' });
  let y = top + 31;
  const size = 6.9;
  for (const t of ctx.about) {
    const lines = wrapText(t, w - 9, size, 'regular', 6);
    s.circle(x + 2.5, y - 2.3, 1.3, { fill: INK });
    lines.forEach((l, i) => s.text(x + 9, y + i * (size + 1.6), l, { size }));
    y += lines.length * (size + 1.6) + 3;
  }
  void h;
}

// ---- the notes pages: running text on letter-size pages ---------------------------------------------------------------------
const LETTER = { w: 612, h: 792 }, MARGIN = 48;

/** A simple top-to-bottom text layout that starts a new page when one is full. */
export class Flow {
  constructor() { this.pages = []; this.newPage(); }
  newPage() { this.scene = new Scene(LETTER.w, LETTER.h); this.pages.push(this.scene); this.y = MARGIN + 6; }
  need(h) { if (this.y + h > LETTER.h - MARGIN) this.newPage(); }
  get width() { return LETTER.w - 2 * MARGIN; }
  title(t) { this.scene.text(MARGIN, this.y + 8, t, { size: 17, font: 'bold' }); this.y += 26; }
  gap(h = 6) { this.y += h; }
  /** A heading is kept together with the first lines under it (hence the room asked for). */
  heading(t) { this.need(62); this.y += 8; this.scene.text(MARGIN, this.y + 8, t, { size: 10.5, font: 'bold' }); this.scene.line([[MARGIN, this.y + 12.5], [LETTER.w - MARGIN, this.y + 12.5]], { stroke: RULE, lw: 0.6 }); this.y += 21; }
  para(t, { size = 8.6, font = 'regular', fill = INK, indent = 0, bullet = false } = {}) {
    const lines = wrapText(t, this.width - indent - (bullet ? 10 : 0), size, font, 40);
    const lh = size + 2.6;
    this.need(Math.min(lines.length, 3) * lh);
    lines.forEach((l, i) => {
      if (this.y + lh > LETTER.h - MARGIN) this.newPage();
      if (bullet && i === 0) this.scene.circle(MARGIN + indent + 2.6, this.y + size * 0.42, 1.3, { fill });
      this.scene.text(MARGIN + indent + (bullet ? 10 : 0), this.y + size, l, { size, font, fill });
      this.y += lh;
    });
    this.y += 2.2;
  }
}
