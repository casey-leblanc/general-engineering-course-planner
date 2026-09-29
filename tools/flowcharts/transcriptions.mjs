// Hand transcription of the official 2026-27 engineering flowchart PDFs (https://www.lsu.edu/eng/docs/Flowcharts/2026-2027/).
// Read from the rendered charts on 2026-09-28. Every semester's credit hours are checked against the hours printed on the
// chart by tools/flowcharts/build.mjs, and the sum against TOTAL HOURS, so a mis-read box shows up as a failing check.
//
// Row syntax
//   course:  'MATH1550 5 C'   -> id, credit hours, flags (C = grade of C or better; F / S / Su = offered that term only;
//                                * = "may be a prerequisite for another EE course"). 'A|B' lists alternatives.
//   slot:    S('ee-breadth', 3, 'EE Breadth')  -> a requirement filled by a course chosen later. Slot names 'a:b' nest.
// What is NOT captured: the arrows (prerequisite edges). They are advisory on the charts; the catalog text is the authority.
const S = (slot, cr, label, minGrade) => ({ slot, cr, label, ...(minGrade ? { minGrade } : {}) });

export const NOTE_CS_STALE = 'The chart is labelled 2026-2027 but its footer says "Rev. 1/25/2024" and it points to the 2023-2024 General Catalog, so it may predate the 2026-27 catalog.';

const CS_BASE_LEGEND = {
  techElectives: 'Tech Elective Group A = STEM 2000 level and above; Group B = AVATAR DM art-track electives; see the CSC & E Division for the approved list and substitutions.',
  grade: 'A grade of C or better is required BEFORE enrolling in the next course in the sequence.',
  gradeSlots: 'Two hours of science lab are required and must be with the science sequence chosen.',
};

