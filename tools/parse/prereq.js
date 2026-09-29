// Catalog requisite text -> structured expressions (see src/core/schema.js, validateExpr).
//
// Policy: only interpret text this grammar fully understands. Anything left over (unknown words, ambiguous
// "A and B or C" mixes, restrictions such as "admission to the honors college") makes the segment `manual`: the
// original text is kept verbatim in an {unparsed} leaf and reported, never guessed at.
import { COURSE_ID } from '../../src/core/schema.js';

const MARKER = /(Prereq(?:uisites?)?\.?(?:\s*or\s*(?:concurrent|co-?req(?:uisite)?)\.?)?|Co-?req(?:uisites?)?\.?)\s*:/gi;
const CONSENT = /[,;]?\s*(?:or\s+)?(?:with\s+)?(?:written\s+)?(?:consent|permission) of (?:the\s+)?(department head|division head|department|division|instructor|school|college|program|dean|director)\b/i;
const STANDING = /\b(freshman|sophomore|junior|senior) standing\b/i;
const LEAD_CONCURRENT = /^\s*(?:credit or registration|concurrent (?:registration|enrollment)|registration or credit) (?:in|for)\s+/i;
const TRAIL_CONCURRENT = /[,;]?\s*(?:or\s+)?(?:concurrent(?:ly)?(?:\s+(?:registration|enrollment))?|registration)\s*$/i;
const GRADE = /(?:,?\s*with\s+)?(?:an?\s+)?(?:minimum\s+)?(?:grade\s+of\s+)?["“”']?([A-D])["“”']?\s+or\s+better(?:\s+in)?/i;

const normalize = s => String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\s+([,;.])/g, '$1').trim();

/** Split full requisite text into [{kind:'prereq'|'coreq', concurrent:boolean, body}] using the "Prereq.:" / "Coreq.:" markers. */
function segments(text) {
  const t = normalize(text);
  const marks = [...t.matchAll(MARKER)];
  return marks.map((m, i) => {
    const raw = t.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : t.length).trim();
    // The requisite sentence ends at the first period that is followed by a capital letter or the end of the text.
    const cut = /\.(?=\s+[A-Z]|\s*$)/.exec(raw);
    const body = (cut ? raw.slice(0, cut.index) : raw).trim();
    const head = m[1].toLowerCase();
    return { kind: head.startsWith('co') ? 'coreq' : 'prereq', concurrent: /or\s*(concurrent|co)/.test(head), body, label: normalize(m[0]) };
  });
}

function leaf(subject, number, extra) {
  const id = `${subject}${number}`;
  return COURSE_ID.test(id) ? { course: id, ...extra } : null;
}

