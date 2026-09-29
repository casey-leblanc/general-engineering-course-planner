// A tiny vector drawing model with two writers: SVG (any browser) and PDF (opens anywhere, prints at any size).
// No dependencies. Text is Helvetica (one of the 14 standard PDF fonts, so nothing is embedded); its widths are built in so text can be
// centred and wrapped identically in both outputs.
//
// Coordinates are points (1/72 in) with the origin at the TOP LEFT and y growing downward, like SVG. The PDF writer flips them.
import { deflateSync } from 'node:zlib';

// ---- text metrics -------------------------------------------------------------------------------------------------------
// Advance widths (per 1000 em) of the printable ASCII range 32..126 for Helvetica and Helvetica-Bold (Adobe core-14 metrics).
const HELV = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584';
const BOLD = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584';
const WIDTHS = { regular: HELV.split(' ').map(Number), bold: BOLD.split(' ').map(Number) };
WIDTHS.italic = WIDTHS.regular;
// The few non-ASCII characters we use, in WinAnsi (the PDF encoding): char -> [code, regular width, bold width]
const WIN = { '·': [0xB7, 278, 278], '–': [0x96, 556, 556], '—': [0x97, 1000, 1000], '’': [0x92, 222, 278], '…': [0x85, 1000, 1000], '×': [0xD7, 584, 584], '§': [0xA7, 556, 556], '°': [0xB0, 400, 400], '±': [0xB1, 584, 584] };

export const FONTS = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };

/** Width in points of `s` set in `font` at `size`. */
export function textWidth(s, size, font = 'regular') {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) w += WIDTHS[font][c - 32];
    else if (WIN[ch]) w += font === 'bold' ? WIN[ch][2] : WIN[ch][1];
    else w += 556;
  }
  return (w * size) / 1000;
}

/** Break `s` into at most `maxLines` lines no wider than `maxW`; whatever does not fit ends in an ellipsis. */
export function wrapText(s, maxW, size, font = 'regular', maxLines = 99) {
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (textWidth(next, size, font) <= maxW || !cur) { cur = next; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
  }
  if (cur) lines.push(cur);
  const last = lines.length - 1;
  if (last >= 0 && textWidth(lines[last], size, font) > maxW) {
    let t = lines[last];
    while (t.length > 1 && textWidth(`${t}…`, size, font) > maxW) t = t.slice(0, -1);
    lines[last] = `${t.trimEnd()}…`;
  }
  return lines;
}

// ---- the scene ----------------------------------------------------------------------------------------------------------
export class Scene {
  constructor(width, height) { this.width = width; this.height = height; this.ops = []; }
  /** o: { r, fill, stroke, lw, dash } */
  rect(x, y, w, h, o = {}) { this.ops.push({ t: 'rect', x, y, w, h, r: Math.min(o.r || 0, w / 2, h / 2), fill: o.fill, stroke: o.stroke, lw: o.lw == null ? 0.8 : o.lw, dash: o.dash }); return this; }
  circle(cx, cy, r, o = {}) { return this.rect(cx - r, cy - r, 2 * r, 2 * r, { ...o, r }); }
  /** open polyline; o: { stroke, lw, dash } */
  line(points, o = {}) { this.ops.push({ t: 'line', points, stroke: o.stroke || '#000000', lw: o.lw == null ? 0.8 : o.lw, dash: o.dash }); return this; }
  /** closed polygon; o: { fill, stroke, lw } */
  poly(points, o = {}) { this.ops.push({ t: 'poly', points, fill: o.fill, stroke: o.stroke, lw: o.lw == null ? 0.8 : o.lw }); return this; }
  /** o: { size, font: 'regular'|'bold'|'italic', anchor: 'start'|'middle'|'end', fill, rot (degrees, counter-clockwise) }; (x, y) is the baseline */
  text(x, y, s, o = {}) { this.ops.push({ t: 'text', x, y, s: String(s), size: o.size || 8, font: o.font || 'regular', anchor: o.anchor || 'start', fill: o.fill || '#000000', rot: o.rot || 0 }); return this; }
}

// ---- SVG ----------------------------------------------------------------------------------------------------------------
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = v => Math.round(v * 100) / 100;
const paint = o => `fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}"${o.stroke ? ` stroke-width="${o.lw}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}`;

