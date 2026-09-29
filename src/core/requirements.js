// Degree audit: match the courses a student has (placed or completed) to a program's requirements.
//
// Every requirement is expanded into DEMANDS (one course each): a required course, a slot, one of n electives, one breadth
// course. Each course fills at most one demand within a program (maximum bipartite matching, so the result does not depend on
// the order requirements are listed in, and the Biology-style "one course consumed twice" bug cannot happen). Different
// programs are matched independently, so a course can count toward a major AND a minor / second major unless a rule says no.
// A placeholder tile ("Design Elect") is a course-to-be: besides filling its own slot it can fill a slot of ANOTHER program
// when everything the tile could become would be accepted there (same pool, a tighter pool, or an advisor rule's pool).
//
// What may fill a demand: the course itself (or a listed alternative), a course matching the slot's pool, an advisor
// equivalence (course A counts as B), an advisor substitution (a pool accepted for a requirement), or a placeholder tile
// whose id is the demand's id. noSubstitute rules remove rule/pool acceptance; waive rules complete a demand with no course.
import { createRuleset } from './rules.js';
import { createPlanView } from './prereq.js';

// Lower is preferred. Everything from ruleNamed down needs an advisor rule; a course such a rule NAMES (PHIL 2020, EE 4810) is
// preferred over a broad "any gen-ed" match, but never over something that fits the requirement on its own terms.
const RANK = { tile: 0, assigned: 1, exact: 2, sharedTile: 2.5, pool: 3, ruleDone: 3.4, ruleNamed: 3.5, sharedTileRule: 3.7, rule: 4 };
const ORDER = { missing: 0, placeholder: 1, planned: 2, complete: 3, waived: 3 };

export function collectDemands(program, dataset) {
  const demands = [];
  const push = (d, path) => demands.push({ ...d, path });
  const walk = (node, parents) => {
    const path = [...parents, node.id];
    switch (node.type) {
      case 'course':
        push({ id: node.id, kind: 'course', nodeId: node.id, label: node.course, courses: [node.course, ...(node.anyOf || [])], pools: [], credits: dataset.credits(node.course), minGrade: node.minGrade }, path);
        break;
      case 'slot':
        push({ id: node.id, kind: 'slot', nodeId: node.id, label: node.label, courses: [], pools: node.from ? [].concat(node.from) : [], credits: node.credits, minGrade: node.minGrade, hints: node.hints || [] }, path);
        break;
      case 'choose': case 'credits': {
        const n = node.type === 'choose' ? node.n : Math.ceil(node.credits / 3);
        for (let k = 1; k <= n; k++) push({ id: `${node.id}/${k}`, kind: node.type, nodeId: node.id, label: `${node.label || node.id} ${k}`, courses: [], pools: [].concat(node.from), credits: 3 }, path);
        break;
      }
      case 'distinctGroups': {
        const all = [...new Set(node.groups.flatMap(g => g.courses))];
        for (let k = 1; k <= (node.minCourses || node.minGroups); k++) push({ id: `${node.id}/${k}`, kind: 'breadth', nodeId: node.id, label: `${node.label || 'Breadth'} ${k}`, courses: all, pools: [], credits: 3 }, path);
        break;
      }
      default:
        (node.items || []).forEach(c => walk(c, path));
    }
  };
  walk(program.requirements, []);
  return demands;
}

const tileCatalogs = new WeakMap();
/** demand id -> { program, pools } for every slot-like demand of every program in the dataset (pools = what a tile can become). */
function tileCatalog(dataset) {
  if (tileCatalogs.has(dataset)) return tileCatalogs.get(dataset);
  const cat = new Map();
  for (const program of dataset.programs) {
    for (const d of collectDemands(program, dataset)) {
      const pools = d.pools.length ? d.pools : (d.courses.length && d.kind === 'breadth' ? [{ courses: d.courses }] : []);
      cat.set(d.id, { program: program.id, pools, kind: d.kind, label: d.label, credits: d.credits, nodeId: d.nodeId, hints: d.hints || [] });
    }
  }
  tileCatalogs.set(dataset, cat);
  return cat;
}

/** What a placeholder tile stands for: { program, pools, kind, label, credits, nodeId }, or undefined for an id that is not a slot demand. */
export const demandInfo = (dataset, id) => tileCatalog(dataset).get(id);