/** Parse one segment body. Returns { expr } or { manual: reason }. */
function parseBody(bodyIn, { concurrent: segConcurrent }) {
  let s = normalize(bodyIn);
  const notes = { waiver: null, standing: null, grade: null, concurrent: segConcurrent };
  const c = CONSENT.exec(s);
  if (c) { notes.waiver = `consent of ${c[1].toLowerCase()}`; s = s.replace(CONSENT, ' '); }
  const st = STANDING.exec(s);
  if (st) { notes.standing = st[1].toLowerCase(); s = s.replace(STANDING, ' '); }
  if (LEAD_CONCURRENT.test(s)) { notes.concurrent = true; s = s.replace(LEAD_CONCURRENT, ''); }
  const g = GRADE.exec(s);
  if (g) { notes.grade = g[1].toUpperCase(); s = s.replace(GRADE, ' '); }
  if (TRAIL_CONCURRENT.test(s) && /\d{4}/.test(s)) { notes.concurrent = true; s = s.replace(TRAIL_CONCURRENT, ''); }
  s = normalize(s).replace(/^[,;\s]+|[,;\s]+$/g, '');

  // Tokenize what is left: course references, bare numbers (subject inherited), connectors.
  const tokens = [];
  let rest = s;
  let subject = null;
  const TOK = /^\s*(?:([A-Z]{2,5})\s*(\d{4}[A-Z]?)|(\d{4}[A-Z]?)|(,|;|\/)|\b(and|or)\b)/;
  while (rest.length) {
    const m = TOK.exec(rest);
    if (!m) return { manual: `unrecognized text: "${rest.slice(0, 60)}"` };
    if (m[1]) { subject = m[1]; tokens.push({ t: 'ref', subject, number: m[2] }); }
    else if (m[3]) { if (!subject) return { manual: 'course number without a subject' }; tokens.push({ t: 'ref', subject, number: m[3] }); }
    else tokens.push({ t: 'op', v: m[4] ? (m[4] === ';' ? ';' : m[4] === '/' ? 'or' : ',') : m[5] });
    rest = rest.slice(m[0].length);
  }

  const refOpts = {};
  if (notes.concurrent) refOpts.concurrent = 'ok';
  if (notes.grade) refOpts.minGrade = notes.grade;

  // Chunks separated by ';' are ANDed. Inside a chunk the connectors must be homogeneous.
  const chunks = [[]];
  for (const tok of tokens) { if (tok.t === 'op' && tok.v === ';') chunks.push([]); else chunks[chunks.length - 1].push(tok); }
  const parts = [];
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    const ops = new Set(chunk.filter(x => x.t === 'op').map(x => x.v));
    const refs = chunk.filter(x => x.t === 'ref').map(x => leaf(x.subject, x.number, refOpts));
    if (refs.some(r => !r)) return { manual: 'malformed course reference' };
    // alternating ref, op, ref, ... with an optional "," before "and"/"or" (Oxford comma)
    for (let i = 0; i < chunk.length; i++) if ((i % 2 === 0) !== (chunk[i].t === 'ref')) {
      const prev = chunk[i - 1];
      if (chunk[i].t === 'op' && prev && prev.t === 'op' && prev.v === ',' && (chunk[i].v === 'and' || chunk[i].v === 'or')) continue;
      if (chunk[i].t === 'ref' && prev && prev.t === 'op' && chunk[i - 2] && chunk[i - 2].t === 'op') continue;
      return { manual: 'unexpected connector placement' };
    }
    const hasAnd = ops.has('and'), hasOr = ops.has('or');
    if (hasAnd && hasOr) return { manual: 'mixes "and" with "or"; ambiguous grouping' };
    if (refs.length === 1) parts.push(refs[0]);
    else parts.push(hasOr ? { any: refs } : { all: refs });
  }
  if (notes.standing) parts.push({ standing: notes.standing });

  if (!parts.length) return notes.waiver ? { expr: { consent: notes.waiver.replace('consent of ', '') } } : { manual: 'no requisite content' };
  let expr = parts.length === 1 ? parts[0] : { all: parts };
  if (notes.waiver) {
    if (!expr.all && !expr.any) expr = { all: [expr] };
    expr = { ...expr, waiver: notes.waiver };
  }
  return { expr };
}

/**
 * parseRequisites(text) -> { prereq?, coreq?, parse: 'auto' | 'manual' | 'none', reasons: string[], text }
 * `text` is the catalog text that contains "Prereq.:" / "Coreq.:" markers (a description may follow).
 * The returned `text` is only the requisite sentences, exactly as written (whitespace tidied).
 */
export function parseRequisites(text) {
  const segs = segments(text);
  const out = { parse: segs.length ? 'auto' : 'none', reasons: [], text: segs.map(s => `${s.label} ${s.body}.`).join(' ') };
  const merged = { prereq: [], coreq: [] };
  for (const seg of segs) {
    const r = parseBody(seg.body, seg);
    if (r.manual) { out.parse = 'manual'; out.reasons.push(`${seg.kind}: ${r.manual}`); merged[seg.kind].push({ unparsed: seg.body }); }
    else merged[seg.kind].push(r.expr);
  }
  for (const k of ['prereq', 'coreq']) if (merged[k].length) out[k] = merged[k].length === 1 ? merged[k][0] : { all: merged[k] };
  return out;
}

/** Human-readable rendering of an expression, used for the "as interpreted" line and for round-trip checks. */
export function renderExpr(e) {
  if (!e) return '';
  if (e.course) {
    const bits = [];
    if (e.minGrade) bits.push(`${e.minGrade} or better`);
    if (e.concurrent === 'ok') bits.push('may be taken concurrently');
    if (e.concurrent === 'required') bits.push('taken concurrently');
    const label = `${e.course.replace(/^([A-Z]+)(\d)/, '$1 $2')}`;
    return bits.length ? `${label} (${bits.join(', ')})` : label;
  }
  if (e.standing) return `${e.standing} standing`;
  if (e.credits) return `${e.credits} credit hours`;
  if (e.consent) return `consent of ${e.consent}`;
  if (e.unparsed) return `[needs review: ${e.unparsed}]`;
  const join = e.all ? ' and ' : ' or ';
  const inner = (e.all || e.any).map(x => { const r = renderExpr(x); return (x.all || x.any) && (x.all ? ' and ' : ' or ') !== join ? `(${r})` : r; }).join(join);
  return e.waiver ? `${inner}, or ${e.waiver}` : inner;
}
