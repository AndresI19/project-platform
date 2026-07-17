// The personal + project data that drives the home page. Edit this file to update the site —
// everything below renders from these values, so there is no HTML to hand-maintain.

export const NAME = 'Andres Irarragorri';
export const TITLE = 'Software Engineer / DevOps';

export const BIO =
  'Hey — glad you stopped by! I spent half a decade at IBM on DataStage, where customers create their ' +
  "own ETL flows hosted on hybrid cloud. I'm currently helping promote the agentic layer for this to the cloud " +
  'from the platform/infra/DevOps side. My degree is in physics, and it still sets how I build: nothing is ' +
  "viable until demonstrated, and problems get broken down to their fundamentals until they're " +
  'comprehended.';

/** The closer, on its own line — it is the turn from "who I am" to "and here is the thing itself". */
export const BIO_CODA =
  'Having learned how to launch a platform: welcome to mine. Everything below is built, hosted, ' +
  'and running right here!';

const GITHUB_USER = 'AndresI19';
const EMAIL = 'andres.m.irarragorri@gmail.com';

const LINKEDIN = 'https://www.linkedin.com/in/andresirarragorri';

// Local to this file — every consumer is a link below, not another module.
const GITHUB_ORG = `https://github.com/${GITHUB_USER}`;

/** A contact link. The visible text is the value itself (handle / address), not a category name. */
export interface Contact {
  /** Selects the inline SVG mark drawn beside the value. */
  icon: 'github' | 'email' | 'linkedin' | 'resume';
  /** The literal value shown to the reader. */
  value: string;
  url: string;
  /** Accessible name, since the visible text is a bare value with no label. */
  title: string;
  external?: boolean;
}

/** `in/<handle>` — the value a reader recognises, pulled from whatever URL is configured. */
const linkedinHandle = (url: string): string => `in/${(url.split('/in/')[1] ?? '').replace(/\/+$/, '')}`;

// Annotated before the .filter(), not after: chaining off a bare array literal drops the
// contextual type, widening each `icon` back to `string` and failing to match Contact.
const ALL_CONTACTS: Contact[] = [
  { icon: 'github', value: GITHUB_USER, url: GITHUB_ORG, title: 'GitHub profile', external: true },
  { icon: 'email', value: EMAIL, url: `mailto:${EMAIL}`, title: 'Email me' },
  {
    icon: 'linkedin',
    value: linkedinHandle(LINKEDIN),
    url: LINKEDIN,
    title: 'LinkedIn profile',
    external: true,
  },
  // Extensionless on purpose: the server 302s /resume to the current /resume-<uid>.pdf. Cloudflare
  // edge-caches by extension, so /resume is never pinned and always resolves to the latest résumé —
  // the cache-bust that lets a replaced PDF appear at once. See server/content.ts.
  { icon: 'resume', value: 'Résumé (PDF)', url: '/resume', title: 'Résumé', external: true },
];

// Drop any contact still holding a placeholder, so the page never ships a dead link.
export const CONTACTS: Contact[] = ALL_CONTACTS.filter((c) => !c.url.includes('EDIT-ME'));

/** Liveliness probe for a project, polled from the browser through the reverse proxy. */
export interface Live {
  // 'health'  → GET `url`; 200 means live.
  // 'vmcp'    → GET `url` (the vMCP registry) and confirm `slug` is present + enabled.
  type: 'health' | 'vmcp';
  url: string;
  slug?: string;
}

/** A button on a project card. */
export interface Link {
  label: string;
  /** Fallback destination. Overwritten at runtime when `resolve` is set. */
  href: string;
  /** Renders as the filled call-to-action rather than a ghost button. */
  primary?: boolean;
  /** Off-platform destination — opens in a new tab. */
  external?: boolean;
  /** Resolve `href` in the browser instead of hard-coding it. 'vmcp' looks `slug` up in the
   *  gateway registry and rewrites href to /vmcp/servers/<uuid>. The UUID is assigned by the
   *  database at seed time and changes whenever the DB is reseeded, so it must never be baked
   *  into this file; if the lookup fails the fallback `href` above still works. */
  resolve?: { from: 'vmcp'; slug: string };
}

