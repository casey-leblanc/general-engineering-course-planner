// An INVENTED student for tests (never real records; see CLAUDE.md): BE + EE, one year done, a semester in progress, and the kinds of
// credit real students have (test-out credit, a transfer, AP, an honors course, an extra gen-ed the catalog data does not tag).
export const progress = {
  calendar: { year1Fall: 2025 },
  courses: [
    { id: 'ENGL1001', term: 'completed', status: 'completed', grade: 'Pass', grant: 'placement' },
    { id: 'ENGL2000', term: 'completed', status: 'completed', grade: 'Pass', grant: 'placement' },
    { id: 'MATH1550', term: 'completed', status: 'completed', grade: 'A', grant: 'transfer', note: 'transferred as two courses' },
    { id: 'CSC1350', term: 'completed', status: 'completed', grade: 'Pass', grant: 'AP', credits: 3, title: 'Computer Science I for Majors (AP)' },
    { id: 'HIST2055', term: 'completed', status: 'completed', grade: 'Pass', grant: 'AP' },
    { id: 'ART1001', term: 'year1-fall', status: 'completed', grade: 'A' },
    { id: 'BE1251', term: 'year1-fall', status: 'completed', grade: 'A' },
    { id: 'BIOL1201', term: 'year1-fall', status: 'completed', grade: 'A' },
    { id: 'BIOL1208', term: 'year1-fall', status: 'completed', grade: 'A-' },
    { id: 'CHEM1201', term: 'year1-fall', status: 'completed', grade: 'B', note: 'taken as the honors course' },
    { id: 'MATH1552', term: 'year1-fall', status: 'completed', grade: 'B' },
    { id: 'BE1252', term: 'year1-spring', status: 'completed', grade: 'A' },
    { id: 'BIOL1202', term: 'year1-spring', status: 'completed', grade: 'A' },
    { id: 'BIOL1209', term: 'year1-spring', status: 'completed', grade: 'A' },
    { id: 'CHEM1202', term: 'year1-spring', status: 'completed', grade: 'B' },
    { id: 'MATH2090', term: 'year1-spring', status: 'completed', grade: 'A' },
    { id: 'PHYS2110', term: 'year1-spring', status: 'completed', grade: 'A' },
    { id: 'BE2352', term: 'year2-fall', status: 'in-progress' },
    { id: 'BIOL2051', term: 'year2-fall', status: 'in-progress' },
    { id: 'CE2450', term: 'year2-fall', status: 'in-progress' },
    { id: 'CHEM1212', term: 'year2-fall', status: 'in-progress' },
  ],
  extraCourses: [
    { id: 'ART1001', title: 'Introduction to Fine Arts', credits: 3, attrs: ['gen-ed:art'], evidence: 'test fixture' },
    { id: 'HIST2055', title: 'The United States to 1865', credits: 3, attrs: ['gen-ed:humanities'], evidence: 'test fixture' },
  ],
  unapplied: [{ code: 'MATH 1022', title: 'Plane Trigonometry', credits: 3, source: 'transfer' }],
};
