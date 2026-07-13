// The platform architecture diagram, revealed by a chevron on the masthead banner.
//
// It is a PANEL INSIDE THE BANNER, not a modal. The bio's closing line makes a claim — everything
// below is built, hosted and running right here — and this is the evidence for it, so it belongs in
// the same frame rather than floating over a dimmed page.
//
// WHY THIS IS HTML AND NOT AN SVG (or the wiki's ASCII art):
// Both of those can only scale UNIFORMLY. On a 390px phone the whole picture shrinks past
// legibility. Built as boxes in a grid, the diagram REFLOWS — the two columns become one, the boxes
// go full width, and every label stays at a readable size.
//
// The layout is a two-column grid, and that is load-bearing rather than decorative:
//
//     col 1 (the traffic path)          col 2 (the agent's rail)
//     ┌───────────────┐                 ┌──────────────────┐
//     │      You      │                 │ Agent / MCP      │
//     └───────┬───────┘                 └────────┬─────────┘
//     ┌───────▼───────────────────────┐          │  a rail that SPANS grid rows,
//     │         Cloudflare            │          │  so the agent's route to the
//     └───────┬───────────────────────┘          │  gateway is one straight line
//     ┌───────▼───────────────────────┐          │  past the web tier
//     │           nginx               │          │
//     └───────┬───────────────────────┘          │
//     ┌───┬───▼───┬───────┐                      │
//     │ home │ quiz │ vmcp │ ◄────────────────────┘
//
// A grid row-span gives an exactly-aligned vertical line for free, and it degrades to a single arrow
// when the grid collapses to one column. Measuring the boxes in JS and drawing an overlay would look
// the same and break on every reflow.
//
// It mirrors the "whole picture" section of the orchestration wiki, which is the source of truth.

const WIKI = 'https://github.com/AndresI19/platform-orchestration/wiki';

/** The external APIs the tool server calls. Compressed to one box: they are all the same KIND of
 *  thing (an outbound HTTPS call to somebody else's public API), and drawing four identical boxes
 *  spent width on repetition instead of on information. The table carries what actually differs. */
const OUTBOUND: [string, string][] = [
  ['RuneScape wikis', 'quests, items, mechanics'],
  ['Grand Exchange', 'live item prices'],
  ['Hiscores', 'player stats'],
  ['deepwiki', 'a second MCP upstream'],
];

const box = (
  cls: string,
  name: string,
  meta = '',
  href = '',
): string => {
  const inner = `<span class="arch-name">${name}</span>${meta ? `<span class="arch-meta">${meta}</span>` : ''}`;
  return href
    ? `<a class="arch-box ${cls} arch-link" href="${href}">${inner}</a>`
    : `<div class="arch-box ${cls}">${inner}</div>`;
};

/** A downward arrow between tiers, carrying the protocol of the hop it represents. */
const arrow = (row: string, label: string): string =>
  `<div class="arch-arrow ${row}"><span class="arch-arrow-l">${label}</span></div>`;

