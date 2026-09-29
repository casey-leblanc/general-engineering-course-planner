// The whole deliverable: page 1 is the flowchart in the college's format, the pages after it are the notes an advisor needs to check it.
// The notes speak neutrally unless a voice is given (voice.mjs): then they are in the first person of the student sending the chart,
// with the real names of the people the guidance came from.
import { prepare, explain, yearLabel } from '../advisor-sheet.mjs';
import { YEAR } from '../../../tests/helpers/data.mjs';
import { ruleText } from '../../../src/ui/view.js';
import { buildModel } from './model.mjs';
import { drawChart, Flow } from './draw.mjs';
import { toPdf, toSvg } from './scene.mjs';
import { makeVoice } from './voice.mjs';

/** "Biological Engineering" + "Electrical Engineering" -> "BIOLOGICAL + ELECTRICAL ENGINEERING" */
export function chartTitle(names) {
  const all = names.every(n => / Engineering$/.test(n));
  return (all ? `${names.map(n => n.replace(/ Engineering$/, '')).join(' + ')} Engineering` : names.join(' + ')).toUpperCase();
}

const cap = s => s.charAt(0) + s.slice(1).toLowerCase();   // "FALL 2025" -> "Fall 2025"

/**
 * @param {object} o
 * @param {object} [o.voice]  { firstPerson, addressee, people } (see voice.mjs); neutral wording when left out
 * @returns { pdf: Buffer, svg: string, pages: Scene[], model, ex, ctx }
 */
