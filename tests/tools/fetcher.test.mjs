// Offline tests for the polite fetcher: no network, fake clock, fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFetcher, DisallowedError, BotChallengeError, looksLikeBotChallenge } from '../../tools/crawl/fetcher.js';
import { parseRobots, rulesFor, isAllowed } from '../../tools/crawl/robots.js';

const ORIGIN = 'https://catalog.example.test';
const ROBOTS = `User-agent: archive.org_bot\nCrawl-delay: 15\nDisallow: /portfolio.php\n\nUser-agent: *\nDisallow: /portfolio.php\nDisallow: /ajax/\nDisallow: /search_advanced.php\nCrawl-delay: 120\n`;

function harness({ responses = {} } = {}) {
  let clock = 1_000_000;
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, at: clock, ua: opts.headers['User-Agent'] });
    const r = responses[new URL(url).pathname + new URL(url).search];
    const spec = typeof r === 'function' ? r(calls.length) : r;
    if (!spec) return new Response('not found', { status: 404 });
    return new Response(spec.body ?? '', { status: spec.status ?? 200, headers: spec.headers ?? {} });
  };
  const sleep = async ms => { sleeps.push(ms); clock += ms; };
  return { fetchImpl, sleep, now: () => clock, calls, sleeps, advance: ms => { clock += ms; } };
}

async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'crawl-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('robots parsing: group selection, longest match, crawl-delay', () => {
  const rules = rulesFor(parseRobots(ROBOTS), 'planner-verifier/0.1');
  assert.equal(rules.crawlDelay, 120);
  assert.equal(isAllowed(rules, '/ajax/x'), false);
  assert.equal(isAllowed(rules, '/preview_course_nopop.php?catoid=35&coid=1'), true);
  const named = rulesFor(parseRobots(ROBOTS), 'archive.org_bot/1.0');
  assert.equal(named.crawlDelay, 15);
  const longest = rulesFor(parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b'), 'x');
  assert.equal(isAllowed(longest, '/a/b/c'), true);
  assert.equal(isAllowed(longest, '/a/x'), false);
  assert.equal(isAllowed(rulesFor(parseRobots('User-agent: *\nDisallow:'), 'x'), '/anything'), true);
});

test('enforces the robots.txt crawl delay between network requests and identifies itself', async () => {
  const h = harness({ responses: { '/robots.txt': { body: ROBOTS }, '/a': { body: 'A' }, '/b': { body: 'B' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'planner-verifier/0.1', minDelayMs: 1000, ...h });
    await f.get(ORIGIN + '/a');
    await f.get(ORIGIN + '/b');
    const gaps = h.calls.slice(1).map((c, i) => c.at - h.calls[i].at);
    assert.equal(h.calls.length, 3, 'robots.txt + two pages');
    assert.ok(gaps.every(g => g >= 120_000), `every gap must be >= 120 s, got ${gaps}`);
    assert.ok(h.calls.every(c => c.ua === 'planner-verifier/0.1'));
  });
});

test('cache hit makes no request and no wait', async () => {
  const h = harness({ responses: { '/robots.txt': { body: 'User-agent: *\n' }, '/a': { body: 'A' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    const first = await f.get(ORIGIN + '/a');
    const n = h.calls.length;
    const sleepsBefore = h.sleeps.length;
    const second = await f.get(ORIGIN + '/a');
    assert.equal(second.fromCache, true);
    assert.equal(second.body, 'A');
    assert.equal(second.sha256, first.sha256);
    assert.equal(h.calls.length, n);
    assert.equal(h.sleeps.length, sleepsBefore);
  });
});

test('the delay survives a restart (persisted on disk)', async () => {
  const h = harness({ responses: { '/robots.txt': { body: 'User-agent: *\n' }, '/a': { body: 'A' }, '/b': { body: 'B' } } });
  await withDir(async dir => {
    const f1 = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 5000, ...h });
    await f1.get(ORIGIN + '/a');
    const t = h.now();
    const f2 = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 5000, ...h });
    await f2.get(ORIGIN + '/b');
    const last = h.calls[h.calls.length - 1];
    assert.ok(last.at - t >= 0);
    assert.ok(last.at - h.calls[h.calls.length - 2].at >= 5000);
  });
});