export function architecturePanel(): string {
  // EVERY STAGE IS ITS OWN GRID ROW, and the enclosures are FRAMES that span rows behind the
  // content rather than divs that wrap it. That is what lets the agent's rail span rows 2→9 and land
  // its arrowhead exactly on the apps row: a nested wrapper would have put the apps inside a box the
  // grid could not see into, and the rail would have had nothing to align to. It is also what lets
  // "You" span the full width and centre on the DIAGRAM rather than on the left column.
  //
  // Each enclosure gets its own LABEL ROW — a short spacer at the top of its span. Without one the
  // frame's border lands on top of a full-width box and its tag has nowhere to sit that is not on
  // top of content. It is what the wiki's box-drawing gets for free by putting the caption on the
  // border line itself.
  //
  // Row map (keep in step with the grid-row values in styles.css):
  //   1 You / Agent        7 cloudflared      13 arrow (SSE)
  //   2 arrow (TLS)        8 arrow (http)     14 tool servers
  //   3 Cloudflare         9 nginx            15 arrow (outbound)
  //   4 arrow (tunnel)    10 arrow (routed)   16 public APIs
  //   5 hardware label    11 apps
  //   6 cluster label     12 volumes + vault
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-diagram">
          <div class="arch-grid">

            ${box('b-you r1', 'You', 'a browser')}
            ${box('b-agent r1', 'Agent / MCP consumer', 'Claude Desktop, an SDK')}

            <!-- The rail: the agent's route is one straight line to the gateway. It really does pass
                 through the tunnel and the router — but it never touches the web tier, and that is
                 the fact worth drawing. -->
            <div class="arch-rail" aria-hidden="true">
              <span class="arch-rail-l">MCP · /mcp</span>
            </div>

            <!-- Frames, painted behind the content (z-index 0). Hardware outermost: all of this is
                 one machine under a desk, and the cluster nests inside it — so "the cloud" here is
                 visibly something you could unplug. The tags are SIBLINGS, not children: a child of
                 a z-index:0 frame cannot paint above the content boxes, because it cannot escape its
                 parent's stacking context. -->
            <div class="arch-frame arch-hw" aria-hidden="true"></div>
            <div class="arch-frame arch-k8s" aria-hidden="true"></div>
            <span class="arch-tag arch-tag-hw r5">one Fedora workstation · Colima QEMU VM</span>
            <span class="arch-tag arch-tag-k8s r6">minikube cluster · namespace: platform</span>

            ${arrow('r2', 'TLS')}
            ${box('b-edge wide r3', 'Cloudflare', 'terminates TLS · the only thing the internet can see')}
            ${arrow('r4', 'outbound tunnel — never an inbound port')}

            ${box('b-infra wide r7', 'cloudflared', 'dials OUT — there is no open port')}
            ${arrow('r8', 'http')}
            ${box('b-infra wide r9', 'nginx', 'the router — splits by host and by path')}
            ${arrow('r10', 'routed by path')}

            <div class="arch-row r11">
              ${box('b-app', 'home', '/', '/')}
              ${box('b-app', 'quiz', '/cloud-developer-quiz/', '/cloud-developer-quiz/')}
              ${box('b-app', 'vmcp', '/vmcp/ · MCP gateway', '/vmcp/')}
            </div>

            <div class="arch-row r12">
              ${box('b-vol', 'platform-content', 'PersistentVolume — mounted into home + quiz')}
              ${box('b-vol', 'vmcp-db', 'PersistentVolume — registry + call telemetry')}
              ${box('b-vault', 'sealed-secrets', 'the vault — decrypts the committed secrets')}
            </div>

            ${arrow('r13', 'MCP over SSE')}
            <div class="arch-row r14">
              ${box('b-infra', 'rs-mcp-server', '17 RuneScape tools')}
              ${box('b-infra', 'fvt-traffic', 'replays the suite through the gateway')}
            </div>

            ${arrow('r15', 'outbound HTTPS — nobody dials in')}
            <div class="arch-box b-ext arch-ext-box r16">
              <span class="arch-name">Public APIs</span>
              <table class="arch-tbl">
                ${OUTBOUND.map(([n, w]) => `<tr><th>${n}</th><td>${w}</td></tr>`).join('')}
              </table>
            </div>

          </div>
        </div>

        <footer class="arch-foot">
          <div class="arch-key">
            <span class="arch-chip b-app">app</span>
            <span class="arch-chip b-infra">platform</span>
            <span class="arch-chip b-vol">volume mount</span>
            <span class="arch-chip b-vault">vault</span>
            <span class="arch-chip b-ext">outside</span>
          </div>
          <a class="arch-more" href="${WIKI}" target="_blank" rel="noopener">Full write-up in the wiki →</a>
        </footer>
      </div>
    </div>
  `;
}

/** Wire the chevron. Called by mount(), after the markup exists. */
export function architectureToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="architecture"]');
  const mast = document.querySelector<HTMLElement>('.masthead');
  if (!btn || !mast) return;

  const setOpen = (open: boolean): void => {
    mast.classList.toggle('arch-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Hide the platform architecture' : 'Show the platform architecture');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // else the document handler below closes it in the same tick
    setOpen(!mast.classList.contains('arch-open'));
  });

  // Click anywhere outside the banner to fold it away. The panel is a large, transient thing hanging
  // over the page; requiring a return trip to the chevron to dismiss it is a small tax on every use.
  document.addEventListener('click', (e) => {
    if (!mast.classList.contains('arch-open')) return;
    if (!mast.contains(e.target as Node)) setOpen(false);
  });

  // Escape does the same. The panel behaves like an overlay, so it should dismiss like one.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mast.classList.contains('arch-open')) setOpen(false);
  });
}
