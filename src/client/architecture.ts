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
// THE GRID IS THE DIAGRAM. Five columns, and each one means something:
//
//   col 1  the vault — a tall narrow box spanning the cluster, because that is what it does
//   col 2  home                      col 4  quiz
//   col 3  platform-content — BETWEEN home and quiz, one plane down, because it is mounted into both
//   col 5  vmcp, its database, rs-mcp-server — one column, one straight line
//
// Both callers sit on row 1, above Cloudflare. The agent used to have a lane of its own down the
// right-hand side, which cost the diagram ~170px of dead width for its entire height. It buys
// nothing: the agent takes the same road as the browser and only gets off at a different stop.
//
// The Public APIs sit OUTSIDE both frames. They are third-party hosts on the internet; drawing them
// inside the cluster said something false, and the outbound arrow crossing the boundary is the whole
// point being made.
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

/** Who is calling. Inline SVG rather than an emoji: an emoji is a font, and renders as a different
 *  picture (or a blank box) on every platform — which is not a thing to leave to chance in a legend. */
const PERSON = `<svg class="arch-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4.2 3.4-6.6 7.5-6.6s7.5 2.4 7.5 6.6"/></svg>`;
const ROBOT = `<svg class="arch-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v3"/><circle cx="12" cy="2" r="1.2" fill="currentColor" stroke="none"/><rect x="4" y="6" width="16" height="12" rx="3.5"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M2.5 11v3M21.5 11v3"/></svg>`;

const box = (cls: string, name: string, meta = '', href = '', icon = ''): string => {
  const inner =
    `${icon}<span class="arch-name">${name}</span>${meta ? `<span class="arch-meta">${meta}</span>` : ''}`;
  return href
    ? `<a class="arch-box ${cls} arch-link" href="${href}">${inner}</a>`
    : `<div class="arch-box ${cls}">${inner}</div>`;
};

/** A downward arrow. `cls` places it (row + column); the label sits BESIDE the shaft, not over it. */
const arrow = (cls: string, label = ''): string =>
  `<div class="arch-arrow ${cls}" aria-hidden="true">${label ? `<span class="arch-arrow-l">${label}</span>` : ''}</div>`;