export interface Project {
  name: string;
  /** Last-commit date (YYYY-MM or YYYY-MM-DD). */
  date: string;
  blurb: string;
  tech: string;
  links: Link[];
  /** Featured entries appear in the top horizontal-scroll banner. */
  featured?: boolean;
  /** When set, the card shows a live/offline indicator polled every minute. */
  live?: Live;
  /**
   * The name this project is reported under by /api/versions. Set it and the card shows the version
   * that thing is ACTUALLY running (see client/versions.ts).
   *
   * Five of these are deployed services: the key is the name of the image and of the Service, and the
   * version comes from a VERSION file baked into that image.
   *
   * `platform` is the odd one and is deliberately not a service. It is the orchestration repo — the
   * manifests, the routing, the boot — which ships no image, so it has no image to carry a version
   * in. Its version is written onto the shared volume by the deploy and read back from there. It is
   * the version of the platform as a whole, which is why the footer tag shows it.
   *
   * A repo on this page that is neither (the planning repos, the tooling) has no version to show,
   * which is why this is optional rather than derived from the name.
   */
  component?: 'home' | 'quiz' | 'vmcp' | 'rs-mcp-server' | 'platform-auth' | 'platform';
  /** Artwork filling the featured card's empty space; a path under public/. */
  image?: string;
  /** Two stacked images instead of one. Use when a single graphic misrepresents the project —
   *  the quiz's garden alone reads as a game, so the question it asks is shown above it. */
  images?: [string, string];
  /** An inline schematic drawn in place of an image. 'vmcp' shows a user reaching two MCP
   *  servers through the gateway; 'k8s' is a mock `kubectl get pods` of the running cluster. */
  diagram?: 'vmcp' | 'k8s';
  /** Status badge — how finished this is, so a visitor does not misjudge it. */
  tag?: { label: string; icon: 'wip' | 'archived' };
}

/** Several projects that are really one body of work — rendered inside a single card and a
 *  single list row, because splitting them across elements hides the fact that they pertain
 *  to each other. */
export interface Group {
  name: string;
  blurb: string;
  /** Most recent last-commit date across the members. */
  date: string;
  featured?: boolean;
  /** A logo/wordmark identifying the group at a glance, drawn on a plate above the members. */
  logo?: string;
  /** A drawn schematic, for a group whose identity is better shown than logo'd. Mutually useful
   *  with `logo`; a group can have either. */
  diagram?: Project['diagram'];
  members: Project[];
}

export type Entry = Project | Group;

export const isGroup = (e: Entry): e is Group => 'members' in e;