test('never requests a robots-disallowed path', async () => {
  const h = harness({ responses: { '/robots.txt': { body: ROBOTS }, '/ajax/x': { body: 'no' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    await assert.rejects(() => f.get(ORIGIN + '/ajax/x'), DisallowedError);
    assert.ok(!h.calls.some(c => c.url.includes('/ajax/')));
  });
});

test('refuses other origins', async () => {
  const h = harness({ responses: { '/robots.txt': { body: '' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    await assert.rejects(() => f.get('https://evil.example.test/a'), /refusing/);
  });
});

test('429 backs off (doubling) and then succeeds; gives up after maxAttempts', async () => {
  let n = 0;
  const h = harness({ responses: { '/robots.txt': { body: 'User-agent: *\n' }, '/a': () => (++n < 3 ? { status: 429 } : { body: 'ok' }), '/never': { status: 503 } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, maxAttempts: 3, ...h });
    const r = await f.get(ORIGIN + '/a');
    assert.equal(r.body, 'ok');
    const times = h.calls.filter(c => c.url.endsWith('/a')).map(c => c.at);
    assert.ok(times[1] - times[0] >= 2000 && times[2] - times[1] >= 4000, `backoff gaps ${times}`);
    await assert.rejects(() => f.get(ORIGIN + '/never'), /giving up/);
  });
});

const WAF_PAGE = '<html><script>window.awsWafCookieDomainList=[];</script><div id="challenge-container"></div><noscript>we need to verify that you\'re not a robot</noscript></html>';

test('a bot-detection challenge stops the crawler: not cached, not retried, and later requests are refused offline', async () => {
  const h = harness({ responses: { '/robots.txt': { body: 'User-agent: *\n' }, '/page': { status: 202, body: WAF_PAGE, headers: { 'x-amzn-waf-action': 'challenge' } }, '/other': { body: 'fine' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    await assert.rejects(() => f.get(ORIGIN + '/page'), BotChallengeError);
    const n = h.calls.length;
    assert.equal(h.calls.filter(c => c.url.endsWith('/page')).length, 1, 'no retry');
    assert.equal(await f.has(ORIGIN + '/page'), false, 'challenge page must not be cached as content');
    await assert.rejects(() => f.get(ORIGIN + '/other'), BotChallengeError);
    assert.equal(h.calls.length, n, 'no further network requests after a block');
    // and the block survives a restart until a human clears it
    const f2 = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    await assert.rejects(() => f2.get(ORIGIN + '/other'), BotChallengeError);
    assert.equal(h.calls.length, n);
  });
});

test('looksLikeBotChallenge: real content is never mistaken for a challenge', () => {
  const headers = new Headers();
  assert.equal(looksLikeBotChallenge(200, headers, WAF_PAGE), false, 'HTTP 200 content is never a challenge');
  assert.equal(looksLikeBotChallenge(202, headers, WAF_PAGE), true);
  assert.equal(looksLikeBotChallenge(403, headers, '<h1>Forbidden</h1>'), false, 'plain 403 is just an error');
  assert.equal(looksLikeBotChallenge(403, new Headers({ 'x-amzn-waf-action': 'block' }), ''), true);
});

test('404 is cached and not re-requested', async () => {
  const h = harness({ responses: { '/robots.txt': { body: '' } } });
  await withDir(async dir => {
    const f = createFetcher({ origin: ORIGIN, cacheDir: dir, userAgent: 'x', minDelayMs: 1000, ...h });
    const a = await f.get(ORIGIN + '/gone');
    const n = h.calls.length;
    const b = await f.get(ORIGIN + '/gone');
    assert.equal(a.status, 404);
    assert.equal(b.fromCache, true);
    assert.equal(h.calls.length, n);
  });
});