export function toSvg(scene, { title = '' } = {}) {
  const body = scene.ops.map(op => {
    if (op.t === 'rect') return `<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}"${op.r ? ` rx="${n(op.r)}"` : ''} ${paint(op)}/>`;
    if (op.t === 'line') return `<polyline points="${op.points.map(p => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="none" stroke="${op.stroke}" stroke-width="${op.lw}"${op.dash ? ` stroke-dasharray="${op.dash.join(' ')}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (op.t === 'poly') return `<polygon points="${op.points.map(p => `${n(p[0])},${n(p[1])}`).join(' ')}" ${paint(op)} stroke-linejoin="round"/>`;
    const anchor = { start: 'start', middle: 'middle', end: 'end' }[op.anchor];
    return `<text x="${n(op.x)}" y="${n(op.y)}" font-size="${op.size}"${op.font === 'bold' ? ' font-weight="700"' : ''}${op.font === 'italic' ? ' font-style="italic"' : ''} text-anchor="${anchor}" fill="${op.fill}"${op.rot ? ` transform="rotate(${-op.rot} ${n(op.x)} ${n(op.y)})"` : ''}>${xml(op.s)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" font-family="Helvetica, Arial, sans-serif"><title>${xml(title)}</title>\n<rect width="${scene.width}" height="${scene.height}" fill="#ffffff"/>\n${body}\n</svg>\n`;
}

// ---- PDF ----------------------------------------------------------------------------------------------------------------
const rgb = hex => {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const m = /^#?([0-9a-f]{6})$/i.exec(short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : hex);
  if (!m) throw new Error(`bad colour ${hex}`);
  return [0, 2, 4].map(i => n(parseInt(m[1].slice(i, i + 2), 16) / 255)).join(' ');
};
const pdfString = s => {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    const code = c >= 32 && c <= 126 ? c : (WIN[ch] ? WIN[ch][0] : 63);
    out += code === 40 || code === 41 || code === 92 ? `\\${String.fromCharCode(code)}` : String.fromCharCode(code);
  }
  return `(${out})`;
};
const FONT_KEY = { regular: 'F1', bold: 'F2', italic: 'F3' };
const K = 0.5522847498;

function roundedRect(x, y, w, h, r, H) {
  const yb = n(H - y - h), yt = n(yb + h), x1 = n(x + w);
  if (!r) return `${n(x)} ${yb} ${n(w)} ${n(h)} re`;
  const k = K * r;
  return [
    `${n(x + r)} ${yb} m`, `${n(x1 - r)} ${yb} l`,
    `${n(x1 - r + k)} ${yb} ${x1} ${n(yb + r - k)} ${x1} ${n(yb + r)} c`,
    `${x1} ${n(yt - r)} l`,
    `${x1} ${n(yt - r + k)} ${n(x1 - r + k)} ${yt} ${n(x1 - r)} ${yt} c`,
    `${n(x + r)} ${yt} l`,
    `${n(x + r - k)} ${yt} ${n(x)} ${n(yt - r + k)} ${n(x)} ${n(yt - r)} c`,
    `${n(x)} ${n(yb + r)} l`,
    `${n(x)} ${n(yb + r - k)} ${n(x + r - k)} ${yb} ${n(x + r)} ${yb} c`, 'h',
  ].join('\n');
}
const strokeSetup = o => `${n(o.lw)} w ${o.dash ? `[${o.dash.join(' ')}] 0 d` : '[] 0 d'} ${rgb(o.stroke)} RG`;
const paintOp = o => (o.fill && o.stroke ? 'B' : o.fill ? 'f' : o.stroke ? 'S' : 'n');

function pageContent(scene) {
  const H = scene.height;
  const out = ['1 J 1 j'];   // round caps and joins
  for (const op of scene.ops) {
    if (op.t === 'rect') {
      out.push('q');
      if (op.fill) out.push(`${rgb(op.fill)} rg`);
      if (op.stroke) out.push(strokeSetup(op));
      out.push(roundedRect(op.x, op.y, op.w, op.h, op.r, H), paintOp(op), 'Q');
    } else if (op.t === 'line') {
      out.push('q', strokeSetup(op), op.points.map((p, i) => `${n(p[0])} ${n(H - p[1])} ${i ? 'l' : 'm'}`).join('\n'), 'S', 'Q');
    } else if (op.t === 'poly') {
      out.push('q');
      if (op.fill) out.push(`${rgb(op.fill)} rg`);
      if (op.stroke) out.push(strokeSetup(op));
      out.push(op.points.map((p, i) => `${n(p[0])} ${n(H - p[1])} ${i ? 'l' : 'm'}`).join('\n'), 'h', paintOp(op), 'Q');
    } else {
      const w = textWidth(op.s, op.size, op.font);
      const shift = op.anchor === 'middle' ? -w / 2 : op.anchor === 'end' ? -w : 0;
      // PDF's y axis points up, so a counter-clockwise turn is the usual rotation matrix, and the anchor shift runs along the text
      const a = (op.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const px = op.x + shift * cos, py = H - op.y + shift * sin;
      out.push('q', `${rgb(op.fill)} rg`, 'BT', `/${FONT_KEY[op.font]} ${op.size} Tf`, `${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${n(px)} ${n(py)} Tm`, `${pdfString(op.s)} Tj`, 'ET', 'Q');
    }
  }
  return out.join('\n');
}

/** One PDF document; each Scene is a page of its own size. Returns a Buffer. */
export function toPdf(scenes, { title = '', subject = '', creator = 'LSU Course Planner' } = {}) {
  const N_FIXED = 6;   // 1 catalog, 2 pages, 3-5 fonts, 6 info
  const objs = [];
  const put = (num, body) => { objs[num - 1] = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'); };
  const pageNum = i => N_FIXED + 1 + 2 * i, contentNum = i => N_FIXED + 2 + 2 * i;

  put(1, '<< /Type /Catalog /Pages 2 0 R >>');
  put(2, `<< /Type /Pages /Kids [${scenes.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] /Count ${scenes.length} >>`);
  put(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  put(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  put(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  put(6, `<< /Title ${pdfString(title)} /Subject ${pdfString(subject)} /Creator ${pdfString(creator)} /Producer ${pdfString(creator)} >>`);
  scenes.forEach((scene, i) => {
    put(pageNum(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${scene.width} ${scene.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentNum(i)} 0 R >>`);
    const data = deflateSync(Buffer.from(pageContent(scene), 'latin1'));
    put(contentNum(i), Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')]));
  });

  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((body, i) => {
    offsets.push(pos);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(chunk);
    pos += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
