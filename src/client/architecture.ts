// The platform architecture diagram, revealed by a pull-down in the masthead banner.
//
// It is a PANEL INSIDE THE BANNER, not a modal. The bio's closing line makes a claim — everything
// below is built, hosted and running right here — and this is the evidence for it, so it belongs in
// the same frame rather than floating over a dimmed page.
//
// WHY THIS IS HTML AND NOT AN SVG (or the wiki's ASCII art):
// Both of those can only scale UNIFORMLY. On a phone the whole picture shrinks past legibility.
// Built as boxes in a grid, the diagram REFLOWS — the columns collapse, the boxes go full width, and
// every label stays at a readable size.
//
// THE GRID IS THE DIAGRAM. Six columns, sixteen rows, all stated explicitly:
//
//   col 1  the vault — a tall narrow box spanning the whole cluster, because that is what it does
//   col 2  home                      col 4  quiz
//   col 3  platform-content — BETWEEN home and quiz, because it is mounted into both
//   col 5  vmcp, its database, rs-mcp-server, the outbound APIs — one column, one straight line
//   col 6  the agent's lane, outside the cluster
//
// Connectors are grid items that SPAN rows. That is what makes them exact: the line from vmcp to
// rs-mcp-server is a real element occupying rows 12→14, not a measurement taken in JavaScript that
// would break on the next reflow.
//
// It mirrors the "whole picture" section of the orchestration wiki, which is the source of truth.

const WIKI = 'https://github.com/AndresI19/platform-orchestration/wiki';

/** The outbound APIs. One box with a table: they are all the same KIND of thing — an outbound HTTPS
 *  call to somebody else's public API — and four identical boxes spent width on repetition. */
const OUTBOUND: [string, string][] = [
  ['RuneScape wikis', 'quests, items, mechanics'],
  ['Grand Exchange', 'live item prices'],
  ['Hiscores', 'player stats'],
  ['deepwiki', 'a 2nd MCP upstream'],
];

const box = (cls: string, name: string, meta = '', href = ''): string => {
  const inner = `<span class="arch-name">${name}</span>${meta ? `<span class="arch-meta">${meta}</span>` : ''}`;
  return href
    ? `<a class="arch-box ${cls} arch-link" href="${href}">${inner}</a>`
    : `<div class="arch-box ${cls}">${inner}</div>`;
};

/** A downward arrow. `cls` places it (row + column); the label sits BESIDE the shaft, not over it. */
const arrow = (cls: string, label = ''): string =>
  `<div class="arch-arrow ${cls}" aria-hidden="true">${label ? `<span class="arch-arrow-l">${label}</span>` : ''}</div>`;

export function architecturePanel(): string {
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-diagram">
          <div class="arch-grid">

            <!-- ── Callers ───────────────────────────────────────────────────────────────────── -->
            <!-- "You" spans the same columns as the Cloudflare box and centres on them, so the
                 browser's entry point sits squarely over the thing it enters. -->
            ${box('b-you r1', 'You', 'a browser')}
            ${box('b-agent r1', 'Agent / MCP consumer', 'Claude Desktop, an SDK')}

            <!-- The agent does NOT bypass the stack — it takes the same road (Cloudflare →
                 cloudflared → nginx → vmcp), it just gets off at a different stop and never touches
                 the web tier. So its path runs in dark red, dotted, BESIDE the browser's grey path
                 rather than around it. This elbow is where it joins. -->
            <div class="ag-join" aria-hidden="true"><i class="ag-head"></i></div>

            <!-- Enclosures, painted behind the content. The tags are siblings, not children: a child
                 of a z-index:0 frame cannot paint above the boxes, because it cannot escape its
                 parent's stacking context. -->
            <div class="arch-frame arch-hw" aria-hidden="true"></div>
            <div class="arch-frame arch-k8s" aria-hidden="true"></div>
            <span class="arch-tag arch-tag-hw r5">one Fedora workstation · Colima QEMU VM</span>
            <span class="arch-tag arch-tag-k8s r6">minikube cluster · namespace: platform</span>

            <!-- The vault spans the cluster, because that is precisely what it does: every secret in
                 every workload is decrypted by it. A tall box on the flank says that; a box in a row
                 would have made it look like one more component in the chain. -->
            <div class="arch-box b-vault vault">
              <span class="vault-t">sealed-secrets · the vault</span>
            </div>

            ${arrow('a-user r2', 'TLS')}
            ${box('b-edge wide r3', 'Cloudflare', 'terminates TLS · the only thing the internet can see')}

            ${arrow('a-user r4', 'outbound tunnel — never an inbound port')}
            ${arrow('a-agent c5 r4')}

            ${box('b-infra wide r7', 'cloudflared', 'dials OUT — there is no open port')}
            ${arrow('a-user r8', 'http')}
            ${arrow('a-agent c5 r8')}

            ${box('b-infra wide r9', 'nginx', 'the router — splits by host and by path')}

            <!-- nginx fans out: one arrow per destination, which is what a router does. -->
            ${arrow('a-user c2 r10', 'path')}
            ${arrow('a-user c4 r10', 'path')}
            ${arrow('a-agent c5 r10', 'MCP · /mcp')}

            ${box('b-app c2 r11', 'home', '/', '/')}
            ${box('b-vol c3 r11', 'platform-content', 'PersistentVolume — mounted into BOTH')}
            ${box('b-app c4 r11', 'quiz', '/cloud-developer-quiz/', '/cloud-developer-quiz/')}
            ${box('b-app c5 r11', 'vmcp', '/vmcp/ · MCP gateway', '/vmcp/')}

            <!-- The database sits directly beneath the gateway that owns it. -->
            ${box('b-vol c5 r12 db', 'vmcp-db', 'PersistentVolume')}

            <!-- The gateway's line to the tool server runs down the RIGHT EDGE of the column, PAST
                 the database rather than through it. That is what lets vmcp sit over its db AND still
                 draw a genuinely straight vertical arrow to rs-mcp-server. -->
            <div class="vm-rail" aria-hidden="true"><span class="vm-rail-l">MCP over SSE</span></div>

            ${box('b-infra c5 r14', 'rs-mcp-server', '17 RuneScape tools')}
            ${box('b-infra c2 r14', 'fvt-traffic', 'replays the suite through the gateway, on a timer')}

            <!-- The outbound arrow leaves rs-mcp-server, and ONLY rs-mcp-server: it is the one thing
                 in here that talks to the outside world. -->
            ${arrow('a-user c5 r15', 'outbound HTTPS')}
            <div class="arch-box b-ext arch-ext-box c5 r16">
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
            <span class="arch-chip k-agent">agent path</span>
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

  const label = btn.querySelector('.arch-pull-t');

  const setOpen = (open: boolean): void => {
    mast.classList.toggle('arch-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (label) {
      label.textContent = open ? 'Hide the platform architecture' : 'Show me the platform architecture';
    }
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // else the document handler below closes it again in the same tick
    setOpen(!mast.classList.contains('arch-open'));
  });

  // Click anywhere outside the banner to fold it away. The panel is a large, transient thing; making
  // people travel back to the control to dismiss it is a tax on every use.
  document.addEventListener('click', (e) => {
    if (mast.classList.contains('arch-open') && !mast.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mast.classList.contains('arch-open')) setOpen(false);
  });
}
