// The platform architecture diagram, revealed by a pull-down on the masthead banner.
//
// It is a PANEL INSIDE THE BANNER, not a modal. The banner is the page's introduction — "everything
// below is built, hosted, and running right here" — and the diagram is the evidence for that claim,
// so it belongs in the same frame rather than in a dialog stacked over it. Pulling the banner down
// keeps the page's own context visible instead of dimming it behind a backdrop.
//
// WHY THIS IS HTML AND NOT AN SVG (or the wiki's ASCII art):
// The wiki renders this as a monospace ASCII block — fine on a desktop, useless on a phone, because
// it cannot wrap. An SVG would be no better: fixed coordinates can only scale uniformly, so the
// whole picture would shrink to fit a 390px screen rather than adapt to it. Built as tiers of boxes,
// the diagram REFLOWS — tiers stack, boxes go full width, every label stays legible.
//
// It mirrors the "whole picture" section of the orchestration wiki, which is the source of truth.

const WIKI = 'https://github.com/AndresI19/platform-orchestration/wiki';

type Node = {
  name: string;
  meta?: string;
  /** Drives the box's colour: what kind of thing is this? */
  kind: 'ext' | 'infra' | 'app' | 'data';
  href?: string;
};

type Tier = {
  /** The hop INTO this tier — drawn on the connector above it. */
  edge?: string;
  nodes: Node[];
};

const ABOVE: Tier[] = [
  {
    nodes: [
      { name: 'A visitor', meta: 'browser', kind: 'ext' },
      { name: 'An MCP client', meta: 'Claude Desktop', kind: 'ext' },
    ],
  },
  { edge: 'TLS', nodes: [{ name: 'Cloudflare', meta: 'terminates TLS', kind: 'ext' }] },
];

const CLUSTER: Tier[] = [
  {
    edge: 'outbound tunnel — not an inbound port',
    nodes: [{ name: 'cloudflared', meta: 'dials out', kind: 'infra' }],
  },
  {
    edge: 'http',
    nodes: [{ name: 'nginx', meta: 'the router — splits by host + path', kind: 'infra' }],
  },
  {
    edge: 'routed by path',
    nodes: [
      { name: 'home', meta: '/', kind: 'app', href: '/' },
      { name: 'quiz', meta: '/cloud-developer-quiz/', kind: 'app', href: '/cloud-developer-quiz/' },
      { name: 'vmcp', meta: '/vmcp/ · the MCP gateway', kind: 'app', href: '/vmcp/' },
    ],
  },
  {
    edge: 'volumes · SQL · MCP over SSE',
    nodes: [
      { name: 'platform-content', meta: 'résumé + card decks', kind: 'data' },
      { name: 'vmcp-db', meta: 'registry + telemetry', kind: 'data' },
      { name: 'rs-mcp-server', meta: '17 RuneScape tools', kind: 'infra' },
    ],
  },
  {
    edge: 'replays the test suite through the gateway',
    nodes: [{ name: 'fvt-traffic', meta: 'keeps the dashboard live', kind: 'infra' }],
  },
];

const BELOW: Tier[] = [
  {
    edge: 'outbound HTTPS',
    nodes: [
      { name: 'RuneScape wikis', meta: 'MediaWiki API', kind: 'ext' },
      { name: 'Grand Exchange', meta: 'live prices', kind: 'ext' },
      { name: 'Hiscores', meta: 'player stats', kind: 'ext' },
      { name: 'deepwiki', meta: '2nd MCP upstream', kind: 'ext' },
    ],
  },
];

function nodeHtml(n: Node): string {
  const cls = `arch-node arch-${n.kind}`;
  const body = `<span class="arch-name">${n.name}</span>${
    n.meta ? `<span class="arch-meta">${n.meta}</span>` : ''
  }`;
  // Only a node you can actually visit becomes a link, so a pointer cursor never appears on a box
  // that goes nowhere.
  return n.href
    ? `<a class="${cls} arch-link" href="${n.href}">${body}</a>`
    : `<div class="${cls}">${body}</div>`;
}

const tiersHtml = (tiers: Tier[]): string =>
  tiers
    .map(
      (t) =>
        `${t.edge ? `<div class="arch-edge"><span>${t.edge}</span></div>` : ''}
         <div class="arch-tier">${t.nodes.map(nodeHtml).join('')}</div>`,
    )
    .join('');

/** The whole panel: the pull-down's contents. Rendered into the banner by view.ts. */
export function architecturePanel(): string {
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-diagram">
          ${tiersHtml(ABOVE)}

          <!-- The cluster is drawn as an actual enclosure, the way the wiki's box-drawing does it.
               A dashed rule with a caption under it reads as a section heading; a frame with the
               components inside it reads as a boundary — which is the single most important fact in
               the picture, because it is what "nothing is exposed inbound" means. -->
          <div class="arch-cluster">
            <div class="arch-cluster-tag">minikube cluster · namespace: platform</div>
            ${tiersHtml(CLUSTER)}
          </div>

          ${tiersHtml(BELOW)}
        </div>

        <footer class="arch-foot">
          <div class="arch-key">
            <span class="arch-chip arch-app">app</span>
            <span class="arch-chip arch-infra">platform</span>
            <span class="arch-chip arch-data">state</span>
            <span class="arch-chip arch-ext">outside the cluster</span>
          </div>
          <a class="arch-more" href="${WIKI}" target="_blank" rel="noopener">Full write-up in the wiki →</a>
        </footer>
      </div>
    </div>
  `;
}

/** Wire the pull-down. Called by mount(), after the markup exists. */
export function architectureToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="architecture"]');
  const mast = document.querySelector<HTMLElement>('.masthead');
  if (!btn || !mast) return;

  btn.addEventListener('click', () => {
    const open = mast.classList.toggle('arch-open');
    btn.setAttribute('aria-expanded', String(open));
    // The label is the control's whole affordance, so it has to say what the next click does.
    btn.querySelector('.arch-pull-t')!.textContent = open
      ? 'Hide the platform architecture'
      : 'Show me the platform architecture';
    // Opening extends the banner well past the fold; without this the diagram unfurls below the
    // viewport and it looks like nothing happened.
    if (open) {
      requestAnimationFrame(() =>
        document.getElementById('arch-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      );
    }
  });
}
