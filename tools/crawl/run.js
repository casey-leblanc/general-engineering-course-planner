#!/usr/bin/env node
// Catalog crawler. Resumable and cache-first; see fetcher.js for the politeness guarantees.
//
//   node tools/crawl/run.js status   --year 2026-2027
//   node tools/crawl/run.js discover --year 2026-2027     fetch the program listing, write the program index
//   node tools/crawl/run.js programs --year 2026-2027     fetch the target program pages (targets.json)
//   node tools/crawl/run.js courses  --year 2026-2027     fetch every course page linked from cached program pages
//   node tools/crawl/run.js all      --year 2026-2027     the three steps above, in order
//
// Options: --cache <dir> (default .catalog-cache)   --delay <seconds> (default 120, never below robots.txt Crawl-delay)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './fetcher.js';
import { parseProgramsList } from '../parse/programs-list.js';
import { courseLinks } from '../parse/program-page.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(argv[i]);
  }
  return out;
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
let logFile = null; // set once the cache dir is known, so a long run can be followed with `Get-Content -Wait`
const log = m => {
  const line = `[${stamp()}] ${m}`;
  console.log(line);
  if (logFile) { try { appendFileSync(logFile, line + '\n'); } catch { /* logging must never stop the crawl */ } }
};

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0] || 'status';
  const cfg = JSON.parse(await readFile(path.join(here, 'targets.json'), 'utf8'));
  const year = a.year || Object.keys(cfg.years).sort().pop();
  const y = cfg.years[year];
  if (!y) throw new Error(`unknown year ${year}; known: ${Object.keys(cfg.years).join(', ')}`);
  const cacheDir = path.resolve(root, a.cache || '.catalog-cache');
  await mkdir(cacheDir, { recursive: true });
  logFile = path.join(cacheDir, 'crawl.log');

  const fetcher = createFetcher({
    origin: cfg.origin, cacheDir, userAgent: cfg.userAgent,
    minDelayMs: Math.max(1, Number(a.delay || 120)) * 1000, log,
  });
  const url = (file, params) => `${cfg.origin}/${file}?${new URLSearchParams(params)}`;
  const listUrl = url('content.php', { catoid: y.catoid, navoid: y.programListNavoid });
  const indexFile = path.join(cacheDir, `programs-${year}.json`);
  const readIndex = async () => JSON.parse(await readFile(indexFile, 'utf8'));

  async function discover() {
    log(`discovering programs for ${year}`);
    const seen = new Map();
    const queue = [listUrl];
    const done = new Set();
    while (queue.length && done.size < 30) {
      const u = queue.shift();
      if (done.has(u)) continue;
      done.add(u);
      const res = await fetcher.get(u);
      if (res.status !== 200) throw new Error(`program listing returned HTTP ${res.status}: ${u}`);
      const { programs, pageLinks } = parseProgramsList(res.body);
      programs.forEach(p => seen.set(p.poid, p));
      for (const l of pageLinks) queue.push(new URL(l, u).href);
      log(`listing page ${done.size}: ${programs.length} programs (${seen.size} total)`);
    }
    if (!seen.size) throw new Error('no programs found in the listing: the page markup may have changed (see tools/parse/programs-list.js)');
    await writeFile(indexFile, JSON.stringify({ year, catoid: y.catoid, fetchedAt: new Date().toISOString(), programs: [...seen.values()] }, null, 1));
    log(`wrote ${path.relative(root, indexFile)}`);
  }

  async function resolveTargets() {
    const index = await readIndex();
    const resolved = [];
    const problems = [];
    for (const t of y.programs) {
      if (t.poid) { resolved.push({ ...t, name: t.name || index.programs.find(p => p.poid === t.poid)?.name || null }); continue; }
      const hits = index.programs.filter(p => p.name.toLowerCase().includes(t.match.toLowerCase()));
      if (hits.length === 1) resolved.push({ ...t, poid: hits[0].poid, name: hits[0].name });
      else problems.push(`${t.key}: "${t.match}" matched ${hits.length} programs${hits.length ? ': ' + hits.map(h => `${h.name} (poid ${h.poid})`).join('; ') : ''}`);
    }
    if (problems.length) {
      log('AMBIGUOUS OR MISSING TARGETS (fix tools/crawl/targets.json, then re-run):');
      problems.forEach(p => log('  ' + p));
    }
    return { resolved, problems };
  }

  async function programs() {
    const { resolved, problems } = await resolveTargets();
    // Fetch the unambiguous targets now; ambiguous ones are reported above and skipped rather than guessed.
    for (const t of resolved) {
      const res = await fetcher.get(url('preview_program.php', { catoid: y.catoid, poid: t.poid }));
      log(`${t.key}: HTTP ${res.status}, ${res.body.length} bytes${res.fromCache ? ' (cached)' : ''}`);
    }
    if (problems.length) log(`${problems.length} target(s) skipped`);
  }

  async function courses() {
    const { resolved } = await resolveTargets();
    const ordered = [];
    const seen = new Set();
    for (const t of resolved) {
      const res = await fetcher.get(url('preview_program.php', { catoid: y.catoid, poid: t.poid }));
      for (const c of courseLinks(res.body)) if (!seen.has(c.coid)) { seen.add(c.coid); ordered.push({ ...c, from: t.key }); }
    }
    const todo = [];
    for (const c of ordered) if (!(await fetcher.has(url('preview_course_nopop.php', { catoid: y.catoid, coid: c.coid })))) todo.push(c);
    log(`${ordered.length} distinct courses linked from target programs; ${todo.length} not cached yet (about ${Math.round(todo.length * fetcher.effectiveDelayMs / 60000)} min at the crawl delay)`);
    let n = 0;
    for (const c of todo) {
      const res = await fetcher.get(url('preview_course_nopop.php', { catoid: y.catoid, coid: c.coid }));
      log(`course ${++n}/${todo.length}: ${c.code || '?'} (coid ${c.coid}) HTTP ${res.status}`);
    }
    log('courses step complete');
  }

  if (cmd === 'status') {
    const urls = await fetcher.cachedUrls();
    log(`${urls.length} cached pages in ${path.relative(root, cacheDir) || '.'}`);
    return;
  }
  if (cmd === 'discover' || cmd === 'all') await discover();
  if (cmd === 'programs' || cmd === 'all') await programs();
  if (cmd === 'courses' || cmd === 'all') await courses();
  if (!['status', 'discover', 'programs', 'courses', 'all'].includes(cmd)) throw new Error(`unknown command ${cmd}`);
}

main().catch(err => {
  const blocked = err && err.constructor && err.constructor.name === 'BotChallengeError';
  log(`${blocked ? 'STOPPED (bot challenge)' : 'FAILED'}: ${err.message}`);
  process.exit(blocked ? 3 : 1);
});