/**
 * Fill as many of `todo` (demands) as possible from their candidate items, cheapest total cost first (cost = rank, then the
 * candidate's position in the demand's own preference order, so ties stay deterministic). Successive shortest augmenting paths
 * on a unit-capacity network (SPFA); sizes are small (a program has well under 200 requirements).
 */
function minCostFill(todo, candidates, link) {
  const items = new Map();       // item key -> node index
  const itemOf = [];             // node index -> item
  const edges = [];              // { to, cap, cost, rev... } stored flat
  const adj = [];
  const node = () => { adj.push([]); return adj.length - 1; };
  const add = (u, v, cost) => {
    adj[u].push(edges.length); edges.push({ to: v, cap: 1, cost });
    adj[v].push(edges.length); edges.push({ to: u, cap: 0, cost: -cost });
  };
  const source = node(), sink = node();
  const dNode = todo.map(() => node());
  const demandEdges = todo.map(() => []);
  todo.forEach((d, di) => {
    add(source, dNode[di], 0);
    candidates(d).forEach((it, pos) => {
      if (!items.has(it.key)) { const n = node(); items.set(it.key, n); itemOf[n] = it; add(n, sink, 0); }
      demandEdges[di].push({ edge: edges.length, it });
      add(dNode[di], items.get(it.key), Math.round(it.rank * 1000) + pos);
    });
  });
  const INF = Infinity;
  for (;;) {
    const dist = new Array(adj.length).fill(INF), prev = new Array(adj.length).fill(-1), inq = new Array(adj.length).fill(false);
    dist[source] = 0;
    const queue = [source];
    while (queue.length) {
      const u = queue.shift();
      inq[u] = false;
      for (const ei of adj[u]) {
        const e = edges[ei];
        if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
          dist[e.to] = dist[u] + e.cost; prev[e.to] = ei;
          if (!inq[e.to]) { inq[e.to] = true; queue.push(e.to); }
        }
      }
    }
    if (dist[sink] === INF) break;
    for (let v = sink; v !== source;) { const ei = prev[v]; edges[ei].cap -= 1; edges[ei ^ 1].cap += 1; v = edges[ei ^ 1].to; }
  }
  todo.forEach((d, di) => { for (const { edge, it } of demandEdges[di]) if (edges[edge].cap === 0) link(d, it); });
}

/** program requirement node lookup by id */
function nodeIndex(program) {
  const idx = new Map();
  (function w(n) { idx.set(n.id, n); (n.items || []).forEach(w); })(program.requirements);
  return idx;
}

