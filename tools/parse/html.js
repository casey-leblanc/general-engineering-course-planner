// Tiny dependency-free HTML helpers. The catalog markup is regular enough that targeted regexes are sufficient,
// and each parser is tested against saved fixtures so a markup change fails loudly instead of corrupting data.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', bull: '•' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : m));
}

/** Visible text of an HTML fragment: tags removed, <br>/block ends become newlines, whitespace collapsed per line. */
export function textOf(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|ul|ol|table)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/ /g, ' ')
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter((l, i, a) => l || (a[i - 1] && a[i - 1] !== ''))
    .join('\n').trim();
}

/** All <a> elements as {href, onclick, html, text}. */
export function anchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const get = name => { const a = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs); return a ? decodeEntities(a[2] ?? a[3]) : ''; };
    out.push({ href: get('href'), onclick: get('onclick'), html: m[2], text: textOf(m[2]).replace(/\s+/g, ' ').trim() });
  }
  return out;
}