export const CHARTS = [
  {
    key: 'EE-BSEE', name: 'Electrical Engineering', degree: 'B.S.E.E.', college: 'Engineering', kind: 'major',
    file: 'ee_flowchart_2026-2027.pdf', totalHours: 127, revision: null,
    semesters: [
      { hours: 16, items: ['CHEM1201 3', 'MATH1550 5 C', 'EE1820 2', S('gened:art', 3, 'ART Gen Ed'), 'ENGL1001 3 C'] },
      { hours: 17, items: ['EE2741 3 C', 'CSC1253 3 C', 'MATH1552 4 C', 'PHYS2110 3 C', 'PHYS2108 1', S('gened:life-science', 3, 'Life Science Gen Ed')] },
      { hours: 15, items: ['EE2742 2 *', 'MATH2070 4 C', 'EE2120 3 C', 'PHYS2113 3 C', S('gened:humanities', 3, 'HUMN Gen Ed')] },
      { hours: 16, items: ['MATH2057 3 C', 'EE2130 3 C', 'EE2820 2 C', 'EE2230 3 *', 'EE2231 2 *', 'ENGL2000 3 C'] },
      { hours: 15, items: ['EE3150 3 *', S('ee-breadth', 3, 'EE Breadth'), 'EE3610 3 C', S('ee-breadth', 3, 'EE Breadth'), S('ee-breadth', 3, 'EE Breadth')] },
      { hours: 18, items: ['EE3320 3 *', S('ee-breadth', 3, 'EE Breadth'), S('ee-breadth', 3, 'EE Breadth'), S('ee-breadth', 3, 'EE Breadth'), S('gened:socsci-2000', 3, '2000+ level Social Sci Elective'), 'PHIL2020 3'] },
      { hours: 15, items: [S('ee-design', 3, 'EE Design'), S('ee-design', 3, 'EE Design'), S('ee-tech', 3, 'Tech Elect'), 'EE4810 3 C F', S('gened:socsci', 3, 'SOC SCI Gen Ed')] },
      { hours: 15, items: [S('ee-design', 3, 'EE Design'), S('ee-tech', 3, 'Tech Elect'), S('ee-tech', 3, 'Tech Elect'), 'EE4820 3 S', S('gened:humanities', 3, 'HUMN Gen Ed')] },
    ],
    groups: { seniorDesign: ['EE4810', 'EE4820'] },
    breadth: {
      minGroups: 4, minCourses: 6,
      groups: [
        { name: 'Group 1: DSP', courses: { EE3160: 'F' } },
        { name: 'Group 2: Electronics', courses: { EE3220: 'S', EE3223: 'S', EE3232: 'F' } },
        { name: 'Group 3: Power', courses: { EE3410: null } },
        { name: 'Group 4: Control', courses: { EE3530: 'F' } },
        { name: 'Group 5: Computers', courses: { EE3710: 'S', EE3740: 'S', EE3752: 'F', EE3755: 'F' } },
      ],
    },
    notes: [
      'A pre-req to any EE course is met only by a grade in the C range or better in each course cited as a pre-requisite.',
      'EE 4810 requires senior standing (at least 90 credit hours) and one of EE 3160, 3220, 3410, 3530 or 3755.',
      'Advising tool only; the LSU catalog has the official degree requirements.',
    ],
  },
  {
    key: 'BE-BSBE', name: 'Biological Engineering', degree: 'B.S.B.E.', college: 'Engineering', kind: 'major',
    file: 'be_flowchart_2026-2027.pdf', totalHours: 128, revision: 'Rev. 4/26',
    semesters: [
      { hours: 17, items: ['CHEM1201 3', 'BIOL1208 1', 'BIOL1201 3', 'BE1251 2 F', 'MATH1550 5 C', 'ENGL1001 3 C'] },
      { hours: 16, items: ['CHEM1202 3', 'BIOL1209 1', 'BIOL1202 3', 'BE1252 2 S', 'MATH1552 4 C', 'PHYS2110 3 C'] },
      { hours: 16, items: ['BIOL2051 4', 'BE2352 3 F', 'EE2950 3', 'MATH2065|MATH2090 3', 'CE2450 3 C'] },
      { hours: 17, items: ['CHEM2261 3', 'CHEM1212 2', 'BE2350 3 S', 'PHYS2113 3', 'CE3400 3', 'ENGL2000 3 C'] },
      { hours: 15, items: ['BIOL2083 3', 'AGEC2003|ECON2000|ECON2010|ECON2030 3', S('gened:humanity', 3, 'HUMANITY Gen Ed'), 'ME3333 3', 'BE4303 3 F'] },
      { hours: 15, items: [S('design-electives', 3, 'Design Elect'), 'BE4352 3 S', 'BE3340 3 S', 'CE2200 3', S('gened:humanity', 3, 'HUMANITY Gen Ed')] },
      { hours: 17, items: [S('general-elective', 2, 'Elective or ROTC'), S('design-electives', 3, 'Design Elect'), S('gened:art', 3, 'ART Gen Ed'), 'CE2460 3', 'BE3320 3 F', 'BE4390 3 F'] },
      { hours: 15, items: [S('tech-elective', 3, 'Tech Elective or ROTC'), S('gened:socsci', 3, 'SOCL SCI Gen Ed'), S('gened:humanity', 3, 'HUMANITY Gen Ed'), S('design-electives', 3, 'Design Elect'), 'BE4392 3 S'] },
    ],
    groups: { seniorDesign: ['BE4390', 'BE4392'] },
    notes: [
      'Eight-semester path; expect more than four years if working during the academic year.',
      'Recommended to take courses in the listed semester to reduce time conflicts.',
      'EE 2950 shows an (OR) link with PHYS 2113 as the corequisite path into BE 2350.',
    ],
  },
  ...[
    // Computer Science: five concentration charts sharing one base plan (transcribed separately, so each is checked on its own).
    {
      key: 'CSC-SD', suffix: 'sd', name: 'Computer Science (Second Discipline)', concentrationHours: 15, hoursRow: [15, 15, 17, 15, 15, 16, 15, 12],
      cols: {
        4: [S('csc-2000', 3, 'CSC 2+++'), 'CSC3380 3 C', 'CSC2262 3', 'ENGL2000 3 C', S('gened:hum-cmst', 3, 'Gen Ed Hum CMST')],
        5: ['CSC4402 3', 'CSC3501 3', 'IE3302 3', S('area-elective', 3, 'Area Elective (2nd Discipline)'), S('tech-elective-a', 3, 'Tech Elective A')],
        6: ['CSC4101 3 C', 'CSC4330 3 C', 'CSC3200 1 C', S('area-elective', 3, 'Area Elective (2nd Discipline)'), S('tech-elective-a-or-b', 3, 'Tech Elective A or B'), S('gened:socsci', 3, 'Gen Ed Socl Science')],
        7: [S('csc-3000', 3, 'CSC 3+++'), S('csc-2000', 3, 'CSC 2+++'), 'CSC4103 3 C', S('area-elective', 3, 'Area Elective (2nd Discipline)'), S('area-elective', 3, 'Area Elective (2nd Discipline)')],
        8: [S('csc-4000', 3, 'CSC 4+++'), S('area-elective', 3, 'Area Elective (2nd Discipline)'), S('gened:art', 3, 'Gen Ed Art'), S('gened:socsci-2000', 3, 'Gen Ed Socl Science 2+++')],
      },
      notes: ['Second discipline area electives need the Coordinator\'s 2nd Discipline Restricted Option approval form.'],
    },
    {
      key: 'CSC-CYB', suffix: 'cyb', name: 'Computer Science (Cybersecurity)', concentrationHours: 21, hoursRow: [15, 15, 17, 15, 13, 15, 15, 15],
      cols: {
        4: ['CSC3380 3 C', 'CSC3304 3 S', 'CSC2262 3', 'ENGL2000 3 C', S('gened:hum-cmst', 3, 'Gen Ed Hum CMST')],
        5: ['CSC4103 3 C', 'CSC3501 3', 'CSC2362 3 F', 'CSC3200 1 C', S('tech-elective-a', 3, 'Tech Elective A')],
        6: ['CSC4330 3 C', 'CSC4402 3', 'CSC4360 3 S', S('tech-elective-a-or-b', 3, 'Tech Elective A or B'), S('gened:socsci', 3, 'Gen Ed Socl Science')],
        7: ['CSC4101 3 C', 'CSC4501 3 F', 'CSC4362 3 F', 'IE3302 3', S('gened:socsci-2000', 3, 'Gen Ed Socl Science 2+++')],
        8: [S('area-elective', 3, 'Area Elective (CYB)'), 'CSC4562 3 S', S('approved-elective', 3, 'Approved Elective'), S('approved-elective', 3, 'Approved Elective'), S('gened:art', 3, 'Gen Ed Art')],
      },
      concentrationCourses: ['CSC3304', 'CSC2362', 'CSC4360', 'CSC4501', 'CSC4362', 'CSC4562'],
      areaElectives: ['CSC3730', 'CSC4243', 'CSC4444', 'CSC4610', 'CSC4762', 'IE4462', 'IE4466'],
    },
    {
      key: 'CSC-DSA', suffix: 'dsa', name: 'Computer Science (Data Science & Analytics)', concentrationHours: 18, hoursRow: [15, 15, 17, 15, 15, 15, 13, 15],
      cols: {
        4: ['CSC3380 3 C', 'CSC3501 3', 'CSC2262 3', 'ENGL2000 3 C', S('gened:hum-cmst', 3, 'Gen Ed Hum CMST')],
        5: ['CSC4402 3', S('csc-4000', 3, 'CSC 4+++ (DSA)'), 'CSC2730 3 C F', 'IE3302 3', S('tech-elective-a', 3, 'Tech Elective A')],
        6: ['CSC4330 3 C', 'CSC4103 3', 'CSC4740 3 S', S('tech-elective-a-or-b', 3, 'Tech Elective A or B'), S('gened:socsci', 3, 'Gen Ed Socl Science')],
        7: [S('area-elective', 3, 'Area Elective (DSA)'), 'CSC4101 3 C', 'CSC3730 3 F', 'CSC3200 1 C', S('gened:socsci-2000', 3, 'Gen Ed Socl Science 2000+')],
        8: ['CSC4343 3 S', S('csc-2000', 3, 'CSC 2+++'), S('approved-elective', 3, 'Approved Elective'), S('approved-elective', 3, 'Approved Elective'), S('gened:art', 3, 'Gen Ed Art')],
      },
      concentrationCourses: ['CSC2730', 'CSC4740', 'CSC3730', 'CSC4343'],
      areaElectives: ['CSC4444', 'CSC4501', 'CSC4512', 'CSC4610', 'CSC4762', 'ISDS3105', 'ISDS4118', 'ISDS4141', 'MATH4024', 'MATH4025'],
    },
    {
      key: 'CSC-SEG', suffix: 'seg', name: 'Computer Science (Software Engineering)', concentrationHours: 18, hoursRow: [15, 15, 17, 15, 13, 15, 15, 15],
      cols: {
        4: ['CSC3304 3 S', 'CSC3501 3', 'CSC2262 3', 'ENGL2000 3 C', S('gened:hum-cmst', 3, 'Gen Ed Hum CMST')],
        5: ['CSC3380 3 C', 'CSC4101 3', 'IE3302 3', 'CSC3200 1 C', S('tech-elective-a', 3, 'Tech Elective A')],
        6: ['CSC4402 3', 'CSC4351 3 S', 'CSC4103 3 C', S('tech-elective-a-or-b', 3, 'Tech Elective A or B'), S('gened:socsci', 3, 'Gen Ed Socl Science')],
        7: ['CSC4330 3 C', S('csc-2000', 3, 'CSC 2+++ (SEG)'), S('area-elective', 3, 'Area Elective (SEG)'), S('approved-elective', 3, 'Approved Elective'), S('gened:socsci-2000', 3, 'Gen Ed Socl Science 2+++')],
        8: ['CSC4332 3 S', S('csc-2000', 3, 'CSC 2+++'), S('area-elective', 3, 'Area Elective (SEG)'), S('approved-elective', 3, 'Approved Elective'), S('gened:art', 3, 'Gen Ed Art')],
      },
      concentrationCourses: ['CSC3304', 'CSC4351', 'CSC4332'],
      areaElectives: ['CSC4243', 'CSC4263', 'CSC4356', 'CSC4357', 'CSC4360', 'CSC4362', 'CSC4370', 'CSC4444', 'CSC4501', 'CSC4562', 'CSC4585', 'CSC4610', 'CSC4740', 'CSC4762', 'CSC4890', 'EE4859', 'IE4461', 'ISDS4111', 'ISDS4112', 'ISDS4113', 'ISDS4120', 'ISDS4125', 'ISDS4141'],
    },
    {
      key: 'CSC-CCN', suffix: 'ccn', name: 'Computer Science (Cloud Computing & Networking)', concentrationHours: 18, hoursRow: [15, 15, 17, 15, 15, 16, 15, 12],
      cols: {
        4: ['CSC3380 3 C', 'CSC2610 3 S C', 'CSC2262 3', 'ENGL2000 3 C', S('gened:hum-cmst', 3, 'Gen Ed Hum CMST')],
        5: ['CSC4402 3', 'CSC4501 3 F', S('area-elective', 3, 'Area Elective (CCN)'), 'IE3302 3', S('tech-elective-a', 3, 'Tech Elective A')],
        6: ['CSC4330 3 C', 'CSC4103 3 C', 'CSC3501 3', 'CSC3200 1 C', S('tech-elective-a-or-b', 3, 'Tech Elective A or B'), S('gened:socsci', 3, 'Gen Ed Socl Science')],
        7: [S('area-elective', 3, 'Area Elective (CCN)'), 'CSC4101 3 C', 'CSC4610 3 F', S('approved-elective', 3, 'Approved Elective'), S('gened:socsci-2000', 3, 'Gen Ed Socl Science 2000+')],
        8: ['CSC4562 3 S', S('csc-2000', 3, 'CSC 2+++'), S('approved-elective', 3, 'Approved Elective'), S('gened:art', 3, 'Gen Ed Art')],
      },
      concentrationCourses: ['CSC2610', 'CSC4501', 'CSC4610', 'CSC4562'],
      areaElectives: null,
      areaElectivesNote: 'The pre-approved list printed on this chart could not be read reliably (the rendered text and the text layer disagree); re-read it from the catalog.',
    },
  ].map(c => ({
    key: c.key, name: c.name, degree: 'B.S.', college: 'Engineering', kind: 'major',
    file: `csc-${c.suffix}_flowchart_2026-2027.pdf`, totalHours: 120, revision: '1/25/2024',
    semesters: [
      { hours: c.hoursRow[0], items: ['CSC1350 4 C', 'MATH1550 5 C', 'ENGL1001 3 C', S('bio-seq-1', 3, 'BIOL Sequence I Requirement')] },
      { hours: c.hoursRow[1], items: ['CSC1351 4 C', 'MATH1552 4 C', S('gened:hum-eng', 3, 'Gen Ed Hum ENGL or HNRS 2000+'), S('physical-sci', 3, 'Physical Science'), S('sci-lab', 1, 'Science Sequence I or II Lab', 'C')] },
      { hours: c.hoursRow[2], items: ['CSC3102 3 C', 'CSC2259 3 C', 'MATH2090 4', S('gened:humanity', 3, 'Gen Ed Humanity'), S('sci-seq-2', 3, 'Science Sequence II Requirement'), S('sci-lab', 1, 'Science Sequence I or II Lab')] },
      ...[4, 5, 6, 7, 8].map(n => ({ hours: c.hoursRow[n - 1], items: c.cols[n] })),
    ],
    groups: {},
    concentration: { hours: c.concentrationHours, courses: c.concentrationCourses || [], areaElectives: c.areaElectives ?? null, note: c.areaElectivesNote || null },
    staleness: NOTE_CS_STALE,
    notes: [CS_BASE_LEGEND.grade, CS_BASE_LEGEND.gradeSlots, CS_BASE_LEGEND.techElectives, ...(c.notes || [])],
  })),
];