export function auditProgram({ program, dataset, plan, ruleset, assignments = {} }) {
  const view = createPlanView(plan);
  const demands = collectDemands(program, dataset);
  const nodes = nodeIndex(program);
  const isTile = id => id.includes('/');
  const courseItems = view.ids().filter(id => !isTile(id));
  const tileItems = view.ids().filter(isTile);
  const tiles = tileCatalog(dataset);

  // --- what can fill each demand
  const waived = new Map();
  const adjacency = new Map();
  for (const d of demands) {
    const w = ruleset.waives(d.path);
    if (w) { waived.set(d.id, w); adjacency.set(d.id, []); continue; }
    const subs = ruleset.substitutes(d.path);
    const rejects = ruleset.rejects(d.path);
    const list = [];
    const accepted = [...d.pools, ...subs.flatMap(r => [].concat(r.accepts))];
    for (const t of tileItems) {
      if (t === d.id) { list.push({ key: `t:${t}`, id: t, tile: true, rank: RANK.tile, via: [] }); continue; }
      // another program's placeholder that could only ever become a course this requirement accepts
      const info = tiles.get(t);
      if (!info || info.program === program.id || !info.pools.length || !accepted.length) continue;
      if (info.pools.some(p => rejects.some(r => dataset.poolWithin(p, r.rejects)))) continue;
      if (!info.pools.every(p => dataset.poolWithin(p, accepted))) continue;
      const via = d.pools.length && info.pools.every(p => dataset.poolWithin(p, d.pools)) ? [] : subs.filter(r => info.pools.every(p => dataset.poolWithin(p, r.accepts))).map(r => r.id);
      list.push({ key: `t:${t}`, id: t, tile: true, shared: info.program, rank: via.length ? RANK.sharedTileRule : RANK.sharedTile, via });
    }
    for (const c of courseItems) {
      let hit = null;
      if (assignments[c] === d.id) hit = { rank: RANK.assigned, via: [] };
      else if (d.courses.includes(c)) hit = { rank: RANK.exact, via: [] };
      else {
        const rejected = rejects.some(r => dataset.matchesPool(c, r.rejects));
        if (!rejected) {
          if (d.pools.length && dataset.matchesPool(c, d.pools)) hit = { rank: RANK.pool, via: [] };
          if (!hit) {
            for (const target of d.courses) {
              const eq = ruleset.equivalents(target, program.id).find(e => e.course === c);
              if (eq) { hit = { rank: RANK.rule, via: [eq.rule.id] }; break; }
            }
          }
          if (!hit) {
            const sub = subs.find(r => dataset.matchesPool(c, r.accepts));
            // a course the rule NAMES (PHIL 2020, EE 4810) is preferred over a broad "any gen-ed" match
            if (sub) hit = { rank: [].concat(sub.accepts).some(p => p.courses && p.courses.includes(c)) ? RANK.ruleNamed : RANK.rule, via: [sub.id] };
          }
        }
      }
      // a course the student has actually taken beats another program's placeholder when both are accepted through a rule
      if (hit && hit.rank >= RANK.ruleNamed && plan.done && plan.done[c] !== undefined) hit.rank = RANK.ruleDone;
      if (hit) list.push({ key: `c:${c}`, id: c, tile: false, ...hit });
    }
    list.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    adjacency.set(d.id, list);
  }

  // --- matching, in two stages so results are stable and intuitive
  //   1. courses that ARE the required course (or the demand's own placeholder tile, or a user assignment) claim their demand
  //      first; nothing can take those courses away later
  //   2. everything else (pools, advisor equivalences and substitutions) fills what is left: as many demands as possible, and among
  //      the ways to fill that many, the one whose fills are the most natural (sum of ranks: a course that fits the requirement on
  //      its own terms beats one an advisor rule accepts). Solved exactly as a minimum-cost flow, so no first-come accident (an
  //      art course counted for humanities while a philosophy course fills art) can happen.
  const matchOfItem = new Map();
  const matchOfDemand = new Map();
  const locked = new Set();
  const link = (d, it) => { matchOfItem.set(it.key, d); matchOfDemand.set(d.id, it); };
  const stageOne = () => {
    const keep = it => it.rank <= RANK.exact;
    const attempt = (d, seen) => {
      const adj = adjacency.get(d.id).filter(keep);
      for (const it of adj) if (!matchOfItem.has(it.key)) { link(d, it); return true; }
      for (const it of adj) {
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        if (attempt(matchOfItem.get(it.key), seen)) { link(d, it); return true; }
      }
      return false;
    };
    const todo = demands.map((d, i) => ({ d, i })).filter(({ d }) => !waived.has(d.id));
    todo.sort((a, b) => adjacency.get(a.d.id).filter(keep).length - adjacency.get(b.d.id).filter(keep).length || a.i - b.i);
    for (const { d } of todo) attempt(d, new Set());
  };
  stageOne();
  for (const key of matchOfItem.keys()) locked.add(key);
  minCostFill(demands.filter(d => !waived.has(d.id) && !matchOfDemand.has(d.id)), d => adjacency.get(d.id).filter(it => !locked.has(it.key)), link);

  // --- statuses
  const results = demands.map(d => {
    const base = { id: d.id, kind: d.kind, label: d.label, credits: d.credits, nodeId: d.nodeId, path: d.path, courses: d.courses, pools: d.pools };
    if (waived.has(d.id)) return { ...base, status: 'waived', via: [waived.get(d.id).id] };
    const m = matchOfDemand.get(d.id);
    if (!m) return { ...base, status: 'missing', via: [] };
    if (m.tile) return { ...base, status: 'placeholder', tile: m.id, via: m.via, ...(m.shared ? { sharedFrom: m.shared } : {}) };
    return { ...base, status: view.at(m.id) !== undefined && plan.done && plan.done[m.id] !== undefined ? 'complete' : 'planned', course: m.id, via: m.via, ...(m.rank === RANK.assigned ? { assigned: true } : {}) };
  });
  const byDemand = new Map(results.map(r => [r.id, r]));

  // --- breadth groups: enough courses is not enough, they must span enough groups
  const groups = {};
  for (const [id, node] of nodes) {
    if (node.type !== 'distinctGroups') continue;
    const mine = results.filter(r => r.nodeId === id);
    const covered = new Set(), coveredNames = [];
    for (const r of mine) if (r.course) node.groups.forEach((g, gi) => { if (g.courses.includes(r.course) && !covered.has(gi)) { covered.add(gi); coveredNames.push(g.name); } });
    const placeholders = mine.filter(r => r.status === 'placeholder').length;
    const filled = mine.filter(r => r.status !== 'missing').length;
    const potential = Math.min(node.groups.length, covered.size + placeholders);
    let status;
    if (filled < mine.length) status = 'missing';
    else if (covered.size >= node.minGroups) status = mine.every(r => r.status === 'complete') ? 'complete' : 'planned';
    else if (potential >= node.minGroups) status = 'placeholder';
    else status = 'missing';
    groups[id] = { needed: node.minGroups, covered: coveredNames, placeholders, status, satisfied: covered.size >= node.minGroups };
  }

  // --- roll up the requirement tree
  const summarize = node => {
    const mine = results.filter(r => r.path.includes(node.id));
    let status;
    if (node.type === 'distinctGroups') status = groups[node.id].status;
    else if (!mine.length) status = 'complete';
    else if (node.type === 'any') status = mine.reduce((best, r) => (ORDER[r.status] > ORDER[best] ? r.status : best), 'missing');
    else status = mine.reduce((worst, r) => (ORDER[r.status] < ORDER[worst] ? r.status : worst), 'complete');
    const out = { id: node.id, type: node.type, label: node.label || node.id, status };
    if (node.items) out.children = node.items.map(summarize);
    return out;
  };

  const count = s => results.filter(r => r.status === s).length;
  const credits = s => results.filter(r => (Array.isArray(s) ? s : [s]).includes(r.status)).reduce((t, r) => t + (r.credits || 0), 0);
  const usedKeys = new Set([...matchOfItem.keys()]);
  const advisories = [];
  for (const id of nodes.keys()) for (const r of ruleset.advisories({ requirement: id })) advisories.push({ ruleId: r.id, requirement: id, message: r.message, effect: r.effect || 'info', confidence: r.confidence });

  return {
    program: program.id,
    tree: summarize(program.requirements),
    demands: results,
    groups,
    summary: {
      total: results.length, complete: count('complete'), planned: count('planned'), placeholder: count('placeholder'), waived: count('waived'), missing: count('missing'),
      creditsComplete: credits(['complete', 'waived']), creditsPlanned: credits(['planned', 'placeholder']), creditsMissing: credits('missing'),
      satisfied: count('missing') === 0 && count('placeholder') === 0,
    },
    matched: results.filter(r => r.course).map(r => r.course),
    matchedTiles: results.filter(r => r.tile).map(r => r.tile),
    unused: courseItems.filter(c => !usedKeys.has(`c:${c}`)),
    advisories,
  };
}

/**
 * Audit every program the student has. Two passes: rules that depend on where else a course counts (for example "MATH 2090
 * counts for MATH 2070 when it is credited from a different major") only take effect in the second pass.
 */
export function auditAll({ dataset, plan, student, rules = dataset.rules, assignments = {} }) {
  const programIds = [...(student.majors || []), ...(student.minors || [])].filter(id => dataset.program(id));
  const countedFor = new Map();
  const ruleset = () => createRuleset(rules, student, { countedFor: c => countedFor.get(c) || new Set() });
  const run = () => programIds.map(id => auditProgram({ program: dataset.program(id), dataset, plan, ruleset: ruleset(), assignments }));
  for (const r of run()) for (const c of [...r.matched, ...r.matchedTiles]) { if (!countedFor.has(c)) countedFor.set(c, new Set()); countedFor.get(c).add(r.program); }
  const programs = run();
  return { programs, byProgram: Object.fromEntries(programs.map(p => [p.program, p])), countedFor };
}
