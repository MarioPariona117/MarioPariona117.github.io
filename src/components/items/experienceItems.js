// Professional and teaching experience.
//
// Transcribed from the CV knowledge base (CV/knowledge_base/work_experience.yaml
// and teaching_experience.yaml) — that repo stays the source of truth. Nothing
// here is embellished beyond what those files say; if a claim needs changing,
// change it there first and mirror it here.

export const workExperience = [
  {
    role: 'Research Software Engineer',
    company: 'Camtech Innovations Ltd.',
    location: 'Cambridge, UK',
    period: 'Aug 2025 – Present',
    bullets: [
      'Took end-to-end ownership of the computer vision system and data pipeline, running on Linux, for estimating nutritional information from sequences of food images.',
      'Built a task-graph-based pipeline that runs independent steps in parallel without a hard-coded execution order.',
      'Engineered modular, extensible interfaces with pluggable model components, enabling rapid prototyping.',
    ],
  },
  {
    role: 'Founder & Lead Engineer',
    company: 'Ignis Amoris (independent project, not incorporated)',
    location: 'Remote',
    period: 'Dec 2025 – Present',
    bullets: [
      'Founded and lead a small independent group building a gamified Catholic education app. It is not a registered company; applying for Charitable Incorporated Organisation status is a possible future step, not a current one.',
      'Architected a scalable Nx monorepo in TypeScript unifying a Vite/React web application, an Expo/React Native mobile app, and a custom CMS, sharing core logic and components across platforms.',
      'Engineered a PostgreSQL backend via Supabase with strict Row Level Security, and a multi-provider LLM content pipeline (Google Gemini, OpenAI GPT-4o, and a theological API) with per-model cost and token tracking across roughly 1.87M tokens, feeding a five-layer curriculum hierarchy (paths → modules → courses → lessons → cards).',
      'Manage the complete software lifecycle, from UI/UX design through CI/CD deployments on Vercel to database schema migrations.',
      'Designed deterministic content-quality safeguards — citation-range validation and duplicate-content linting — so the product does not rest solely on unverified LLM output.',
    ],
  },
];

export const teachingExperience = [
  {
    role: 'Competitive Programming Coach',
    company: 'Competitive Programming Society, UTEC (University of Engineering and Technology), Peru',
    location: 'Remote',
    period: '2023 – Present',
    bullets: [
      'Delivered both on-site and virtual lectures, honing communication skills across different platforms.',
    ],
  },
  {
    role: 'Competitive Programming Instructor',
    company: 'Xplain',
    location: 'Remote',
    period: '2022 – 2023',
    bullets: [
      'Broke down and delivered complex concepts to young students, preparing them for the Ibero-American Olympiad of Informatics.',
    ],
  },
  {
    role: 'Mathematics Teacher',
    company: 'Grupo Mate',
    location: 'Lima, Peru',
    period: '2021 – 2022',
    bullets: [
      'Adjusted teaching methods to accommodate different learning paces and needs across students aged 10 to 16, while preparing them for Mathematical Olympiads.',
    ],
  },
];

// Transcribed from CV/knowledge_base/education.yaml.
export const education = [
  {
    role: 'BA (Hons) Computer Science',
    company: 'University of Cambridge, Trinity College',
    location: 'Cambridge, UK',
    period: 'Oct 2022 – Jun 2025',
    bullets: [
      'Final-year dissertation on reinforcement learning for Blokus, supervised by Dr Petar Veličković, awarded a First.',
      'Machine learning: Deep Neural Networks, Machine Visual Perception, Deep Learning & Structured Data, Machine Learning & Bayesian Inference, Machine Learning & Real-world Data, Data Science, Artificial Intelligence.',
      'Systems and theory: Computer Architecture, Scientific Computing, Algorithms, Programming in C/C++, Bioinformatics.',
    ],
  },
];

// From CV/knowledge_base/volunteering.yaml. The Fisher Society and chaplaincy
// football entries live here rather than in the Achievements page's
// extracurricular list, which would otherwise say the same thing twice.
export const volunteering = [
  {
    role: 'Mentor, Women in Computer Science Programme',
    company: 'University of Cambridge',
    location: 'Cambridge, UK',
    period: '2024 – 2025',
    bullets: [
      'Provided one-to-one mentorship to Year 12 female students over two consecutive years, guiding them through independent Computer Science research projects.',
      'Offered academic and career advice to encourage and support underrepresented groups in pursuing Computer Science at university level.',
    ],
  },
  {
    role: 'Mentor',
    company: 'Olimpiada Femenil Mexicana de Informática (OFMI)',
    location: 'Remote',
    period: '2024',
    bullets: [
      "Provided weekly one-to-one mentorship to two female high-school students, teaching advanced competitive programming in C/C++ in preparation for the European Girls' Olympiad in Informatics team selection test.",
      'Covered dynamic programming, graph theory and segment trees, alongside contest strategy.',
    ],
  },
  {
    role: 'Vice Chair',
    company: 'Fisher Society (Cambridge Catholic Chaplaincy)',
    location: 'Cambridge, UK',
    period: '2024 – 2025',
    bullets: [
      "Co-led a 16-person committee overseeing events and outreach for the university's Catholic society of over 200 students.",
      "Conceived and ran the 'Travelling Mary' initiative — a daily gathering through May where a statue of Mary visited different Cambridge colleges for prayer; it has since become an annual programme.",
      'Organised cooking and setup rotas, mobilising the wider student body to support weekly events with 60+ attendees.',
    ],
  },
  {
    role: 'Confirmation Small Group Leader',
    company: 'Our Lady and the English Martyrs (OLEM)',
    location: 'Cambridge, UK',
    period: '2025 – 2026',
    bullets: [
      'Led biweekly small-group discussions for a group of 6–8 young people aged 12–14, within a parish Confirmation cohort of roughly 30, exploring the basics of the Catholic faith.',
      'Adapted to changing group compositions and supported youth retreats, providing consistent pastoral care.',
    ],
  },
  {
    role: 'Football Co-Captain',
    company: 'Catholic Chaplaincy Football Team, University of Cambridge',
    location: 'Cambridge, UK',
    period: '2024 – 2026',
    bullets: [
      'Coordinated training and managed fixtures against inter-faith teams in Cambridge and Catholic teams from Oxford, Reading and London.',
      'Led the team to an undefeated record across all matches in the 2025–26 academic year.',
    ],
  },
];

// From CV/knowledge_base/skills.yaml.
export const skills = [
  {
    title: 'Programming languages',
    items: 'C++, Python, TypeScript, JavaScript, Java, SQL, OCaml, SystemVerilog, RISC-V assembly, Prolog, Dart',
  },
  {
    title: 'Frameworks & libraries',
    items: 'PyTorch, TensorFlow, React, Flutter, Gymnasium, OpenGL',
  },
  {
    title: 'Tools & platforms',
    items: 'Linux, Git, GitHub, VS Code, LaTeX, Arduino',
  },
  {
    title: 'Spoken languages',
    items: 'Spanish (native), English (C1), Portuguese (basic), Italian (basic)',
  },
];
