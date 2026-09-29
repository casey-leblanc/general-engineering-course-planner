// A drawn flowchart of a combined plan, in the format of the College of Engineering's four-year flowcharts, plus the notes an advisor
// needs to check it. Writes a PDF: page 1 the chart on 17 x 11 in (print it "fit to page" for letter), then letter-size notes.
//
//   node tools/plans/flowchart.mjs --programs BE-BSBE,EE-BSEE
//        the recommended plan for a student starting out
//   node tools/plans/flowchart.mjs --programs BE-BSBE,EE-BSEE --progress .catalog-cache/personal/progress.json [--no-grades] [--name "Student"]
//        the chart filled in with a student's own progress (see src/core/progress.js for the file format)
//   --out <base>   output path without extension (default .catalog-cache/exports/flowchart-<programs>-<year>[-progress]);
//                  a chart with a student's records belongs outside the repository, e.g. --out "%USERPROFILE%/Desktop/BE-EE flowchart"
//   --svg          also write page 1 as an SVG
//   --voice <file> write the notes in the first person and name the people the guidance came from (format in flowchart/voice.mjs;
//                  the names are personal, so keep that file in .catalog-cache/personal/)
//
// The default output folder is local only (gitignored). Personal progress files belong in .catalog-cache/personal/.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, YEAR } from '../../tests/helpers/data.mjs';
import { buildFlowchart } from './flowchart/pages.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const programs = (arg('--programs') || 'BE-BSBE,EE-BSEE').split(',');
  const progressFile = arg('--progress');
  const progress = progressFile ? JSON.parse(await readFile(path.resolve(progressFile), 'utf8')) : null;
  const voiceFile = arg('--voice');
  const voice = voiceFile ? JSON.parse(await readFile(path.resolve(voiceFile), 'utf8')) : {};
  const { pdf, svg, pages } = await buildFlowchart({ programs, progress, showGrades: !process.argv.includes('--no-grades'), name: arg('--name'), voice });
  const base = arg('--out') || path.join(root, '.catalog-cache', 'exports', `flowchart-${programs.join('+')}-${YEAR}${progress ? '-progress' : ''}`);
  await mkdir(path.dirname(base), { recursive: true });
  await writeFile(`${base}.pdf`, pdf);
  const withSvg = process.argv.includes('--svg');
  if (withSvg) await writeFile(`${base}.svg`, svg);
  console.log(`wrote ${base}.pdf (${pages.length} pages)${withSvg ? ` and ${base}.svg` : ''}`);
}
