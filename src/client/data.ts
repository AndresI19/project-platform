// The personal + project data that drives the home page. Edit this file to update the site —
// everything below renders from these values, so there is no HTML to hand-maintain.

export const NAME = 'Andres Irarragorri';
export const TITLE = 'Software Engineer · Cloud & Platform';

// EDIT ME — a one-line bio about what you build and care about.
export const BIO =
  'EDIT ME — I build data-driven web apps, developer tooling, and small platforms. This is where my projects live.';

export const LINKS = {
  github: 'https://github.com/AndresI19',
  email: 'mailto:andres.m.irarragorri@gmail.com',
  // EDIT ME — replace with your real LinkedIn profile URL.
  linkedin: 'https://www.linkedin.com/in/EDIT-ME',
};

export interface Project {
  name: string;
  /** Last-commit date (YYYY-MM or YYYY-MM-DD), used for ordering and display. */
  date: string;
  /** One-sentence description. */
  blurb: string;
  /** Public git repository URL. */
  repo: string;
  /** Short tech tag(s). */
  tech: string;
  /** Root-relative path to the live front-end behind the proxy, when one exists. */
  frontend?: string;
  /** Pinned projects lead the list regardless of date. */
  pinned?: boolean;
}

// Order: pinned front-ends first (quiz, then vMCP), then everything else by last commit desc.
export const PROJECTS: Project[] = [
  {
    name: 'Cloud Developer Quiz',
    date: '2026-07',
    pinned: true,
    tech: 'Vanilla TS · Vite',
    frontend: '/cloud-developer-quiz/',
    // EDIT ME once the quiz repo is created on GitHub.
    repo: 'https://github.com/AndresI19/cloud-developer-quiz',
    blurb:
      'A data-driven flashcard quiz for cloud & system-design interview prep, with an isometric garden you grow by answering correctly.',
  },
  {
    name: 'open-vMCP',
    date: '2026-07-09',
    pinned: true,
    tech: 'TypeScript · Carbon',
    frontend: '/vmcp/',
    repo: 'https://github.com/AndresI19/open-vMCP',
    blurb:
      'A virtual-MCP gateway that fronts MCP servers with a data-driven registry, mocked identity/RBAC, and a Carbon dashboard.',
  },
  {
    name: 'RS-Agent-Planning',
    date: '2026-07-09',
    tech: 'Docs · Architecture',
    repo: 'https://github.com/AndresI19/RS-Agent-Planning',
    blurb:
      'Architecture, infrastructure, and task planning for a RuneScape research assistant (MCP server + Discord bot).',
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
    name: 'rs-mcp-server',
    date: '2026-06-22',
    tech: 'TypeScript · MCP',
    repo: 'https://github.com/AndresI19/rs-mcp-server',
    blurb:
      'An MCP server exposing RuneScape wiki search, Grand Exchange prices, and player hiscores as callable tools.',
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