// Featured entries lead the banner; the rest follow in the full list. Dates are last-commit dates.
export const ENTRIES: Entry[] = [
  {
    name: 'Cloud Developer Quiz',
    date: '2026-07',
    featured: true,
    tech: 'Vanilla TS · Vite',
    live: { type: 'health', url: '/cloud-developer-quiz/api/health' },
    component: 'quiz',
    blurb:
      'A data-driven flashcard quiz for cloud & system-design interview prep, with an isometric garden you grow by answering correctly.',
    // The question first, the garden second. Led by the garden alone, the card reads as a game and
    // the word "quiz" gets lost — so an actual fill-in-the-blank card carries the top slot.
    // The garden art carries a version in its NAME on purpose. public/ is served verbatim — no build
    // fingerprint — under `cache-control: max-age=14400` behind Cloudflare, so replacing this file in
    // place left every browser and CDN edge showing the previous garden for four hours. Bump the
    // suffix when the art changes and the new URL is fetched at once, by everyone.
    images: ['/quiz-sharding.png', '/home-page-garden-v2.gif'],
    links: [
      { label: 'Check out! →', href: '/cloud-developer-quiz/', primary: true },
      { label: 'Repository', href: `${GITHUB_ORG}/data-driven-quiz-server`, external: true },
    ],
  },
  {
    name: 'open-vMCP',
    date: '2026-07-09',
    featured: true,
    tech: 'TypeScript · Carbon',
    live: { type: 'health', url: '/vmcp/api/servers' },
    component: 'vmcp',
    blurb:
      'A reverse proxy for MCP: one endpoint in front of every MCP server, with a data-driven registry, mocked identity/RBAC, and a dashboard recording each call that crosses it.',
    diagram: 'vmcp',
    links: [
      { label: 'Check out! →', href: '/vmcp/', primary: true },
      { label: 'Repository', href: `${GITHUB_ORG}/open-vMCP`, external: true },
    ],
  },
  {
    // Third in the banner now, by choice: the quiz leads, and this — the page you are on, and the
    // source of truth for @platform/ui, the design system every other front end here builds from —
    // follows it. A monorepo, so a group: the home page and the identity service behind it live in
    // one repository because they version together, the home page rendering identities the auth
    // service issues.
    name: 'project-platform',
    date: '2026-07-13',
    featured: true,
    blurb: 'The home page and the identity service behind it.',
    members: [
      {
        name: 'portfolio-home',
        date: '2026-07-13',
        tech: 'Vanilla TS · Vite · Express',
        // Reaching this page at all means the server answered, so its own health probe is honest.
        live: { type: 'health', url: '/api/health' },
        component: 'home',
        blurb: 'This site.',
        links: [
          {
            label: 'Repository →',
            href: `${GITHUB_ORG}/project-platform/tree/main/portfolio-home`,
            primary: true,
            external: true,
          },
        ],
      },
      {
        name: 'platform-auth',
        date: '2026-07-13',
        tech: 'TS · Express · Postgres · jose',
        // Its public keys ARE its liveness: if JWKS answers, the service is up and signing. Every
        // other front end already verifies tokens against this exact endpoint, so probing it here is
        // the same signal they rely on.
        live: { type: 'health', url: '/.well-known/jwks.json' },
        component: 'platform-auth',
        blurb: 'The identity service: a username, a chosen password, and an RS256-signed token.',
        links: [
          {
            label: 'Repository →',
            href: `${GITHUB_ORG}/project-platform/tree/main/platform-auth`,
            primary: true,
            external: true,
          },
        ],
      },
    ],
  },
  {
    // The server and its planning repo are one project — the planning drives the server.
    name: 'RuneScape Research Assistant',
    date: '2026-07-09',
    featured: true,
    blurb: 'An MCP server exposing RuneScape game data as callable tools.',
    logo: '/runescape.png',
    members: [
      {
        name: 'rs-mcp-server',
        date: '2026-06-22',
        tech: 'Python · MCP',
        // "Live" = registered + enabled in the vMCP gateway it is fronted by.
        live: { type: 'vmcp', url: '/vmcp/api/servers', slug: 'rs-mcp' },
        component: 'rs-mcp-server',
        blurb: 'RuneScape wiki search, GE prices, and hiscores, fronted by open-vMCP.',
        links: [
          {
            label: 'View tools',
            // Fallback is the server list; resolved to the exact server's detail page at runtime.
            href: '/vmcp/servers',
            primary: true,
            resolve: { from: 'vmcp', slug: 'rs-mcp' },
          },
          { label: 'Repository', href: `${GITHUB_ORG}/rs-mcp-server`, external: true },
        ],
      },
      {
        name: 'RS-Agent-Planning',
        date: '2026-07-09',
        tech: 'Docs · Architecture',
        blurb:
          'Architecture, infrastructure, and task planning — and the issue tracker the server is built from.',
        // No repository link: the board is the useful view of this repo, and it links back to the
        // issues (and therefore the repo) itself.
        links: [
          {
            label: 'Project board →',
            href: 'https://github.com/users/AndresI19/projects/5',
            primary: true,
            external: true,
          },
        ],
      },
    ],
  },
  {
    // The platform this page is served by — worth featuring, since it is the thing tying the
    // other projects together into one host.
    name: 'platform-orchestration',
    date: '2026-07-13',
    featured: true,
    // Compose is gone: the platform was cut over to Kubernetes, and the public site is now served
    // from the cluster through a Cloudflare tunnel. The old string said "Docker Compose" for a day
    // after that stopped being true.
    tech: 'Kubernetes · nginx · Cloudflare Tunnel',
    // If this page answered at all, nginx routed to `home` — so the stack it orchestrates is up.
    // Reaching the home page IS the liveliness signal for the thing that serves the home page.
    live: { type: 'health', url: '/api/health' },
    // The one entry whose version is not an image's. This repo ships none — it describes the platform
    // rather than running on it — so the deploy writes its version onto the shared volume and the
    // home server reads it back. It is the version of the platform as a whole.
    component: 'platform',
    blurb:
      'A minikube cluster where nginx fronts every app on one port, published through an outbound Cloudflare tunnel with no open ports, its secrets vaulted.',
    diagram: 'k8s',
    links: [
      // The wiki is the real documentation — architecture, networking, secrets, backup/restore — so
      // it leads. The repository is the artifact; the wiki is the explanation.
      { label: 'Wiki', href: `${GITHUB_ORG}/platform-orchestration/wiki`, external: true },
      { label: 'Repository', href: `${GITHUB_ORG}/platform-orchestration`, external: true },
    ],
  },
  {
    name: 'Job-Search-Go',
    date: '2026-06-30',
    tech: 'Go',
    tag: { label: 'Work in progress', icon: 'wip' },
    blurb:
      'A Go pipeline that ingests job listings, verifies them with ATS matching + Claude, and emits a scored, ranked CSV.',
    links: [{ label: 'Repository', href: `${GITHUB_ORG}/Job-Search-Go`, external: true }],
  },
  {
    name: 'Claude-Project-Tooling',
    date: '2026-06-21',
    tech: 'Python · Shell',
    blurb:
      'Dev-environment docs and shared tooling: PR creation, session recording, and token-usage automation scripts.',
    links: [{ label: 'Repository', href: `${GITHUB_ORG}/Claude-Project-Tooling`, external: true }],
  },
  {
    name: 'Lux-Strike',
    date: '2020-12-02',
    tech: 'Python · Pygame',
    tag: { label: 'Archived', icon: 'archived' },
    blurb: 'A hand-rolled 2D game engine on a hexagonal grid.',
    links: [{ label: 'Repository', href: `${GITHUB_ORG}/Lux-Strike`, external: true }],
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
