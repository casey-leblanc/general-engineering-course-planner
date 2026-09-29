// What a tile on the planner is. A tile id is one of:
//   a course id ("EE2120")                        -> a course record in the dataset
//   a requirement id ("BE-BSBE/design-electives/1") -> a placeholder for "some course that fills this slot"
//   a custom id ("c-...")                         -> a course the student typed in (state.custom)
// Everything else (a course the dataset does not know) is shown as-is and never checked.
import { demandInfo } from './requirements.js';

export const courseCode = id => { const m = /^([A-Z]+)(\d{4}[A-Z]?)$/.exec(id); return m ? `${m[1]} ${m[2]}` : id; };
export const isSlotId = id => id.includes('/');
export const isCustomId = id => id.startsWith('c-');

const clampCredits = (v, fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 && n <= 20 ? n : fallback; };

/**
 * { id, type: 'course'|'slot'|'custom'|'unknown', code, title, credits, difficulty, hints, attrs, note, label, record?, info? }
 * `state` supplies custom courses and per-tile overrides (note, label, credits, difficulty).
 */
export function describeTile(id, { dataset, state }) {
  const meta = (state && state.meta && state.meta[id]) || {};
  const base = { id, note: meta.note || '', label: meta.label || '', hints: [], attrs: [] };
  const custom = state && state.custom && state.custom[id];
  if (custom) {
    return { ...base, type: 'custom', code: custom.code, title: custom.title || '', credits: clampCredits(meta.cr ?? custom.cr, 3), difficulty: meta.diff || custom.diff || 'normal' };
  }
  if (isSlotId(id)) {
    const info = demandInfo(dataset, id);
    if (info) return { ...base, type: 'slot', code: info.label, title: '', credits: clampCredits(meta.cr, info.credits), difficulty: meta.diff || 'normal', hints: info.hints || [], info };
  }
  const rec = dataset.course(id);
  if (rec) {
    return {
      ...base, type: 'course', code: courseCode(id), title: meta.title || (rec.title === id ? '' : rec.title), credits: clampCredits(meta.cr, dataset.credits(id)),
      difficulty: meta.diff || dataset.difficulty(id), attrs: [...dataset.attrs(id)], record: rec,
    };
  }
  return { ...base, type: 'unknown', code: courseCode(id), title: '', credits: clampCredits(meta.cr, 3), difficulty: meta.diff || 'normal' };
}
