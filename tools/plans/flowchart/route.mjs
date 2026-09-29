// Orthogonal arrow routing for the flowchart grid, in the style of the college's charts: arrows leave the right side of a box,
// travel in the gaps between columns and rows (never across a box), and enter the left side of the box they point to.
//
// Shapes (a = the box an arrow leaves, b = the box it enters):
//   straight       same row, nothing in between: one horizontal line
//   adjacent       next column: right, up or down inside the gap, right again
//   run            further right: leave, drop into the gap after a, run along a free row (b's, else a's) or along a row gap, then into b
//   same-vertical  same column, next row: a short vertical line between the two boxes
//   same-loop      same column, further apart: out of a's right side, along the row gap next to b, into b's top or bottom
//
// What makes two arrows confusable, and what is done about it:
//   * a run along a row is only used when no other arrow already uses that row over the same stretch (else it takes a row gap)
//   * an arrow leaving a box and one entering another box on the same row of the same gap would read as one line, so the leaving
//     arrow's vertical is always to the left of the entering one's (an ordering constraint solved per gap)
//   * arrows that still overlap in a gap are given separate tracks a few points apart; arrows leaving one box, or entering one box,
//     may share a track, so a fan-out looks like one trunk with branches.

/**
 * @param {{edges, grid, rows}} model
 * @param {{ xLeft(c), xRight(c), xGap(c), yMid(r), yTop(r), yBottom(r), yRowGap(k), gapW, rowGapH }} g  geometry of the drawing
 * @returns [{ edge, pts: [[x, y]...], both }]   `both`: a same-column corequisite pair drawn as one line with two heads
 */
