"use strict";
/**
 * LSU Majors & Course Catalog Registry
 * Supports:
 * - Electrical Engineering (B.S.E.E., 127 credits)
 * - Biological Engineering (B.S.B.E., 128 credits)
 * - BE + EE Double Major
 * - Extensible for future LSU engineering majors
 *
 * References:
 * - LSU General Catalog: https://catalog.lsu.edu
 * - LSU College of Engineering Flowcharts: https://www.lsu.edu/eng/current/resources/flowcharts.php
 */

const LSU_CATALOG = {
  /* ===== ELECTRICAL ENGINEERING CORE ===== */
  EE1810: {
    code: 'EE 1810',
    title: 'Introduction to Electrical and Computer Engineering',
    dept: 'EE',
    cr: 2,
    sem: ['F','S'],
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Survey of engineering concepts in the ECE discipline; hands-on laboratory experiences.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2120: {
    code: 'EE 2120',
    title: 'Circuits I',
    dept: 'EE',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['MATH1552','PHYS2110'],
    co: ['PHYS2113'],
    diff: 'hardest',
    desc: 'Time-domain analysis of electrical networks; Ohm’s law, Kirchhoff’s laws, Thévenin and Norton theorems. Grade of C or better required as prerequisite.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2130: {
    code: 'EE 2130',
    title: 'Circuits II',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2120', ['MATH2070','MATH2090']],
    co: [],
    diff: 'hardest',
    desc: 'Frequency-domain analysis of electrical networks, AC circuits, laplace transforms, two-port networks.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2230: {
    code: 'EE 2230',
    title: 'Electronics I',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2120'],
    co: ['EE2231'],
    diff: 'hardest',
    desc: 'Terminal behavior of semiconductor devices; diodes, BJTs, MOSFETs; analysis and design of basic amplifier circuits.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2231: {
    code: 'EE 2231',
    title: 'Electronics I Laboratory',
    dept: 'EE',
    cr: 2,
    sem: ['F','S'],
    pre: [],
    co: ['EE2230'],
    diff: 'normal',
    desc: 'Laboratory experiments in electronic devices and circuits; op-amps, rectifiers, and transistor amplifiers.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2741: {
    code: 'EE 2741',
    title: 'Digital Logic I',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['MATH1550'],
    co: [],
    diff: 'hard',
    desc: 'Boolean algebra, combinational logic design, minimization, sequential circuits, flip-flops, registers, counters.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2742: {
    code: 'EE 2742',
    title: 'Digital Logic II',
    dept: 'EE',
    cr: 2,
    sem: ['F','S'],
    pre: ['EE2741'],
    co: [],
    diff: 'hard',
    desc: 'Advanced digital logic and hardware description language (VHDL/Verilog), programmable logic devices.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2810: {
    code: 'EE 2810',
    title: 'Tools in Electrical and Computer Engineering',
    dept: 'EE',
    cr: 2,
    sem: ['F','S'],
    pre: ['EE2120','CSC1253'],
    co: [],
    diff: 'normal',
    desc: 'Software and hardware tools: MATLAB, circuit simulation (SPICE), PCB layout, and data acquisition.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3150: {
    code: 'EE 3150',
    title: 'Probability for Electrical and Computer Engineering',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['MATH2057'],
    co: [],
    diff: 'hard',
    desc: 'Probability theory, random variables, probability density functions, statistical distributions applied to engineering.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3320: {
    code: 'EE 3320',
    title: 'Electromagnetic Fields',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2130','MATH2057','PHYS2113'],
    co: [],
    diff: 'hardest',
    desc: 'Static and dynamic electromagnetic fields, Maxwell’s equations, wave propagation, transmission lines.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3610: {
    code: 'EE 3610',
    title: 'Signals and Systems',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2130'],
    co: [],
    diff: 'hardest',
    desc: 'Continuous and discrete time signals and linear time-invariant systems, Fourier series, Fourier transforms, Z-transforms.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4810: {
    code: 'EE 4810',
    title: 'Senior Design I',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE3320','EE3610'],
    co: [],
    diff: 'hard',
    desc: 'First semester of capstone design sequence. Senior standing (>= 90 credits) required. Team-based design, project management, and specification.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4820: {
    code: 'EE 4820',
    title: 'Senior Design II',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE4810'],
    co: [],
    diff: 'hard',
    desc: 'Second semester of capstone design sequence. Construction, testing, formal presentation, and technical reporting of the completed system.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== ELECTRICAL ENGINEERING BREADTH (GROUPS 1–5) ===== */
  EE3160: {
    code: 'EE 3160',
    title: 'Introduction to Digital Signal Processing',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE3610'],
    co: [],
    diff: 'hard',
    breadthGroup: 1,
    desc: 'Breadth Group 1: Discrete-time signals, discrete Fourier transform (DFT), FFT algorithms, FIR and IIR digital filter design.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3220: {
    code: 'EE 3220',
    title: 'Semiconductor Devices',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE2230'],
    co: [],
    diff: 'hard',
    breadthGroup: 2,
    desc: 'Breadth Group 2: Physics and operational principles of p-n junctions, bipolar transistors, and MOS devices.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3223: {
    code: 'EE 3223',
    title: 'Microelectronic Devices & Circuits',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE2230'],
    co: [],
    diff: 'hard',
    breadthGroup: 2,
    desc: 'Breadth Group 2: IC fabrication technologies, MOS and bipolar device characteristics, and integrated circuit layouts.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3232: {
    code: 'EE 3232',
    title: 'Solid State Electronics',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE2230'],
    co: [],
    diff: 'hard',
    breadthGroup: 2,
    desc: 'Breadth Group 2: Energy band models, carrier statistics, transport phenomena in semiconductors, and junction electrostatics.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3410: {
    code: 'EE 3410',
    title: 'Electric Power',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2120'],
    co: [],
    diff: 'hard',
    breadthGroup: 3,
    desc: 'Breadth Group 3: AC power fundamentals, three-phase systems, transformers, and electromechanical energy conversion principles.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3530: {
    code: 'EE 3530',
    title: 'Introduction to Control Systems',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE3610'],
    co: [],
    diff: 'hard',
    breadthGroup: 4,
    desc: 'Breadth Group 4: Feedback systems, transient response, root locus, Bode plots, and stability analysis.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3710: {
    code: 'EE 3710',
    title: 'Microprocessor Systems',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE2741'],
    co: [],
    diff: 'hard',
    breadthGroup: 5,
    desc: 'Breadth Group 5: Architecture, instruction set, assembly language programming, and interfacing of microprocessors.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3740: {
    code: 'EE 3740',
    title: 'Computer Systems Architecture',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE2741'],
    co: [],
    diff: 'hard',
    breadthGroup: 5,
    desc: 'Breadth Group 5: Digital computer hardware organization, memory hierarchy, input/output system design.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3752: {
    code: 'EE 3752',
    title: 'Microprocessor Interfacing',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE2741'],
    co: [],
    diff: 'hard',
    breadthGroup: 5,
    desc: 'Breadth Group 5: Interfacing techniques between microprocessors and memories, peripheral controllers, and sensors.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE3755: {
    code: 'EE 3755',
    title: 'Computer Organization',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['EE2741'],
    co: [],
    diff: 'hard',
    breadthGroup: 5,
    desc: 'Breadth Group 5: Hardware design of digital computers, instruction execution, pipelining, and cache memory systems.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== EE DESIGN & TECHNICAL ELECTIVES ===== */
  EE4160: {
    code: 'EE 4160',
    title: 'Algorithms for Signal Processing',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE3160'],
    co: [],
    diff: 'hard',
    desc: 'Fast Fourier transform variations, adaptive filtering, and multidimensional DSP applications.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4242: {
    code: 'EE 4242',
    title: 'VLSI Design',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE2230','EE2741'],
    co: [],
    diff: 'hard',
    desc: 'Design of CMOS integrated circuits, circuit layout, logic simulation, timing analysis.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4420: {
    code: 'EE 4420',
    title: 'Power Systems Analysis',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE3410'],
    co: [],
    diff: 'hard',
    desc: 'Transmission lines, per-unit representations, power flow analysis, fault analysis in electrical grids.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4530: {
    code: 'EE 4530',
    title: 'Digital Control Systems',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE3530'],
    co: [],
    diff: 'hard',
    desc: 'Discrete-time feedback control, state-space representations, pole placement, digital observers.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4710: {
    code: 'EE 4710',
    title: 'Embedded Computer Systems',
    dept: 'EE',
    cr: 3,
    sem: ['F'],
    pre: ['EE3755'],
    co: [],
    diff: 'hard',
    desc: 'Design of real-time microcontroller-based embedded systems, firmware, RTOS, sensor interfacing.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE4720: {
    code: 'EE 4720',
    title: 'High Performance Computer Architecture',
    dept: 'EE',
    cr: 3,
    sem: ['S'],
    pre: ['EE3755'],
    co: [],
    diff: 'hard',
    desc: 'Superscalar processor design, out-of-order execution, branch prediction, vector processing, multi-core systems.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== BIOLOGICAL ENGINEERING CORE ===== */
  BE1251: {
    code: 'BE 1251',
    title: 'Introduction to Engineering Methods',
    dept: 'BE',
    cr: 2,
    sem: ['F'],
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Engineering problem-solving, computing methods, biological engineering disciplines and applications.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE1252: {
    code: 'BE 1252',
    title: 'Biology in Engineering',
    dept: 'BE',
    cr: 2,
    sem: ['S'],
    pre: [],
    co: ['BIOL1201'],
    diff: 'normal',
    desc: 'Application of biological sciences to engineering design, cellular and physiological principles.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE2350: {
    code: 'BE 2350',
    title: 'Experimental Methods for Engineers',
    dept: 'BE',
    cr: 3,
    sem: ['S'],
    pre: [],
    co: ['EE2120','EE2950','PHYS2113'],
    coreqAny: true,
    diff: 'normal',
    desc: 'Instrumentation, measurements, statistical analysis, and sensor applications in bioengineering.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE2352: {
    code: 'BE 2352',
    title: 'Quantitative Biology in Engineering',
    dept: 'BE',
    cr: 3,
    sem: ['F'],
    pre: ['BE1252'],
    co: [],
    diff: 'normal',
    desc: 'Mathematical and quantitative modeling of biological systems and reactions.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE3320: {
    code: 'BE 3320',
    title: 'Mechanical Design for Biological Engineering',
    dept: 'BE',
    cr: 3,
    sem: ['F'],
    pre: ['CE3400'],
    co: [],
    diff: 'normal',
    desc: 'Stress analysis, machine components, and mechanical design considerations in biological contexts.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE3340: {
    code: 'BE 3340',
    title: 'Process Design in Biological Engineering',
    dept: 'BE',
    cr: 3,
    sem: ['S'],
    pre: ['MATH2065','MATH2070','MATH2090'],
    preAny: true,
    co: [],
    diff: 'normal',
    desc: 'Bioreactor design, sterilization, fermentation, downstream bioprocess modeling.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE4303: {
    code: 'BE 4303',
    title: 'Engineering Properties of Biological Materials',
    dept: 'BE',
    cr: 3,
    sem: ['F'],
    pre: ['MATH2065','MATH2070','MATH2090'],
    preAny: true,
    co: ['CE3400'],
    diff: 'normal',
    desc: 'Mechanical, rheological, thermal, and optical properties of biomaterials and tissues.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE4352: {
    code: 'BE 4352',
    title: 'Transport Phenomena in Biological Engineering',
    dept: 'BE',
    cr: 3,
    sem: ['S'],
    pre: ['BE2352','BIOL2051'],
    co: ['CE2200','ME3333'],
    diff: 'normal',
    desc: 'Fluid mechanics, heat and mass transfer in biological and physiological systems.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE4390: {
    code: 'BE 4390',
    title: 'Senior Engineering Design I',
    dept: 'BE',
    cr: 3,
    sem: ['F'],
    pre: ['BE2350'],
    co: ['CE3400'],
    diff: 'normal',
    desc: 'First semester of BE senior capstone design; project planning, client specifications, safety and ethics.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BE4392: {
    code: 'BE 4392',
    title: 'Senior Engineering Design II',
    dept: 'BE',
    cr: 3,
    sem: ['S'],
    pre: ['BE4390'],
    co: [],
    diff: 'normal',
    desc: 'Second semester of BE capstone design; fabrication, validation testing, oral presentations, formal report.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== BIOLOGICAL SCIENCES (FOR BE MAJOR) ===== */
  BIOL1201: {
    code: 'BIOL 1201',
    title: 'Biology for Science Majors I',
    dept: 'SCI',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MJ',
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Principles of cellular and molecular biology, genetics, and metabolic processes.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BIOL1208: {
    code: 'BIOL 1208',
    title: 'Biology Lab for Science Majors I',
    dept: 'SCI',
    cr: 1,
    sem: ['F','S'],
    pre: [],
    co: ['BIOL1201'],
    diff: 'normal',
    desc: 'Laboratory accompanying BIOL 1201.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BIOL1202: {
    code: 'BIOL 1202',
    title: 'Biology for Science Majors II',
    dept: 'SCI',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'JA',
    pre: ['BIOL1201'],
    co: ['BIOL1208'],
    diff: 'normal',
    desc: 'Organismal biology, plant and animal systems, ecology, and evolutionary biology.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BIOL1209: {
    code: 'BIOL 1209',
    title: 'Biology Lab for Science Majors II',
    dept: 'SCI',
    cr: 1,
    sem: ['F','S'],
    pre: ['BIOL1208'],
    co: ['BIOL1202'],
    diff: 'normal',
    desc: 'Laboratory accompanying BIOL 1202.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BIOL2051: {
    code: 'BIOL 2051',
    title: 'General Microbiology',
    dept: 'SCI',
    cr: 4,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['BIOL1202','BIOL1209','CHEM1202'],
    co: [],
    diff: 'hard',
    desc: 'Structure, physiology, metabolism, and genetics of microorganisms; includes lab.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  BIOL2083: {
    code: 'BIOL 2083',
    title: 'The Elements of Biochemistry',
    dept: 'SCI',
    cr: 3,
    sem: ['F','S'],
    pre: ['CHEM2261'],
    co: [],
    diff: 'normal',
    desc: 'Biochemical molecules, enzymes, metabolism, bioenergetics, and genetic information transfer.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== GENERAL ENGINEERING / CIVIL / MECHANICAL ===== */
  CE2450: {
    code: 'CE 2450',
    title: 'Statics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MJ',
    pre: ['MATH1552','PHYS2110'],
    co: [],
    diff: 'hardest',
    desc: 'Equilibrium of force systems, trusses, frames, friction, centroids, moments of inertia.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CE3400: {
    code: 'CE 3400',
    title: 'Mechanics of Materials',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MJ',
    pre: ['CE2450'],
    co: [],
    diff: 'hardest',
    desc: 'Stress and strain, axial loading, torsion, bending, deflections of beams, combined stresses.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CE2200: {
    code: 'CE 2200',
    title: 'Fluid Mechanics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'JA',
    pre: ['CE2450'],
    co: [],
    diff: 'hardest',
    desc: 'Fluid statics, conservation laws, control volume analysis, pipe flow, open channel flow.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CE2460: {
    code: 'CE 2460',
    title: 'Dynamics and Vibrations',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S'],
    pre: ['CE2450'],
    co: ['MATH2065','MATH2070','MATH2090'],
    coreqAny: true,
    diff: 'hardest',
    desc: 'Kinematics and kinetics of particles and rigid bodies; impulse-momentum, work-energy, vibrations.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ME3333: {
    code: 'ME 3333',
    title: 'Thermodynamics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MJ',
    pre: ['MATH1552','PHYS2110'],
    co: [],
    diff: 'hardest',
    desc: 'First and second laws of thermodynamics, properties of pure substances, thermodynamic cycles.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  EE2950: {
    code: 'EE 2950',
    title: 'Comprehensive Electrical Engineering',
    dept: 'EE',
    cr: 3,
    sem: ['F','S'],
    pre: ['MATH1552'],
    co: [],
    diff: 'hardest',
    desc: 'Survey course in circuit analysis, AC circuits, and electronics for non-EE engineering majors.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== MATHEMATICS & COMPUTER SCIENCE ===== */
  MATH1550: {
    code: 'MATH 1550',
    title: 'Differential & Integral Calculus (Calculus I)',
    dept: 'MATH',
    cr: 5,
    sem: ['F','S'],
    pre: [],
    co: [],
    diff: 'hard',
    desc: 'Limits, derivatives, curve sketching, optimization, definite and indefinite integrals, fundamental theorem of calculus.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  MATH1552: {
    code: 'MATH 1552',
    title: 'Analytic Geometry & Calculus II',
    dept: 'MATH',
    cr: 4,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['MATH1550'],
    co: [],
    diff: 'hard',
    desc: 'Techniques of integration, applications, infinite series, power series, parametric equations, polar coordinates.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  MATH2057: {
    code: 'MATH 2057',
    title: 'Multidimensional Calculus (Calculus III)',
    dept: 'MATH',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['MATH1552'],
    co: [],
    diff: 'hard',
    desc: 'Vectors, partial derivatives, multiple integrals, vector calculus, Green’s and Stokes’ theorems.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  MATH2065: {
    code: 'MATH 2065',
    title: 'Elementary Differential Equations',
    dept: 'MATH',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MJ',
    pre: ['MATH1552'],
    co: [],
    diff: 'hard',
    desc: 'First-order differential equations, linear second-order equations, series solutions, Laplace transforms.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  MATH2070: {
    code: 'MATH 2070',
    title: 'Mathematical Methods in Engineering',
    dept: 'MATH',
    cr: 4,
    sem: ['F','S'],
    pre: ['MATH1552'],
    co: [],
    diff: 'hard',
    desc: 'Differential equations and linear algebra unified for engineers: matrices, eigenvalues, linear systems, and ODEs.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  MATH2090: {
    code: 'MATH 2090',
    title: 'Elementary Differential Equations and Linear Algebra',
    dept: 'MATH',
    cr: 4,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['MATH1552'],
    co: [],
    diff: 'hard',
    desc: 'Introduction to ordinary differential equations, linear algebra, systems of linear differential equations, Laplace transforms.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CSC1253: {
    code: 'CSC 1253',
    title: 'Computer Science I with C++',
    dept: 'CSC',
    cr: 3,
    sem: ['F','S'],
    pre: ['MATH1550'],
    co: [],
    diff: 'normal',
    desc: 'Fundamentals of algorithm development, structured programming in C++, control structures, arrays, pointers, functions.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== PHYSICAL SCIENCES & CHEMISTRY ===== */
  CHEM1201: {
    code: 'CHEM 1201',
    title: 'General Chemistry I',
    dept: 'CHEM',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MA',
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Atomic structure, stoichiometry, chemical bonding, gases, thermochemistry, periodic trends.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CHEM1202: {
    code: 'CHEM 1202',
    title: 'General Chemistry II',
    dept: 'CHEM',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MA',
    pre: ['CHEM1201'],
    co: [],
    diff: 'normal',
    desc: 'Intermolecular forces, kinetics, chemical equilibrium, acid-base chemistry, thermodynamics, electrochemistry.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CHEM1212: {
    code: 'CHEM 1212',
    title: 'General Chemistry Laboratory',
    dept: 'CHEM',
    cr: 2,
    sem: ['F','S','Su'],
    summer: 'JA',
    pre: [],
    co: ['CHEM1202'],
    diff: 'normal',
    desc: 'Laboratory experiments illustrating fundamental concepts of general chemistry.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  CHEM2261: {
    code: 'CHEM 2261',
    title: 'Organic Chemistry I',
    dept: 'CHEM',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'MA',
    pre: ['CHEM1202'],
    co: [],
    diff: 'hard',
    desc: 'Structure, bonding, stereochemistry, and reaction mechanisms of aliphatic organic compounds.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  PHYS2110: {
    code: 'PHYS 2110',
    title: 'Particle Mechanics (General Physics I)',
    dept: 'PHYS',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: [],
    co: ['MATH1552'],
    diff: 'hardest',
    desc: 'Calculus-based kinematics, Newton’s laws, work and energy, momentum, rotational motion, gravitation.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  PHYS2108: {
    code: 'PHYS 2108',
    title: 'Introductory Physics Laboratory',
    dept: 'PHYS',
    cr: 1,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: [],
    co: ['PHYS2110'],
    diff: 'normal',
    desc: 'Laboratory experiments covering mechanics, oscillations, and waves.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  PHYS2113: {
    code: 'PHYS 2113',
    title: 'Fields: Gravity, Electricity & Magnetism',
    dept: 'PHYS',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['PHYS2110'],
    co: [],
    diff: 'hardest',
    desc: 'Calculus-based electricity and magnetism: electric fields, Gauss’s law, potential, capacitance, circuits, magnetic fields, induction.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== HUMANITIES, SOCIAL SCIENCES & GENERAL EDUCATION ===== */
  ENGL1001: {
    code: 'ENGL 1001',
    title: 'English Composition I',
    dept: 'ENGL',
    cr: 3,
    sem: ['F','S'],
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Introduction to analytical, persuasive writing, rhetorical strategies, and research skills.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ENGL2000: {
    code: 'ENGL 2000',
    title: 'English Composition II',
    dept: 'ENGL',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: ['ENGL1001'],
    co: [],
    diff: 'normal',
    desc: 'Practice in writing and research tailored to discipline-specific genres and arguments.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  PHIL2020: {
    code: 'PHIL 2020',
    title: 'Ethics',
    dept: 'GENED',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Classical ethical theories, contemporary moral controversies, professional and engineering ethics.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  AGEC2003: {
    code: 'AGEC 2003 / ECON 2000',
    title: 'Agricultural Economics / Microeconomics',
    dept: 'GENED',
    cr: 3,
    sem: ['F','S','Su'],
    summer: 'BOTH',
    pre: [],
    co: [],
    diff: 'normal',
    desc: 'Economic analysis of market structures, consumer choices, firm behavior, resource allocation.',
    catalogRef: 'https://catalog.lsu.edu'
  },

  /* ===== ROBOTICS ENGINEERING MINOR COURSES ===== */
  ENGR3100: {
    code: 'ENGR 3100',
    title: 'Introduction to Robotics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S'],
    pre: [['MATH2070','MATH2090','MATH2065'], ['CSC1253','ME2543']],
    co: [],
    diff: 'hard',
    isRobotics: true,
    desc: 'Foundational course in kinematics, sensors, actuators, control, and programming of robotic systems. Core requirement for Robotics Engineering minor.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ENGR4100: {
    code: 'ENGR 4100',
    title: 'Industrial Robotics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F'],
    pre: ['ENGR3100'],
    co: [],
    diff: 'hard',
    isRobotics: true,
    desc: 'Robotics capstone/specialization: Robot manipulators, homogeneous transformations, inverse kinematics, dynamics, trajectory generation.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ENGR4200: {
    code: 'ENGR 4200',
    title: 'Autonomous Robotic Vehicles',
    dept: 'ENGR',
    cr: 3,
    sem: ['S'],
    pre: ['ENGR3100'],
    co: [],
    diff: 'hard',
    isRobotics: true,
    desc: 'Robotics capstone/specialization: Mobile robots, wheeled and aerial vehicles, localization, SLAM mapping, navigation, and autonomous path planning.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ENGR4103: {
    code: 'ENGR 4103',
    title: 'Assistive Robotics',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S'],
    pre: ['ENGR3100'],
    co: [],
    diff: 'hard',
    isRobotics: true,
    desc: 'Robotics capstone/specialization: Human-robot interaction, rehabilitation and assistive technologies, clinical robotic applications.',
    catalogRef: 'https://catalog.lsu.edu'
  },
  ME2543: {
    code: 'ME 2543',
    title: 'Simulation Methods for Mechanical Engineers',
    dept: 'ENGR',
    cr: 3,
    sem: ['F','S'],
    pre: ['MATH1552'],
    co: [],
    diff: 'normal',
    isRobotics: true,
    desc: 'Computational tools and numerical simulation for engineering modeling; satisfies programming requirement for Robotics minor.',
    catalogRef: 'https://catalog.lsu.edu'
  }
};

/* ===== PLACEHOLDERS (GEN ED, ELECTIVES, BREADTH SLOTS) ===== */
const PLACEHOLDERS = {
  ART: { code: 'ART GEN ED', label: 'General Education Art', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  HUMN1: { code: 'HUMN GEN ED 1', label: 'Humanities Elective 1', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  HUMN2: { code: 'HUMN GEN ED 2', label: 'Humanities Elective 2', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  HUMN3: { code: 'HUMN GEN ED 3', label: 'Humanities Elective 3', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  SOCSCI1: { code: 'SOC SCI 1', label: 'Social Science Gen Ed', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  SOCSCI_2000: { code: 'SOC SCI 2000+', label: '2000-Level Social Science Elective', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  LIFESCI: { code: 'LIFE SCI', label: 'Life Science Gen Ed', cr: 3, dept: 'GENED', sem: ['F','S','Su'] },
  EE_BREADTH1: { code: 'EE BREADTH 1', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_BREADTH2: { code: 'EE BREADTH 2', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_BREADTH3: { code: 'EE BREADTH 3', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_BREADTH4: { code: 'EE BREADTH 4', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_BREADTH5: { code: 'EE BREADTH 5', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_BREADTH6: { code: 'EE BREADTH 6', label: 'EE Breadth Elective (Group 1-5)', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_DESIGN1: { code: 'EE DESIGN 1', label: 'EE Design Elective 1', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_DESIGN2: { code: 'EE DESIGN 2', label: 'EE Design Elective 2', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_DESIGN3: { code: 'EE DESIGN 3', label: 'EE Design Elective 3', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_TECH1: { code: 'TECH ELECT 1', label: 'Technical Elective 1', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_TECH2: { code: 'TECH ELECT 2', label: 'Technical Elective 2', cr: 3, dept: 'EE', sem: ['F','S'] },
  EE_TECH3: { code: 'TECH ELECT 3', label: 'Technical Elective 3', cr: 3, dept: 'EE', sem: ['F','S'] },
  BE_DES1: { code: 'BE DESIGN 1', label: 'BE Design Elective 1', cr: 3, dept: 'BE', sem: ['F','S'] },
  BE_DES2: { code: 'BE DESIGN 2', label: 'BE Design Elective 2', cr: 3, dept: 'BE', sem: ['F','S'] },
  BE_DES3: { code: 'BE DESIGN 3', label: 'BE Design Elective 3', cr: 3, dept: 'BE', sem: ['F','S'] },
  BE_TECH: { code: 'BE TECH ELEC', label: 'BE Technical Elective', cr: 3, dept: 'BE', sem: ['F','S'] },
  BE_ELEC: { code: 'BE ELECTIVE', label: 'General Elective / ROTC', cr: 2, dept: 'BE', sem: ['F','S'] }
};

/* ===== OFFICIAL 8-SEMESTER RECOMMENDED PLANS ===== */
const PLAN_EE_DEFAULT = [
  ['completed', []],
  ['year1-fall', ['CHEM1201','MATH1550','EE1810','ART','ENGL1001']],                 // 16 cr
  ['year1-spring', ['EE2741','CSC1253','MATH1552','PHYS2110','PHYS2108','LIFESCI']],  // 17 cr
  ['year2-fall', ['EE2742','MATH2070','EE2120','PHYS2113','HUMN1']],                 // 15 cr
  ['year2-spring', ['MATH2057','EE2130','EE2810','EE2230','EE2231','ENGL2000']],      // 16 cr
  ['year3-fall', ['EE3150','EE3610','EE_BREADTH1','EE_BREADTH2','EE_BREADTH3']],     // 15 cr
  ['year3-spring', ['EE3320','EE_BREADTH4','EE_BREADTH5','EE_BREADTH6','SOCSCI_2000','PHIL2020']], // 18 cr
  ['year4-fall', ['EE_DESIGN1','EE_DESIGN2','EE_TECH1','EE4810','SOCSCI1']],          // 15 cr
  ['year4-spring', ['EE_DESIGN3','EE_TECH2','EE_TECH3','EE4820','HUMN2']]             // 15 cr = 127 total
];

const PLAN_BE_DEFAULT = [
  ['completed', []],
  ['year1-fall', ['BE1251','CHEM1201','BIOL1201','MATH1550','BIOL1208','ENGL1001']],
  ['year1-spring', ['BE1252','BIOL1202','MATH1552','CHEM1202','BIOL1209','PHYS2110']],
  ['year2-fall', ['BE2352','BIOL2051','EE2950','MATH2065','CE2450']],
  ['year2-spring', ['BE2350','CE3400','PHYS2113','ENGL2000','CHEM1212','CHEM2261']],
  ['year3-fall', ['BE4303','AGEC2003','BIOL2083','ME3333','HUMN1']],
  ['year3-spring', ['BE3340','BE4352','CE2200','HUMN2','BE_DES1']],
  ['year4-fall', ['BE3320','BE4390','CE2460','BE_DES2','ART','BE_ELEC']],
  ['year4-spring', ['BE4392','BE_DES3','HUMN3','SOCSCI1','BE_TECH']]
];

/**
 * BE + EE Double Major Recommended Schedule
 * Reconciles shared courses:
 * - MATH 1550, MATH 1552, MATH 2057/2070 satisfy both math sequences
 * - PHYS 2110, 2108, 2113 satisfy physics requirements
 * - CHEM 1201, ENGL 1001, ENGL 2000, Gen Ed Art & Social Sciences overlap
 * - EE 2120 + EE 2130 replace EE 2950
 * - Arranged across 9-10 terms (optional summer sessions) to balance the dual load.
 */
const PLAN_DOUBLE_MAJOR_DEFAULT = [
  ['completed', []],
  ['year1-fall', ['MATH1550','CHEM1201','EE1810','BE1251','ENGL1001','BIOL1201','BIOL1208']], // 19 cr foundational
  ['year1-spring', ['MATH1552','PHYS2110','PHYS2108','EE2741','CSC1253','BE1252','BIOL1202']], // 19 cr
  ['year2-fall', ['MATH2070','PHYS2113','EE2120','EE2742','BE2352','BIOL2051']],              // 19 cr
  ['year2-spring', ['MATH2057','EE2130','EE2230','EE2231','EE2810','CE2450','ENGL2000']],      // 19 cr
  ['year3-fall', ['EE3610','EE3150','CE3400','CHEM1202','CHEM1212','BIOL2083']],              // 17 cr
  ['year3-spring', ['EE3320','EE_BREADTH1','EE_BREADTH2','BE2350','ME3333','CHEM2261']],       // 18 cr
  ['year4-fall', ['EE3160','EE3410','BE3320','BE4303','CE2460','ART']],                       // 18 cr
  ['year4-spring', ['EE3530','EE3755','BE3340','BE4352','CE2200','PHIL2020']],                // 18 cr
  ['year5-fall', ['EE4810','EE_DESIGN1','EE_TECH1','BE4390','BE_DES1','SOCSCI1']],             // 18 cr
  ['year5-spring', ['EE4820','EE_DESIGN2','EE_TECH2','BE4392','BE_DES2','HUMN1']]             // 18 cr
];

/* ===== MAJOR DEFINITIONS & REGISTRY ===== */
const LSU_MAJORS = {
  EE: {
    id: 'EE',
    code: 'EE',
    name: 'Electrical Engineering',
    degree: 'B.S.E.E.',
    totalCredits: 127,
    department: 'Division of Electrical & Computer Engineering',
    office: 'Patrick F. Taylor Hall 3325',
    catalogUrl: 'https://catalog.lsu.edu',
    flowchartUrl: 'https://www.lsu.edu/eng/docs/Flowcharts/2025-2026/ee_flowchart25-26.pdf',
    defaultPlan: PLAN_EE_DEFAULT,
    coreCourseIds: [
      'EE1810','EE2120','EE2130','EE2230','EE2231','EE2741','EE2742','EE2810','EE3150','EE3320','EE3610','EE4810','EE4820',
      'MATH1550','MATH1552','MATH2057','MATH2070','MATH2090','CSC1253','PHYS2110','PHYS2108','PHYS2113','CHEM1201','ENGL1001','ENGL2000','PHIL2020'
    ]
  },
  BE: {
    id: 'BE',
    code: 'BE',
    name: 'Biological Engineering',
    degree: 'B.S.B.E.',
    totalCredits: 128,
    department: 'Department of Biological & Agricultural Engineering',
    office: 'Patrick F. Taylor Hall 1419',
    catalogUrl: 'https://catalog.lsu.edu',
    flowchartUrl: 'https://www.lsu.edu/eng/docs/Flowcharts/2025-2026/be_2025-2026flowchart.pdf',
    defaultPlan: PLAN_BE_DEFAULT,
    coreCourseIds: [
      'BE1251','BE1252','BE2350','BE2352','BE3320','BE3340','BE4303','BE4352','BE4390','BE4392',
      'BIOL1201','BIOL1208','BIOL1202','BIOL1209','BIOL2051','BIOL2083','CE2450','CE3400','CE2200','CE2460','ME3333',
      'MATH1550','MATH1552','MATH2065','MATH2070','MATH2090','PHYS2110','PHYS2113','CHEM1201','CHEM1202','CHEM1212','CHEM2261','ENGL1001','ENGL2000','AGEC2003'
    ]
  }
};

/* ===== MINORS REGISTRY ===== */
const LSU_MINORS = {
  ROBOTICS: {
    id: 'ROBOTICS',
    code: 'ROBO',
    name: 'Robotics Engineering Minor',
    totalCredits: 21,
    maxOverlap: 15,
    department: 'College of Engineering (Interdisciplinary)',
    coordinator: 'Dr. Hunter Gilbert (Patrick F. Taylor Hall 3240W)',
    catalogUrl: 'https://catalog.lsu.edu',
    infoUrl: 'https://www.lsu.edu/eng/academics/minors/robotics.php',
    courses: {
      math: ['MATH2070','MATH2065','MATH2090'],
      prog: ['CSC1253','ME2543'],
      intro: ['ENGR3100'],
      capstone: ['ENGR4100','ENGR4200','ENGR4103','ROBO_CAP'],
      coreElectives: ['EE3530','EE3755','EE3710','EE4710','EE4530','ME3133','BE3320','CE2460','CSC4444','ROBO_CORE']
    }
  }
};

/**
 * Helper to determine which major(s) or minor a course satisfies.
 * Returns: 'both' | 'ee' | 'be' | 'robo' | 'gened' | 'elective'
 */
function getCourseMajorCategory(id, state) {
  const isRobo = id.startsWith('ENGR3100') || id.startsWith('ENGR4100') || id.startsWith('ENGR4200') || id.startsWith('ENGR4103') || id === 'ME2543';
  if (state && state.minor === 'ROBOTICS' && isRobo) {
    return 'robo';
  }
  const isEE = LSU_MAJORS.EE.coreCourseIds.includes(id) || id.startsWith('EE');
  const isBE = LSU_MAJORS.BE.coreCourseIds.includes(id) || id.startsWith('BE') || id.startsWith('BIOL');
  if (isEE && isBE) return 'both';
  if (isEE) return 'ee';
  if (isBE) return 'be';
  if (isRobo) return 'robo';
  return 'gened';
}

/**
 * Degree Audit Engine
 * Evaluates whether all requirements are met for the active major(s) and minor.
 * Returns a structured audit report with status, completed counts, and missing courses.
 */
function auditDegreeRequirements(placements, doneMap, state) {
  const allIds = new Set([...Object.keys(placements || {}), ...Object.keys(doneMap || {})]);
  const isCourseDone = id => !!(doneMap && doneMap[id]);
  const getTermFor = id => (doneMap && doneMap[id]) || (placements && placements[id]) || null;

  function createItemEvaluator() {
    const usedElectives = new Set();
    return function evaluateItem(reqId, defaultTitle, defaultCr, validIds) {
      const candidateIds = validIds || [reqId];
      // Multi-slot elective pool where one course should not satisfy multiple slots:
      const isElectivePoolSlot = reqId.includes('DESIGN') || reqId.includes('TECH') || reqId.startsWith('ROBO_CORE') || reqId.includes('BREADTH') || reqId.includes('ELEC');

      let foundId = null;
      for (const cid of candidateIds) {
        if (allIds.has(cid)) {
          if (!isElectivePoolSlot || !usedElectives.has(cid)) {
            foundId = cid;
            break;
          }
        }
      }
      if (foundId && isElectivePoolSlot) {
        usedElectives.add(foundId);
      }
      const def = foundId ? (LSU_CATALOG[foundId] || PLACEHOLDERS[foundId] || {}) : (LSU_CATALOG[reqId] || PLACEHOLDERS[reqId] || {});
      const title = def.code ? `${def.code} (${def.title || def.label || defaultTitle})` : (defaultTitle || reqId);
      const cr = def.cr || defaultCr || 3;

      if (!foundId) {
        return { id: reqId, addId: candidateIds[0], name: title, cr, status: 'missing', term: null };
      }
      const term = getTermFor(foundId);
      const completed = isCourseDone(foundId);
      return {
        id: foundId,
        addId: foundId,
        name: title,
        cr,
        status: completed ? 'completed' : 'planned',
        term: term
      };
    };
  }

  // --- Audit Electrical Engineering (BSEE) ---
  function auditEE() {
    const categories = [];
    const evaluateItem = createItemEvaluator();

    // 1. Core Engineering & ECE
    const eeCoreReqs = [
      ['EE1810', 'Intro to EE', 2],
      ['EE2120', 'Circuits I', 3],
      ['EE2130', 'Circuits II', 3],
      ['EE2230', 'Electronics I', 3],
      ['EE2231', 'Electronics I Lab', 2],
      ['EE2741', 'Digital Logic I', 3],
      ['EE2742', 'Digital Logic II', 2],
      ['EE2810', 'ECE Tools', 2],
      ['EE3150', 'Probability for ECE', 3],
      ['EE3320', 'Electromagnetic Fields', 3],
      ['EE3610', 'Signals and Systems', 3],
      ['EE4810', 'Senior Design I', 3],
      ['EE4820', 'Senior Design II', 3]
    ];
    const coreItems = eeCoreReqs.map(([id, title, cr]) => evaluateItem(id, title, cr));
    categories.push({
      name: 'Electrical Engineering Core',
      desc: 'All 13 foundational and intermediate EE courses required.',
      items: coreItems
    });

    // 2. EE Breadth Electives (At least 4 of 5 groups)
    const breadthGroups = [
      { num: 1, name: 'Group 1: Digital Signal Processing', courses: ['EE3160'] },
      { num: 2, name: 'Group 2: Electronics & Solid State', courses: ['EE3220','EE3223','EE3232'] },
      { num: 3, name: 'Group 3: Electric Power', courses: ['EE3410'] },
      { num: 4, name: 'Group 4: Control Systems', courses: ['EE3530'] },
      { num: 5, name: 'Group 5: Computers & Architecture', courses: ['EE3710','EE3740','EE3752','EE3755'] }
    ];

    let satisfiedGroups = 0;
    const groupItems = breadthGroups.map(g => {
      let matched = null;
      for (const cid of g.courses) {
        if (allIds.has(cid)) { matched = cid; break; }
      }
      if (matched) {
        satisfiedGroups++;
        const term = getTermFor(matched);
        return {
          id: matched,
          name: `${LSU_CATALOG[matched].code}: ${LSU_CATALOG[matched].title}`,
          cr: 3,
          status: isCourseDone(matched) ? 'completed' : 'planned',
          term
        };
      }
      return {
        id: g.courses[0],
        addId: g.courses[0],
        name: `${g.name} (${g.courses.map(c => LSU_CATALOG[c].code).join(' or ')})`,
        cr: 3,
        status: 'missing',
        term: null
      };
    });

    // Count generic breadth placeholders too
    const genericBreadthCount = ['EE_BREADTH1','EE_BREADTH2','EE_BREADTH3','EE_BREADTH4','EE_BREADTH5','EE_BREADTH6'].filter(id => allIds.has(id)).length;
    const totalBreadthPlaced = groupItems.filter(it => it.status !== 'missing').length + genericBreadthCount;

    categories.push({
      name: 'EE Breadth Electives',
      desc: `Students must select courses from at least 4 of the 5 groups (${satisfiedGroups}/4 groups represented, ${totalBreadthPlaced}/6 breadth courses placed).`,
      items: groupItems,
      customStatus: satisfiedGroups >= 4 || totalBreadthPlaced >= 4
    });

    // 3. Foundational Math, Physics & Science
    const mathSciReqs = [
      ['MATH1550', 'Calculus I', 5],
      ['MATH1552', 'Calculus II', 4],
      ['MATH2057', 'Calculus III', 3],
      ['MATH2070', 'Mathematical Methods in Engineering (or MATH 2090/2065)', 4, ['MATH2070','MATH2090','MATH2065']],
      ['CSC1253', 'Computer Science I (C++)', 3],
      ['PHYS2110', 'Physics I (Mechanics)', 3],
      ['PHYS2108', 'Physics Laboratory I', 1],
      ['PHYS2113', 'Physics III (E&M)', 3],
      ['CHEM1201', 'Basic Chemistry', 3],
      ['LIFESCI', 'Life Science Gen-Ed', 3, ['LIFESCI','BIOL1201','BIOL1202']]
    ];
    categories.push({
      name: 'Mathematics, Sciences & Computing',
      desc: 'Foundational STEM curriculum required for Electrical Engineering.',
      items: mathSciReqs.map(([id, title, cr, valids]) => evaluateItem(id, title, cr, valids))
    });

    // 4. General Education & Humanities
    const genEdReqs = [
      ['ENGL1001', 'English Composition I', 3],
      ['ENGL2000', 'English Composition II', 3],
      ['PHIL2020', 'Ethics', 3],
      ['ART', 'Art Gen-Ed', 3],
      ['HUMN1', 'Humanities Gen-Ed 1', 3],
      ['HUMN2', 'Humanities Gen-Ed 2', 3],
      ['SOCSCI1', 'Social Science Gen-Ed', 3],
      ['SOCSCI_2000', '2000+ Level Social Science', 3]
    ];
    categories.push({
      name: 'General Education & Humanities',
      desc: 'University core requirements including communication, ethics, and arts.',
      items: genEdReqs.map(([id, title, cr]) => evaluateItem(id, title, cr))
    });

    // 5. Design & Tech Electives
    const desTechReqs = [
      ['EE_DESIGN1', 'EE Design Elective 1', 3, ['EE_DESIGN1','EE4160','EE4242','EE4420','EE4530','EE4710','EE4720']],
      ['EE_DESIGN2', 'EE Design Elective 2', 3, ['EE_DESIGN2','EE4160','EE4242','EE4420','EE4530','EE4710','EE4720']],
      ['EE_DESIGN3', 'EE Design Elective 3', 3, ['EE_DESIGN3','EE4160','EE4242','EE4420','EE4530','EE4710','EE4720']],
      ['EE_TECH1', 'Technical Elective 1', 3, ['EE_TECH1','ENGR3100']],
      ['EE_TECH2', 'Technical Elective 2', 3, ['EE_TECH2','ENGR4100','ENGR4200','ENGR4103']],
      ['EE_TECH3', 'Technical Elective 3', 3, ['EE_TECH3']]
    ];
    categories.push({
      name: 'Design & Technical Electives',
      desc: 'Advanced technical specialization courses (3 Design + 3 Technical).',
      items: desTechReqs.map(([id, title, cr, valids]) => evaluateItem(id, title, cr, valids))
    });

    return { major: 'Electrical Engineering', targetCredits: 127, categories };
  }

  // --- Audit Biological Engineering (BSBE) ---
  function auditBE() {
    const categories = [];
    const evaluateItem = createItemEvaluator();

    // 1. BE Core
    const beCoreReqs = [
      ['BE1251', 'Intro to Engineering Methods', 2],
      ['BE1252', 'Biology in Engineering', 2],
      ['BE2350', 'Experimental Methods for Engineers', 3],
      ['BE2352', 'Quantitative Biology in Engineering', 3],
      ['BE3320', 'Mechanical Design for Bio Engineering', 3],
      ['BE3340', 'Process Design in Bio Engineering', 3],
      ['BE4303', 'Properties of Biological Materials', 3],
      ['BE4352', 'Transport Phenomena in Bio Engr', 3],
      ['BE4390', 'Senior Engineering Design I', 3],
      ['BE4392', 'Senior Engineering Design II', 3]
    ];
    categories.push({
      name: 'Biological Engineering Core',
      desc: 'All 10 required biological engineering courses.',
      items: beCoreReqs.map(([id, title, cr]) => evaluateItem(id, title, cr))
    });

    // 2. Biological Sciences
    const bioReqs = [
      ['BIOL1201', 'Biology for Science Majors I', 3],
      ['BIOL1208', 'Biology Laboratory I', 1],
      ['BIOL1202', 'Biology for Science Majors II', 3],
      ['BIOL1209', 'Biology Laboratory II', 1],
      ['BIOL2051', 'General Microbiology', 4],
      ['BIOL2083', 'Elements of Biochemistry', 3]
    ];
    categories.push({
      name: 'Biological Sciences',
      desc: 'Foundational life sciences courses and laboratories.',
      items: bioReqs.map(([id, title, cr]) => evaluateItem(id, title, cr))
    });

    // 3. Engineering Mechanics & Circuits
    const engrReqs = [
      ['CE2450', 'Statics', 3],
      ['CE3400', 'Mechanics of Materials', 3],
      ['CE2200', 'Fluid Mechanics', 3],
      ['CE2460', 'Dynamics and Vibrations', 3],
      ['ME3333', 'Thermodynamics', 3],
      ['EE2950', 'Electrical Engineering (or EE 2120)', 3, ['EE2950','EE2120']]
    ];
    categories.push({
      name: 'Engineering Science & Mechanics',
      desc: 'Core engineering mechanics, thermodynamics, and circuit analysis.',
      items: engrReqs.map(([id, title, cr, valids]) => evaluateItem(id, title, cr, valids))
    });

    // 4. Mathematics & Chemistry
    const mathChemReqs = [
      ['MATH1550', 'Calculus I', 5],
      ['MATH1552', 'Calculus II', 4],
      ['MATH2065', 'Differential Equations (or MATH 2070/2090)', 3, ['MATH2065','MATH2070','MATH2090']],
      ['PHYS2110', 'Physics I (Mechanics)', 3],
      ['PHYS2113', 'Physics III (E&M)', 3],
      ['CHEM1201', 'Basic Chemistry I', 3],
      ['CHEM1202', 'Basic Chemistry II', 3],
      ['CHEM1212', 'General Chemistry Laboratory', 2],
      ['CHEM2261', 'Organic Chemistry I', 3]
    ];
    categories.push({
      name: 'Math, Physics & Chemistry',
      desc: 'Physical sciences, organic chemistry, and mathematics sequence.',
      items: mathChemReqs.map(([id, title, cr, valids]) => evaluateItem(id, title, cr, valids))
    });

    return { major: 'Biological Engineering', targetCredits: 128, categories };
  }

  // --- Audit Robotics Engineering Minor ---
  function auditRobotics() {
    const categories = [];
    const evaluateItem = createItemEvaluator();

    const minorReqs = [
      ['MATH2070', 'Mathematics Requirement (MATH 2070, 2090, or 2065)', 4, ['MATH2070','MATH2090','MATH2065']],
      ['CSC1253', 'Programming Requirement (CSC 1253 or ME 2543)', 3, ['CSC1253','ME2543']],
      ['ENGR3100', 'Introduction to Robotics (Core)', 3],
      ['ROBO_CORE1', 'Robotics Core Elective 1 (EE 3530, EE 3755, BE 3320, etc.)', 3, ['EE3530','EE3755','EE3710','EE4710','EE4530','BE3320','CE2460','ROBO_CORE']],
      ['ROBO_CORE2', 'Robotics Core Elective 2', 3, ['EE3530','EE3755','EE3710','EE4710','EE4530','BE3320','CE2460','ROBO_CORE']],
      ['ROBO_CORE3', 'Robotics Core Elective 3 (outside major academic unit)', 3, ['BE3320','CE2460','ME3133','ROBO_CORE']],
      ['ENGR4100', 'Robotics Specialization Capstone (ENGR 4100, 4200, or 4103)', 3, ['ENGR4100','ENGR4200','ENGR4103','ROBO_CAP']]
    ];

    categories.push({
      name: 'Robotics Engineering Minor (21 Credit Hours)',
      desc: 'Minimum GPA 2.5 and grade C or better required in all minor courses. At least one core course must be outside your major department.',
      items: minorReqs.map(([id, title, cr, valids]) => evaluateItem(id, title, cr, valids))
    });

    return { minor: 'Robotics Engineering Minor', targetCredits: 21, categories };
  }

  const reports = [];
  if (state.major === 'EE') reports.push(auditEE());
  else reports.push(auditBE());

  if (state.doubleMajor) {
    if (state.secondaryMajor === 'BE' && state.major !== 'BE') reports.push(auditBE());
    else if (state.secondaryMajor === 'EE' && state.major !== 'EE') reports.push(auditEE());
  }

  if (state.minor === 'ROBOTICS') {
    reports.push(auditRobotics());
  }

  return reports;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LSU_CATALOG,
    PLACEHOLDERS,
    PLAN_EE_DEFAULT,
    PLAN_BE_DEFAULT,
    PLAN_DOUBLE_MAJOR_DEFAULT,
    LSU_MAJORS,
    LSU_MINORS,
    getCourseMajorCategory,
    auditDegreeRequirements
  };
}


