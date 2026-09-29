// Minimal robots.txt parser: enough to honour Disallow/Allow prefixes and Crawl-delay for our user agent.
// Group selection: the group whose User-agent token is contained in our UA string wins, else the "*" group.

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], allow: [], disallow: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow') current.disallow.push(value);
    else if (key === 'allow') current.allow.push(value);
    else if (key === 'crawl-delay') { const n = Number(value); if (Number.isFinite(n) && n >= 0) current.crawlDelay = n; }
  }
  return groups;
}

export function rulesFor(groups, userAgent) {
  const ua = String(userAgent).toLowerCase();
  const specific = groups.find(g => g.agents.some(a => a !== '*' && ua.includes(a)));
  return specific || groups.find(g => g.agents.includes('*')) || { agents: ['*'], allow: [], disallow: [], crawlDelay: null };
}

/** Longest-match wins; Allow beats Disallow on a tie; an empty Disallow allows everything. */
export function isAllowed(rules, pathAndQuery) {
  let best = { len: -1, allow: true };
  for (const p of rules.disallow) if (p && pathAndQuery.startsWith(p) && p.length > best.len) best = { len: p.length, allow: false };
  for (const p of rules.allow) if (p && pathAndQuery.startsWith(p) && p.length >= best.len) best = { len: p.length, allow: true };
  return best.allow;
}