export function routeEdges({ edges, grid, rows }, g) {
  const colOf = new Map();
  const occupied = new Set();
  grid.forEach((col, c) => col.ids.forEach(id => { colOf.set(id, c); occupied.add(`${c},${rows.get(id)}`); }));
  const isOcc = (c, r) => occupied.has(`${c},${r}`);
  const free = (row, c1, c2) => { for (let c = c1; c <= c2; c++) if (isOcc(c, row)) return false; return true; };
  const compatible = (a, b) => a.e.from === b.e.from || a.e.to === b.e.to;
  const overlaps = (a, b) => a.lo <= b.hi + 1e-6 && b.lo <= a.hi + 1e-6;

  // two boxes that need each other in the same semester (a lecture and its lab): one line, two heads
  const seen = new Set();
  const list = [];
  for (const e of edges) {
    if (colOf.get(e.from) === colOf.get(e.to) && e.kind === 'co' && edges.some(o => o.from === e.to && o.to === e.from && o.kind === 'co')) {
      const key = [e.from, e.to].sort().join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ e, both: true });
    } else list.push({ e, both: false });
  }

  const plans = list.map(({ e, both }, index) => {
    const ca = colOf.get(e.from), cb = colOf.get(e.to), ra = rows.get(e.from), rb = rows.get(e.to);
    const p = { index, e, both, ca, cb, ra, rb, type: '', run: null };
    if (ca === cb) p.type = Math.abs(ra - rb) === 1 ? 'same-vertical' : 'same-loop';
    else if (cb === ca + 1) p.type = ra === rb ? 'straight' : 'adjacent';
    else if (ra === rb && free(ra, ca + 1, cb - 1)) p.type = 'straight';
    else p.type = 'run';
    return p;
  });

  // ---- rows already used by a line along them (straights first, then runs, shortest first)
  const rowUse = new Map();
  const use = (row, p, lo, hi) => { if (!rowUse.has(row)) rowUse.set(row, []); rowUse.get(row).push({ p, e: p.e, lo, hi }); };
  const clear = (row, p, lo, hi) => (rowUse.get(row) || []).every(o => !overlaps(o, { lo, hi }) || compatible(o, p));
  for (const p of plans) if (p.type === 'straight') use(p.ra, p, p.ca, p.cb);
  // row gaps in use (by index; gap k lies above row k): a same-column loop has to sit next to the box it enters, so it goes first
  const gapUse = new Map();
  const lastGap = Math.max(0, ...rows.values()) + 1;   // the gap below the last row is the last one
  for (const p of plans) {
    if (p.type !== 'same-loop') continue;
    p.run = { kind: 'gap', idx: p.rb > p.ra ? p.rb : p.rb + 1 };
    if (!gapUse.has(p.run.idx)) gapUse.set(p.run.idx, []);
    gapUse.get(p.run.idx).push({ p, e: p.e, lo: p.ca, hi: p.ca + 0.5 });
  }
  for (const p of plans.filter(x => x.type === 'run').sort((a, b) => (a.cb - a.ca) - (b.cb - b.ca))) {
    const lo = p.ca + 0.5, hi = p.cb - 0.5;
    const okRow = r => free(r, p.ca + 1, p.cb - 1) && (r === p.ra || !isOcc(p.ca, r)) && (r === p.rb || !isOcc(p.cb, r));
    const rowChoices = [p.rb, p.ra].filter(r => okRow(r) && clear(r, p, lo, hi));
    if (rowChoices.length) { p.run = { kind: 'row', idx: rowChoices[0] }; use(rowChoices[0], p, lo, hi); continue; }
    // otherwise a row gap: the least crowded one next to b or a, preferring the one nearest b
    const near = [p.rb > p.ra ? p.rb : p.rb + 1, p.rb > p.ra ? p.rb + 1 : p.rb, p.ra + 1, p.ra].filter((k, i, all) => k >= 0 && k <= lastGap && all.indexOf(k) === i);
    const depth = k => (gapUse.get(k) || []).filter(o => overlaps(o, { lo, hi }) && !compatible(o, p)).length;
    const best = near.reduce((b, k) => (depth(k) < depth(b) ? k : b), near[0]);
    p.run = { kind: 'gap', idx: best };
    if (!gapUse.has(best)) gapUse.set(best, []);
    gapUse.get(best).push({ p, e: p.e, lo, hi });
  }

  const yBase = p => (p.run.kind === 'row' ? g.yMid(p.run.idx) : g.yRowGap(p.run.idx));

  // ---- the pieces of every route that lie in a shared channel
  const pieces = [];
  const piece = (p, key, part, o) => pieces.push({ p, e: p.e, key, part, lo: o.lo, hi: o.hi, leave: o.leave == null ? -1 : o.leave, enter: o.enter == null ? -1 : o.enter, pos: -1 });
  const span = (a, b) => ({ lo: Math.min(a, b), hi: Math.max(a, b) });
  for (const p of plans) {
    const ya = g.yMid(p.ra), yb = g.yMid(p.rb);
    if (p.type === 'adjacent') piece(p, `V${p.ca}`, 'v1', { ...span(ya, yb), leave: p.ra, enter: p.rb });
    else if (p.type === 'same-loop') {
      piece(p, `V${p.ca}`, 'v1', { ...span(ya, yBase(p)), leave: p.ra });
      piece(p, `G${p.run.idx}`, 'run', { lo: p.ca, hi: p.ca + 0.5 });
    } else if (p.type === 'run') {
      const yr = yBase(p);
      piece(p, `V${p.ca}`, 'v1', { ...span(ya, yr), leave: p.ra });
      if (p.run.kind === 'gap') piece(p, `G${p.run.idx}`, 'run', { lo: p.ca + 0.5, hi: p.cb - 0.5 });
      piece(p, `V${p.cb - 1}`, 'v2', { ...span(yr, yb), enter: p.rb });
    }
  }
  const byKey = new Map();
  for (const s of pieces) { if (!byKey.has(s.key)) byKey.set(s.key, []); byKey.get(s.key).push(s); }

  const trackCount = new Map();
  for (const [key, members] of byKey) {
    const same = (a, b) => a.p === b.p || compatible(a, b);
    const clash = (a, b) => overlaps(a, b) && !same(a, b);
    if (key[0] === 'V') {
      // an arrow leaving row r must sit left of an arrow entering row r in the same gap, or the two read as one line
      const before = members.map(() => []);
      members.forEach((a, i) => members.forEach((b, j) => { if (i !== j && a.leave >= 0 && a.leave === b.enter && !same(a, b)) before[j].push(i); }));
      const state = members.map(() => 0);
      const place = i => {
        if (state[i]) return;
        state[i] = 1;   // in progress: a cycle of constraints is broken by ignoring the edge that closes it
        let pos = 0;
        for (const k of before[i]) { place(k); if (state[k] === 2) pos = Math.max(pos, members[k].pos + 1); }
        while (members.some((o, j) => j !== i && state[j] === 2 && o.pos === pos && clash(o, members[i]))) pos++;
        members[i].pos = pos;
        state[i] = 2;
      };
      members.forEach((_, i) => place(i));
    } else {
      members.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
      const tracks = [];
      for (const s of members) {
        let t = tracks.findIndex(tr => tr.every(o => !clash(o, s)));
        if (t < 0) { tracks.push([]); t = tracks.length - 1; }
        tracks[t].push(s);
        s.pos = t;
      }
    }
    trackCount.set(key, Math.max(...members.map(s => s.pos)) + 1);
  }
  const offsets = new Map();   // "edge index:part" -> distance from the middle of the channel
  for (const s of pieces) {
    const T = trackCount.get(s.key);
    const room = s.key[0] === 'V' ? g.gapW / 2 - 4.5 : g.rowGapH / 2 - 3;
    const step = T < 2 ? 0 : Math.min(3.4, (2 * room) / (T - 1));
    offsets.set(`${s.p.index}:${s.part}`, (s.pos - (T - 1) / 2) * step);
  }

  // loops in one column enter their boxes at different points along the top or bottom edge
  const loopX = new Map();
  const loops = new Map();
  for (const p of plans) if (p.type === 'same-loop') { if (!loops.has(p.ca)) loops.set(p.ca, []); loops.get(p.ca).push(p); }
  for (const [c, members] of loops) members.forEach((p, i) => loopX.set(p.index, g.xLeft(c) + ((i + 1) * (g.xRight(c) - g.xLeft(c))) / (members.length + 1)));

  const clean = pts => pts.filter((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) > 0.01 || Math.abs(q[1] - pts[i - 1][1]) > 0.01);
  return plans.map(p => {
    const o = part => offsets.get(`${p.index}:${part}`) || 0;
    const ya = g.yMid(p.ra), yb = g.yMid(p.rb);
    const A = [g.xRight(p.ca), ya], B = [g.xLeft(p.cb), yb];
    let pts;
    if (p.type === 'straight') pts = [A, B];
    else if (p.type === 'adjacent') { const x = g.xGap(p.ca) + o('v1'); pts = [A, [x, ya], [x, yb], B]; }
    else if (p.type === 'run') {
      const x1 = g.xGap(p.ca) + o('v1'), x2 = g.xGap(p.cb - 1) + o('v2'), yr = yBase(p) + o('run');
      pts = [A, [x1, ya], [x1, yr], [x2, yr], [x2, yb], B];
    } else if (p.type === 'same-loop') {
      const x = g.xGap(p.ca) + o('v1'), yj = yBase(p) + o('run'), xm = loopX.get(p.index);
      pts = [A, [x, ya], [x, yj], [xm, yj], [xm, p.rb > p.ra ? g.yTop(p.rb) : g.yBottom(p.rb)]];
    } else {
      const xm = (g.xLeft(p.ca) + g.xRight(p.ca)) / 2;
      pts = p.rb < p.ra ? [[xm, g.yTop(p.ra)], [xm, g.yBottom(p.rb)]] : [[xm, g.yBottom(p.ra)], [xm, g.yTop(p.rb)]];
    }
    return { edge: p.e, pts: clean(pts), both: p.both, type: p.type, run: p.run };
  });
}