export function architecturePanel(): string {
  // TWELVE content columns, and every relationship in the picture is expressed as a span of them —
  // no pixel offsets, so nothing drifts when the viewport changes.
  //
  //   home 2-5 · quiz 6-9 · vmcp 10-13    — four columns each, so the three services fill the width
  //   platform-content 4-7                — the OVERLAP of home and quiz, so it sits under the gap
  //   vmcp-db 11-12                       — the middle two of vmcp's four: centred and narrower,
  //                                         leaving column 10 and column 13 free as LANES
  //
  // Those two lanes are the point. fvt-traffic rises up column 10 into the gateway; the MCP-over-SSE
  // line descends column 13 to rs-mcp-server. One line either side of the database, each a real flow,
  // and both stay aligned at any width because they are columns rather than offsets.
  //
  // The mounts come free from the same idea: home occupies 2-5 and platform-content 4-7, so they
  // SHARE column 4 — a straight line there joins them, and no elbow is needed, because with a grid
  // fine enough to say what it means there is no offset left to bridge.
  //
  // Row map (keep in step with styles.css):
  //   1 callers        7 cloudflared    13 volumes
  //   2 arrows         8 arrow          14 fvt-traffic
  //   3 Cloudflare     9 nginx          15 rs-mcp-server
  //   4 arrow ↓ (spans the frame edges, so it lands ON cloudflared, not on the box's wall)
  //   5 hw label      10 fan-out        16 the cluster's bottom padding
  //   6 k8s label     11 services       17 arrow ↓ (crosses OUT of the machine)
  //                   12 connectors     18 Public APIs — outside, on the internet
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-diagram">
          <div class="arch-grid">

            <!-- ── Callers, both above the front door ────────────────────────────────────────── -->
            ${box('b-you r1', 'You', 'a browser', '', PERSON)}
            ${box('b-agent r1', 'Agent / MCP consumer', 'Claude Desktop, an SDK', '', ROBOT)}

            ${arrow('a-user w r2', 'TLS')}
            ${arrow('a-agent right r2', 'MCP')}

            <div class="arch-frame arch-hw" aria-hidden="true"></div>
            <div class="arch-frame arch-k8s" aria-hidden="true"></div>
            <span class="arch-tag arch-tag-hw r5">one Fedora workstation · Colima QEMU VM</span>
            <span class="arch-tag arch-tag-k8s r6">minikube cluster · namespace: platform</span>

            <div class="arch-box b-vault vault">
              <span class="vault-t">sealed-secrets · the vault</span>
            </div>

            ${box('b-edge w r3', 'Cloudflare', 'terminates TLS · the only thing the internet can see')}

            <!-- These two SPAN the frame edges (rows 4→7). Stopped at row 4 they died on the
                 workstation's wall, as though the traffic never got in. It does: it lands on
                 cloudflared, inside. -->
            ${arrow('a-user w pierce', 'outbound tunnel — never an inbound port')}
            ${arrow('a-agent right pierce')}

            ${box('b-edge w r7', 'cloudflared', 'dials OUT — there is no open port')}
            ${arrow('a-user w r8', 'http')}
            ${arrow('a-agent right r8')}

            ${box('b-net w r9', 'nginx', 'the router — splits by host and by path')}

            <!-- A router fans out: one arrow per destination. -->
            ${arrow('a-user s1 r10', 'path')}
            ${arrow('a-user s2 r10', 'path')}
            ${arrow('a-agent s3 r10', 'MCP · /mcp')}

            ${box('b-app s1 r11', 'home', '/', '/')}
            ${box('b-app s2 r11', 'quiz', '/cloud-developer-quiz/', '/cloud-developer-quiz/')}
            ${box('b-app s3 r11', 'vmcp', '/vmcp/ · MCP gateway', '/vmcp/')}

            <!-- MOUNTS ARE NOT TRAFFIC. A volume is attached to a pod; nothing flows along it, so it
                 gets a plain line and no arrowhead. The gateway's link to its database IS traffic —
                 queries go one way, rows come back — so that one gets an arrow. -->
            <div class="mount m-home" aria-hidden="true"></div>
            <div class="mount m-quiz" aria-hidden="true"></div>
            ${arrow('a-user s3 r12 short', 'SQL')}

            ${box('b-vol pc r13', 'platform-content', 'PersistentVolume — mounted into home + quiz')}
            ${box('b-vol s3 r13 db', 'vmcp-db', 'PersistentVolume')}

            ${box('b-infra s1 r14', 'fvt-traffic', 'replays the suite through the gateway, on a timer')}
            <div class="fvt-elbow" aria-hidden="true"><i class="fvt-head"></i></div>

            <!-- Down the right edge of the gateway's column, PAST the database rather than through
                 it — which is what lets vmcp sit over its db and still draw a straight line here. -->
            <div class="vm-rail" aria-hidden="true"><span class="vm-rail-l">MCP over SSE</span></div>

            ${box('b-infra s3 r15', 'rs-mcp-server', '17 RuneScape tools')}

            <!-- The cluster's bottom padding: without a row of its own, the boxes press against the
                 frame's wall. -->
            <div class="pad r16" aria-hidden="true"></div>

            <!-- OUTSIDE the machine: other people's servers, on the internet. The arrow leaves
                 rs-mcp-server and only rs-mcp-server, and it crosses the boundary to get there. -->
            ${arrow('a-user s3 r17', 'outbound HTTPS')}
            <div class="arch-box b-ext arch-ext-box s3 r18">
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
            <span class="arch-chip b-net">router</span>
            <span class="arch-chip b-edge">edge</span>
            <span class="arch-chip b-infra">platform</span>
            <span class="arch-chip b-vol">volume mount</span>
            <span class="arch-chip b-vault">vault</span>
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
