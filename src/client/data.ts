// The personal + project data that drives the home page. Edit this file to update the site —
// everything below renders from these values, so there is no HTML to hand-maintain.

export const NAME = 'Andres Irarragorri';
export const TITLE = 'Software Engineer / Devops';

// EDIT ME — a one-line bio about what you build and care about.
export const BIO =
  'EDIT ME — I build data-driven web apps, developer tooling, and small platforms. This is where my projects live.';

export const LINKS = {
  github: 'https://github.com/AndresI19',
  email: 'mailto:andres.m.irarragorri@gmail.com',
  // EDIT ME — replace with your real LinkedIn profile URL.
  linkedin: 'https://www.linkedin.com/in/EDIT-ME',
  // Résumé PDF, served from this app's public/ (moved here from the quiz).
  resume: '/resume.pdf',
};

/** Liveliness probe for a project, polled from the browser through the reverse proxy. */
export interface Live {
  // 'health'  → GET `url`; 200 means live.
  // 'vmcp'    → GET `url` (the vMCP registry) and confirm `slug` is present + enabled.
  type: 'health' | 'vmcp';
  url: string;
  slug?: string;
}

export interface Project {
  name: string;
  /** Last-commit date (YYYY-MM or YYYY-MM-DD). */
  date: string;
  blurb: string;
  repo: string;
  tech: string;
  /** Root-relative path to the live front-end behind the proxy, when one exists. */
  frontend?: string;
  /** Featured projects appear in the top horizontal-scroll banner. */
  featured?: boolean;
  /** When set, the card shows a live/offline indicator polled every minute. */
  live?: Live;
}

// Featured: the quiz, vMCP, RS-Agent-Planning, and rs-mcp-server lead the banner; the rest follow
// in the full list. Dates are last-commit dates.
export const PROJECTS: Project[] = [
  {
    name: 'Cloud Developer Quiz',
    date: '2026-07',
    featured: true,
    tech: 'Vanilla TS · Vite',
    frontend: '/cloud-developer-quiz/',
    repo: 'https://github.com/AndresI19/cloud-developer-quiz',
    live: { type: 'health', url: '/cloud-developer-quiz/api/health' },
    blurb:
      'A data-driven flashcard quiz for cloud & system-design interview prep, with an isometric garden you grow by answering correctly.',
  },
  {
    name: 'open-vMCP',
    date: '2026-07-09',
    featured: true,
    tech: 'TypeScript · Carbon',
    frontend: '/vmcp/',
    repo: 'https://github.com/AndresI19/open-vMCP',
    live: { type: 'health', url: '/vmcp/api/servers' },
    blurb:
      'A virtual-MCP gateway that fronts MCP servers with a data-driven registry, mocked identity/RBAC, and a Carbon dashboard.',
  },
  {
    name: 'RS-Agent-Planning',
    date: '2026-07-09',
    featured: true,
    tech: 'Docs · Architecture',
    repo: 'https://github.com/AndresI19/RS-Agent-Planning',
    blurb:
      'Architecture, infrastructure, and task planning for a RuneScape research assistant (MCP server + Discord bot).',
  },
  {
    name: 'rs-mcp-server',
    date: '2026-06-22',
    featured: true,
    tech: 'Python · MCP',
    repo: 'https://github.com/AndresI19/rs-mcp-server',
    // "Live" = registered + enabled in the vMCP gateway it feeds.
    live: { type: 'vmcp', url: '/vmcp/api/servers', slug: 'rs-mcp' },
    blurb:
      'An MCP server exposing RuneScape wiki search, Grand Exchange prices, and player hiscores as callable tools — fronted by open-vMCP.',
  },
  {
    name: 'Job-Search-Go',
    date: '2026-06-30',
    tech: 'Go',
    repo: 'https://github.com/AndresI19/Job-Search-Go',
    blurb:
      'A Go pipeline that ingests job listings, verifies them with ATS matching + Claude, and emits a scored, ranked CSV.',
  },
  {
    name: 'Claude-Project-Tooling',
    date: '2026-06-21',
    tech: 'Python · Shell',
    repo: 'https://github.com/AndresI19/Claude-Project-Tooling',
    blurb:
      'Dev-environment docs and shared tooling: PR creation, session recording, and token-usage automation scripts.',
  },
];

export interface Experience {
  role: string;
  org: string;
  dates: string;
  blurb: string;
  links: { label: string; url: string }[];
}

// Pulled from the résumé: the DataStage/agentic work at IBM.
export const EXPERIENCE: Experience[] = [
  {
    role: 'DevOps Engineer (Band 7)',
    org: 'IBM',
    dates: 'Jul 2025 – Present',
    blurb:
      'Took a custom DataStage / StreamSets agent (with mounted MCP tools) from proof-of-concept to cloud-production — containerizing five microservice pods, scripting CI/CD, and reconciling SSL + network communication.',
    links: [
      {
        label: 'Data Integration Agent',
        url: 'https://www.ibm.com/docs/en/watsonx/wdi/saas?topic=integration-integrating-data-agent',
      },
    ],
  },
  {
    role: 'Back End Developer (Band 7)',
    org: 'IBM',
    dates: 'Jan 2021 – Jul 2025',
    blurb:
      'Built the service-suite components of a hybrid-cloud ETL engine bridging the control and data planes, plus migration tooling for a 1990s legacy desktop application.',
    links: [
      {
        label: 'DataStage Remote Engine',
        url: 'http://dataplatform.cloud.ibm.com/docs/content/dstage/dsnav/topics/create-remote-engine.html?context=cpdaas',
      },
      {
        label: 'DataStage Migration',
        url: 'https://dataplatform.cloud.ibm.com/docs/content/dstage/dsnav/topics/migration.html?context=cpdaas&audience=wdp',
      },
    ],
  },
];
