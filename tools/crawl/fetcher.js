// Polite, cache-first fetcher for catalog pages.
//  - honours robots.txt (Disallow/Allow, Crawl-delay) and never requests a disallowed path
//  - enforces a minimum delay between NETWORK requests, persisted on disk so restarts cannot skip it
//  - caches every response (including 404s) on disk, so a page is fetched at most once per cache
//  - identifies itself honestly and sends no personal data
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseRobots, rulesFor, isAllowed } from './robots.js';

export class DisallowedError extends Error {}

/**
 * The site answered with a bot-detection challenge (for example an AWS WAF "verify that you're not a robot" page)
 * instead of content. We do NOT try to get past it: no headless browsers, no user-agent spoofing, no solving.
 * The crawler records the block on disk and refuses further network requests until a human clears it.
 */
export class BotChallengeError extends Error {}

export function looksLikeBotChallenge(status, headers, body) {
  const waf = headers && typeof headers.get === 'function' && !!headers.get('x-amzn-waf-action');
  const markers = /AwsWafIntegration|awswaf|challenge-container|not a robot|captcha|cf-challenge|Attention Required/i.test(String(body).slice(0, 20000));
  return (waf && status !== 200) || ([202, 401, 403, 429, 503].includes(status) && markers);
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

export function createFetcher({
  origin,
  cacheDir,
  userAgent,
  minDelayMs = 120_000,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = Date.now,
  log = () => {},
  maxAttempts = 3,
  timeoutMs = 60_000,
  maxBytes = 5_000_000,
}) {
  const statePath = path.join(cacheDir, 'state.json');
  const indexPath = path.join(cacheDir, 'index.json');
  let index = null;
  let state = null;
  let rules = null;
  let baseDelayMs = minDelayMs;   // raised to robots.txt Crawl-delay when that is larger
  let delayMs = baseDelayMs;      // current delay; grows on errors, resets after a success

  async function load() {
    if (index) return;
    await mkdir(cacheDir, { recursive: true });
    index = await readJson(indexPath, {});
    state = await readJson(statePath, { lastRequestAt: 0 });
  }
  const persistState = () => writeFile(statePath, JSON.stringify(state));
  const persistIndex = () => writeFile(indexPath, JSON.stringify(index, null, 1));

  async function waitTurn() {
    const wait = state.lastRequestAt + delayMs - now();
    if (wait > 0) { log(`waiting ${Math.ceil(wait / 1000)}s (crawl delay)`); await sleep(wait); }
  }

  async function networkGet(url) {
    if (state.blocked) {
      throw new BotChallengeError(`network access is disabled: the site challenged this crawler on ${state.blocked.at} (${state.blocked.url}, HTTP ${state.blocked.status}). Do not work around it; get permission first, then delete "blocked" from ${statePath}.`);
    }
    let attempt = 0;
    for (;;) {
      attempt++;
      await waitTurn();
      state.lastRequestAt = now();
      await persistState();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' }, signal: ctl.signal, redirect: 'follow' });
      } catch (err) {
        clearTimeout(timer);
        if (attempt >= maxAttempts) throw new Error(`fetch failed for ${url}: ${err.message}`);
        delayMs = Math.min(delayMs * 2, baseDelayMs * 8);
        log(`network error (${err.message}); backing off to ${delayMs / 1000}s`);
        continue;
      }
      clearTimeout(timer);
      if (res.status !== 200) {
        const preview = await res.clone().text().catch(() => '');
        if (looksLikeBotChallenge(res.status, res.headers, preview)) {
          state.blocked = { at: new Date(now()).toISOString(), url, status: res.status };
          await persistState();
          throw new BotChallengeError(`bot-detection challenge (HTTP ${res.status}) at ${url}. Stopping; the crawler will not retry or work around it.`);
        }
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxAttempts) throw new Error(`giving up on ${url}: HTTP ${res.status}`);
        const ra = Number(res.headers.get('retry-after'));
        delayMs = Math.max(delayMs * 2, Number.isFinite(ra) ? ra * 1000 : 0);
        delayMs = Math.min(delayMs, baseDelayMs * 8);
        log(`HTTP ${res.status}; backing off to ${Math.round(delayMs / 1000)}s`);
        continue;
      }
      const body = (await res.text());
      if (Buffer.byteLength(body) > maxBytes) throw new Error(`response for ${url} is larger than ${maxBytes} bytes`);
      delayMs = baseDelayMs; // recovered
      return { status: res.status, body };
    }
  }

  async function ensureRobots() {
    if (rules) return;
    const url = origin + '/robots.txt';
    const cached = index[url];
    let text;
    if (cached && now() - Date.parse(cached.fetchedAt) < 24 * 3600 * 1000) text = await readFile(path.join(cacheDir, cached.file), 'utf8');
    else {
      log('fetching robots.txt');
      const { status, body } = await networkGet(url);
      if (status === 200) { await store(url, status, body, 'robots.txt'); text = body; } else text = ''; // no robots.txt: no restrictions
    }
    rules = rulesFor(parseRobots(text), userAgent);
    if (rules.crawlDelay != null) baseDelayMs = Math.max(minDelayMs, rules.crawlDelay * 1000);
    delayMs = baseDelayMs;
  }

  async function store(url, status, body, fileName) {
    const sha256 = createHash('sha256').update(body).digest('hex');
    const file = fileName || `${sha256.slice(0, 2)}/${createHash('sha1').update(url).digest('hex')}.html`;
    await mkdir(path.dirname(path.join(cacheDir, file)), { recursive: true });
    await writeFile(path.join(cacheDir, file), body);
    index[url] = { file, status, fetchedAt: new Date(now()).toISOString(), sha256, bytes: Buffer.byteLength(body) };
    await persistIndex();
    return index[url];
  }

  return {
    /** Returns { url, status, body, fromCache, fetchedAt, sha256 }. Throws DisallowedError for robots-disallowed paths. */
    async get(url, { force = false } = {}) {
      await load();
      const u = new URL(url);
      if (u.origin !== origin) throw new Error(`refusing to fetch outside ${origin}: ${url}`);
      await ensureRobots();
      if (!isAllowed(rules, u.pathname + u.search)) throw new DisallowedError(`robots.txt disallows ${u.pathname}${u.search}`);
      const hit = index[url];
      if (hit && !force) return { url, status: hit.status, body: await readFile(path.join(cacheDir, hit.file), 'utf8'), fromCache: true, fetchedAt: hit.fetchedAt, sha256: hit.sha256 };
      log(`GET ${url}`);
      const { status, body } = await networkGet(url);
      const meta = await store(url, status, body);
      return { url, status, body, fromCache: false, fetchedAt: meta.fetchedAt, sha256: meta.sha256 };
    },
    async has(url) { await load(); return !!index[url]; },
    async cachedUrls() { await load(); return Object.keys(index); },
    get effectiveDelayMs() { return delayMs; },
  };
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
