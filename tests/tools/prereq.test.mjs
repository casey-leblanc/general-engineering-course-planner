// Requisite-text grammar tests.
// REAL strings are wording actually seen on catalog.lsu.edu (2025-26 catalog), reduced to the requisite sentence.
// SYNTHETIC strings are representative of common Acalog phrasing and are NOT quotes; replace/extend them with real
// strings once pages can be ingested (see the plan, section 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequisites, renderExpr } from '../../tools/parse/prereq.js';
import { parseCourseText } from '../../tools/parse/course-page.js';
import { validateExpr } from '../../src/core/schema.js';

const ok = r => { for (const k of ['prereq', 'coreq']) if (r[k]) assert.deepEqual(validateExpr(r[k]), [], `${k} must satisfy the schema`); return r; };

test('REAL: EE 2120 (credit or registration in a list, or consent of division)', () => {
  // The page text has stray spaces before commas because each course code is a link.
  const r = ok(parseRequisites('Prereq.: credit or registration in EE 1810 , MATH 2070 , and PHYS 2113  or consent of division.  Time-domain analysis.'));
  assert.equal(r.parse, 'auto');
  assert.deepEqual(r.prereq, {
    all: [{ course: 'EE1810', concurrent: 'ok' }, { course: 'MATH2070', concurrent: 'ok' }, { course: 'PHYS2113', concurrent: 'ok' }],
    waiver: 'consent of division',
  });
  assert.equal(r.text, 'Prereq.: credit or registration in EE 1810, MATH 2070, and PHYS 2113 or consent of division.');
  assert.equal(renderExpr(r.prereq), 'EE 1810 (may be taken concurrently) and MATH 2070 (may be taken concurrently) and PHYS 2113 (may be taken concurrently), or consent of division');
});

test('REAL: EE 3220 (plain list with "and")', () => {
  const r = ok(parseRequisites('Prereq.: EE 2130, EE 2230 and EE 2231.'));
  assert.deepEqual(r.prereq, { all: [{ course: 'EE2130' }, { course: 'EE2230' }, { course: 'EE2231' }] });
});

test('SYNTHETIC: grade, or-lists, inherited subject, standing, consent-only', () => {
  assert.deepEqual(ok(parseRequisites('Prereq.: MATH 1550 with a grade of C or better.')).prereq, { course: 'MATH1550', minGrade: 'C' });
  assert.deepEqual(ok(parseRequisites('Prereq.: “C” or better in MATH 1550.')).prereq, { course: 'MATH1550', minGrade: 'C' });
  assert.deepEqual(ok(parseRequisites('Prereq.: MATH 1552 or MATH 1431.')).prereq, { any: [{ course: 'MATH1552' }, { course: 'MATH1431' }] });
  assert.deepEqual(ok(parseRequisites('Prereq.: MATH 1550 or 1552.')).prereq, { any: [{ course: 'MATH1550' }, { course: 'MATH1552' }] });
  assert.deepEqual(ok(parseRequisites('Prereq.: MATH 2070, MATH 2090, or MATH 2065.')).prereq, { any: [{ course: 'MATH2070' }, { course: 'MATH2090' }, { course: 'MATH2065' }] });
  assert.deepEqual(ok(parseRequisites('Prereq.: junior standing.')).prereq, { standing: 'junior' });
  assert.deepEqual(ok(parseRequisites('Prereq.: consent of department.')).prereq, { consent: 'department' });
  assert.deepEqual(ok(parseRequisites('Prereq.: CHEM 1201 or consent of department.')).prereq, { all: [{ course: 'CHEM1201' }], waiver: 'consent of department' });
});

test('SYNTHETIC: prerequisite and corequisite markers together, and concurrent enrollment', () => {
  const r = ok(parseRequisites('Prereq.: PHYS 2110. Coreq.: MATH 1552. A survey of mechanics.'));
  assert.deepEqual(r.prereq, { course: 'PHYS2110' });
  assert.deepEqual(r.coreq, { course: 'MATH1552' });
  const c = ok(parseRequisites('Prereq.: CHEM 1201 and CHEM 1212, or concurrent enrollment.'));
  assert.deepEqual(c.prereq, { all: [{ course: 'CHEM1201', concurrent: 'ok' }, { course: 'CHEM1212', concurrent: 'ok' }] });
  const both = ok(parseRequisites('Prereq. or concurrent: MATH 1552.'));
  assert.deepEqual(both.prereq, { course: 'MATH1552', concurrent: 'ok' });
});

test('anything the grammar cannot fully explain is kept verbatim and flagged manual', () => {
  for (const text of [
    'Prereq.: MATH 1550 and MATH 1552 or PHYS 2110.',            // mixes and/or
    'Prereq.: admission to the Honors College.',                  // restriction we do not model
    'Prereq.: a score of 25 or higher on the ACT.',
  ]) {
    const r = parseRequisites(text);
    assert.equal(r.parse, 'manual', text);
    assert.ok(r.prereq.unparsed, `${text}: original text must be preserved`);
    assert.ok(r.reasons.length >= 1);
    ok(r);
  }
});

test('no requisites -> parse "none"', () => {
  const r = parseRequisites('Survey of engineering concepts. Hands-on laboratory experiences.');
  assert.equal(r.parse, 'none');
  assert.equal(r.prereq, undefined);
});

test('course text: header, credits, and requisites (REAL shape of the EE 2120 page)', () => {
  const rec = parseCourseText([
    'HELP',
    '2025-2026 General Catalog [ARCHIVED CATALOG]',
    'Print-Friendly Page (opens a new window)',
    'EE 2120 Circuits I (3) Prereq.: credit or registration in EE 1810 , MATH 2070 , and PHYS 2113 or consent of division.',
    'Back to Top | Print-Friendly Page (opens a new window)',
  ].join('\n'));
  assert.equal(rec.id, 'EE2120');
  assert.equal(rec.title, 'Circuits I');
  assert.deepEqual(rec.credits, { fixed: 3 });
  assert.equal(rec.parse, 'auto');
  assert.equal(rec.prereq.waiver, 'consent of division');
  assert.equal(rec.prereqText, 'Prereq.: credit or registration in EE 1810, MATH 2070, and PHYS 2113 or consent of division.');
});

test('course text: variable credits, parenthesised titles, missing header', () => {
  assert.deepEqual(parseCourseText('CSC 4998 Special Topics (Honors) (1-6) Prereq.: consent of department.').credits, { min: 1, max: 6 });
  assert.equal(parseCourseText('CSC 4998 Special Topics (Honors) (1-6)').title, 'Special Topics (Honors)');
  assert.equal(parseCourseText('nothing that looks like a course'), null);
});