export async function buildFlowchart({ programs = ['BE-BSBE', 'EE-BSEE'], progress = null, showGrades = true, name = null, today = new Date().toLocaleDateString('en-CA'), seconds = 45, voice: voiceConfig = {} } = {}) {
  const voice = makeVoice(voiceConfig);
  const fp = voice.firstPerson;
  const prep = await prepare({ programs, progress, seconds });
  const { dataset, m, fresh } = prep;
  const ex = explain({ dataset, m, fresh, progress });
  const model = buildModel({ ...prep, progress, showGrades, sourceOf: r => `${voice.who(r)}, ${r.confidence}` });

  const degrees = model.programs.map(p => p.degree).filter(Boolean).join(' + ');
  const semesters = model.headers.filter(h => !h.bank);
  const first = semesters[0], last = semesters[semesters.length - 1];
  const about = [
    progress
      ? `Completed and in-progress courses come from the student's Workday academic progress report and unofficial transcript. The LSU Course Planner arranged the remaining courses: 12 to 18 hours a semester, no summers, prerequisites before the courses that need them.`
      : `The semester structure and credit hours are the college's ${YEAR} flowcharts, merged into one plan by the LSU Course Planner using the advisor guidance in the notes.`,
    `Arrows and offering terms come from the planner's course data. Only EE 2120 has been checked against the catalog so far, so please treat the order of the remaining semesters as a proposal.`,
    `The guidance used to combine the two programs is listed in the notes panel and on page 2, with its source and how firm it is.`,
  ].map(voice.say);
  const ctx = {
    title: chartTitle(model.programs.map(p => p.name)),
    subtitle: `${name ? `${name}  ·  ` : ''}${degrees}  ·  one plan for the double major  ·  ${progress ? `${cap(first.label)} to ${cap(last.label)}` : 'recommended plan'}`,
    year: YEAR,
    caption: `A proposed plan for advisor review, not an official document. Advising tool only; the LSU catalog has the official degree requirements.`,
    about,
  };
  const chart = drawChart(model, ctx);

  // ---- notes pages
  const planWord = fp ? 'my plan' : 'the plan';
  const f = new Flow();
  f.title(voice.addressee ? `Notes for ${voice.addressee}` : 'Notes for the advisor');
  const programNames = model.programs.map(p => p.name).join(' + ');
  const intro = fp
    ? `These are my notes on the flowchart on page 1: my plan for ${programNames}, catalog ${yearLabel}, prepared ${today} with the LSU Course Planner (my planning tool, not an official document). I may take summer classes, which can shift courses around on the flowchart.${progress ? ' My completed work and the semester in progress come from my Workday academic progress report and unofficial transcript.' : ''}`
    : `${programNames} · catalog ${yearLabel} · prepared ${today} with the LSU Course Planner (a student's planning tool, not an official document). A student may take summer classes, which can shift courses around on the flowchart.${progress ? ' Completed work and the semester in progress come from the student\'s Workday academic progress report and unofficial transcript.' : ''}`;
  f.para(voice.say(intro), { size: 8.6, fill: '#4b4b4b' });
  f.gap(4);
  for (const p of ex.per) {
    const head = `${p.name} (${p.degree}, ${p.totalCredits} hours on the college's flowchart): `;
    f.para(progress && fp
      ? `${head}I have completed ${p.completed} credit hours${p.inProgress ? `, ${p.inProgress} are in progress` : ''}, and ${p.left} remain${p.open ? ` (${p.open} elective or gen-ed slots I still have to choose)` : ''}.`
      : `${head}${p.text}.`, { bullet: true });
  }
  if (ex.finish) f.para(fp ? `If nothing changes, my last semester in this plan is ${ex.finish}.` : `If nothing changes, the last semester of this plan is ${ex.finish}.`, { bullet: true });

  f.heading('Where the two programs share requirements (please check these)');
  f.para(fp
    ? 'Each line is a requirement that the guidance I was given lets the two programs share. The course or slot named is left out of my plan because something else already satisfies it.'
    : 'Each line is a requirement that the guidance received lets the two programs share. The course or slot named is left out of the plan because something else already satisfies it.', { fill: '#4b4b4b' });
  for (const g of ex.ruled) {
    const rules = g.via.map(id => dataset.rules.find(r => r.id === id)).filter(Boolean);
    f.para(`${ex.names[g.program].name}: ${g.label}${g.n > 1 ? ` (${g.n})` : ''} is not in ${planWord}; ${g.by} counts instead${rules.length ? ` [${[...new Set(rules.map(r => `${voice.who(r)}, ${r.confidence}`))].join('; ')}]` : ''}.`, { bullet: true });
  }
  if (ex.direct.length) {
    f.para(`${progress ? 'Already satisfied by completed credit or a matching slot' : 'Fits directly'} (no special rule): ${ex.direct.map(g => `${g.label}${g.n > 1 ? ` (${g.n})` : ''} by ${g.by}`).join('; ')}.`, { fill: '#4b4b4b', size: 8 });
  }

  // the rules that shaped the plan, then the standing advice for these programs (an advisory changes no course, but it applies to the plan)
  const inPlan = new Set(model.programs.map(p => p.id));
  const advisories = dataset.rules.filter(r => r.type === 'advisory' && (r.scope.programs || []).some(p => inPlan.has(p)) && (!r.scope.catalogYears || r.scope.catalogYears.includes(YEAR)) && !ex.usedRules.includes(r));
  // a note recorded about the addressee's own email reads "your email" to them
  const noteOf = r => {
    const t = voice.say(r.note);
    return voice.addressee && voice.who(r) === voice.addressee ? t.replace(/\b([Tt])he email\b/g, (_, c) => `${c === 'T' ? 'Your' : 'your'} email`) : t;
  };
  f.heading('The guidance behind it');
  for (const r of [...ex.usedRules, ...advisories]) {
    f.para(voice.say(ruleText(r, dataset)), { font: 'bold', size: 8.4 });
    f.para(`${r.confidence} · ${voice.source(r)} · ${r.source.recordedOn}${r.note ? ` · ${noteOf(r)}` : ''}`, { size: 7.8, fill: '#4b4b4b', indent: 8 });
  }

  if (ex.unapplied.length) {
    f.heading(fp ? 'Other credit on my transcript that no requirement uses' : 'Other credit on the transcript that no requirement uses');
    f.para(`${ex.unapplied.map(u => `${u.code} ${u.title} (${u.credits} cr, ${u.source})`).join('; ')}.`);
  }

  f.heading(fp ? 'Questions I could not settle' : 'Questions not settled');
  for (const q of [...new Set([...ex.questions, ...advisories.flatMap(r => r.openQuestions || [])])]) f.para(voice.say(q), { bullet: true });
  // "any STEM class is a BE technical elective": does that reach engineering classes outside BE?
  const stem = dataset.rules.find(r => r.id === 'be-technical-elective-any-stem');
  const stemLead = stem && voice.addressee && voice.who(stem) === voice.addressee ? 'Your email says that' : 'The guidance is that';
  f.para(`${stemLead} any STEM class counts for the BE technical elective. Does that mean any non-BE engineering class can be a BE technical elective?${fp ? ' Until I know, I show that elective as its own open slot.' : ''}`, { bullet: true });
  if (ex.unapplied.length) f.para(fp ? 'Could any of the transcript credit I listed above count as my BE technical elective?' : 'Could any of the transcript credit listed above count as the BE technical elective?', { bullet: true });

  f.heading('How reliable is the course data?');
  f.para(fp
    ? `The semester structure and credit hours come from the official ${yearLabel} flowcharts. Prerequisites and offering terms for most courses are carried over from last year's planner data and I have not checked them against the ${yearLabel} catalog, so please treat the order of my remaining courses as a proposal.${progress ? ' The remaining semesters do not include summers; using them would shorten the plan.' : ''}`
    : `The semester structure and credit hours come from the official ${yearLabel} flowcharts. Prerequisites and offering terms for most courses are carried over from last year's planner data and have not been checked against the ${yearLabel} catalog, so please treat the order of the remaining courses as a proposal.${progress ? ' The remaining semesters do not include summers; using them would shorten the plan.' : ''}`);

  const pages = [chart, ...f.pages];
  const title = `${ctx.title} ${YEAR} flowchart`;
  return { pdf: toPdf(pages, { title, subject: 'Combined four-year flowchart for advisor review' }), svg: toSvg(chart, { title }), pages, model, ex, ctx };
}
