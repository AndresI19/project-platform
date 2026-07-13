// The platform architecture, revealed by a pull-down in the masthead banner. TWO diagrams now, paged
// by a slider:
//
//   1. Platform topology — who talks to whom, from the browser down to the outbound APIs. This is the
//      evidence for the bio's closing claim: everything below is built, hosted and running right here.
//   2. Auth & the browser — the narrower story of how the identity service issues a token, how the
//      front ends carry it, and how each verifies it on its own. Split out because it is a different
//      question (a sequence, not a topology) and crowding it into the map made both harder to read.
//
// WHY HTML AND NOT SVG (or the wiki's ASCII art): both scale only UNIFORMLY — on a phone the whole
// picture shrinks past legibility. Built as boxes in a grid, the diagram REFLOWS: columns collapse,
// boxes go full width, and every label stays readable.
//
// THE GRID IS THE DIAGRAM (topology). The vault is column 1; the twelve content columns carry four
// services at three columns each (home, quiz, vmcp, platform-auth), so the row fills the width and
// every connector is a column SPAN rather than a measured pixel offset — which is what keeps it exact
// across reflow. It mirrors the "whole picture" section of the orchestration wiki, the source of truth.

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

/* ── Diagram 1 — the topology ──────────────────────────────────────────────────────────────────── */
function topologyDiagram(): string {
  // Row map (keep in step with styles.css):
  //   1 callers   3 Cloudflare   7 cloudflared   9 nginx   11 services   13 volumes   15 rs-mcp
  //   2 arrows    4 pierce↓      8 arrow↓        10 fan-out 12 connectors 14 fvt      17 arrow↓ 18 APIs
  //
  // Four services, THREE content columns each: home 2-4, quiz 5-7, vmcp 8-10, platform-auth 11-13
  // (grid lines s1 2/5 · s2 5/8 · s3 8/11 · s4 11/14). vmcp keeps its whole stack — the database in
  // its middle column, fvt rising up the left lane, the MCP-over-SSE line down the right lane, the
  // agent's road on the same columns. platform-auth is the new fourth peer, with its own database
  // under it. It is drawn as one more thing nginx routes to — because that is what it is; the story of
  // the TOKEN it hands out lives in diagram 2, so this map stays a map.
  return `
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

        ${arrow('a-user w pierce', 'outbound tunnel — never an inbound port')}
        ${arrow('a-agent right pierce')}

        ${box('b-edge w r7', 'cloudflared', 'dials OUT — there is no open port')}
        ${arrow('a-user w r8', 'http')}
        ${arrow('a-agent right r8')}

        ${box('b-net w r9', 'nginx', 'the router — splits by host and by path')}

        <!-- A router fans out: one arrow per destination. Four now — the fourth is /auth/. -->
        ${arrow('a-user s1 r10', 'path')}
        ${arrow('a-user s2 r10', 'path')}
        ${arrow('a-agent s3 r10', 'MCP · /mcp')}
        ${arrow('a-user s4 r10', '/auth/')}

        ${box('b-app s1 r11', 'home', '/', '/')}
        ${box('b-app s2 r11', 'quiz', '/cloud-developer-quiz/', '/cloud-developer-quiz/')}
        ${box('b-app s3 r11', 'vmcp', '/vmcp/ · MCP gateway', '/vmcp/')}
        ${box('b-auth s4 r11', 'platform-auth', '/auth/ · the identity service')}

        <!-- MOUNTS ARE NOT TRAFFIC — plain lines, no arrowheads. The two database links ARE traffic. -->
        <div class="mount m-home" aria-hidden="true"></div>
        <div class="mount m-quiz" aria-hidden="true"></div>
        ${arrow('a-user s3 r12 short', 'SQL')}
        ${arrow('a-user s4 r12 short authq', 'SQL')}

        ${box('b-vol pc r13', 'platform-content', 'PersistentVolume — mounted into home + quiz')}
        ${box('b-vol s3 r13 db', 'vmcp-db', 'PersistentVolume')}
        ${box('b-vol s4 r13 authdb', 'platform-db', 'PersistentVolume')}

        ${box('b-infra s1 r14', 'fvt-traffic', 'replays the suite through the gateway, on a timer')}
        <div class="fvt-elbow" aria-hidden="true"><i class="fvt-head"></i></div>

        <!-- Down the right edge of the gateway's column, PAST the database. -->
        <div class="vm-rail" aria-hidden="true"><span class="vm-rail-l">MCP over SSE</span></div>

        ${box('b-infra s3 r15', 'rs-mcp-server', '17 RuneScape tools')}

        <div class="pad r16" aria-hidden="true"></div>

        <!-- OUTSIDE the machine: other people's servers, on the internet. -->
        ${arrow('a-user s3 r17', 'outbound HTTPS')}
        <div class="arch-box b-ext arch-ext-box s3 r18">
          <span class="arch-name">Public APIs</span>
          <table class="arch-tbl">
            ${OUTBOUND.map(([n, w]) => `<tr><th>${n}</th><td>${w}</td></tr>`).join('')}
          </table>
        </div>

      </div>

      <footer class="arch-foot">
        <div class="arch-key">
          <span class="arch-chip b-app">app</span>
          <span class="arch-chip b-auth">identity</span>
          <span class="arch-chip b-net">router</span>
          <span class="arch-chip b-edge">edge</span>
          <span class="arch-chip b-infra">platform</span>
          <span class="arch-chip b-vol">volume mount</span>
          <span class="arch-chip b-vault">vault</span>
          <span class="arch-chip k-agent">agent path</span>
        </div>
        <a class="arch-more" href="${WIKI}" target="_blank" rel="noopener">Full write-up in the wiki →</a>
      </footer>
    </div>`;
}

/* ── Diagram 2 — auth & the browser ────────────────────────────────────────────────────────────── */
function authDiagram(): string {
  // A SEQUENCE, not a topology, so it gets its own small grid rather than the map's 18 rows. Three
  // moves in order: the browser gets a token from platform-auth (①), carries it to the front ends on
  // later calls (②), and each front end verifies it by pulling the public keys (③). The dashed line is
  // the teaching point — verification is decentralised, there is no per-request call back to auth.
  return `
    <div class="arch-diagram arch-auth">
      <div class="auth-grid">

        ${box('au-you', 'You', 'a browser', '', PERSON)}

        <!-- Left arrow: sign in. Right arrow: carry the token. -->
        ${arrow('au-a-issue', '① sign in')}
        ${arrow('au-a-carry', '② carry it')}
        <span class="au-note au-note-issue"><code>POST /auth/token</code> — the 7-char code in, an RS256 token back</span>
        <span class="au-note au-note-carry"><code>Authorization: Bearer …</code> on quiz-progress &amp; vMCP-admin calls</span>

        ${box('b-auth au-auth', 'platform-auth', 'mints &amp; signs the token')}

        <div class="au-pages">
          <div class="au-pages-h">the front-end pages</div>
          <div class="au-pages-row">
            ${box('b-app au-pg', 'home')}
            ${box('b-app au-pg', 'quiz')}
            ${box('b-app au-pg', 'vmcp')}
          </div>
        </div>

        ${arrow('a-user au-a-sql short', 'SQL')}
        ${box('b-vol au-db', 'platform-db', 'usernames + hashed codes')}

        <!-- Verify: the pages pull the public keys and check the signature locally. Dashed, because
             keys flow, not requests — jose caches them, so it is not a call per token. -->
        <div class="au-verify" aria-hidden="true"><span class="au-verify-l">③ verify · GET /.well-known/jwks.json</span></div>
      </div>

      <footer class="arch-foot">
        <div class="arch-key">
          <span class="arch-chip b-auth">identity</span>
          <span class="arch-chip b-app">front end</span>
          <span class="arch-chip b-vol">database</span>
          <span class="arch-chip au-chip-verify">public-key fetch</span>
        </div>
        <span class="arch-more" style="cursor:default">Tokens are verified by each service, not by a gateway.</span>
      </footer>
    </div>`;
}

export function architecturePanel(): string {
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-slider">
          <div class="arch-tabs" role="tablist" aria-label="Architecture diagrams">
            <button class="arch-tab is-active" type="button" role="tab" aria-selected="true" data-slide="0">Platform topology</button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="1">Auth &amp; the browser</button>
          </div>
          <div class="arch-viewport">
            <div class="arch-track">
              <section class="arch-slide" role="tabpanel" aria-label="Platform topology">${topologyDiagram()}</section>
              <section class="arch-slide" role="tabpanel" aria-label="Auth and the browser">${authDiagram()}</section>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** Wire the pull-down AND the diagram slider. Called by mount(), after the markup exists. */
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
    if (open) syncHeight(); // the panel just gained its real height; size the viewport to the live slide
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // else the document handler below closes it again in the same tick
    setOpen(!mast.classList.contains('arch-open'));
  });

  document.addEventListener('click', (e) => {
    if (mast.classList.contains('arch-open') && !mast.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mast.classList.contains('arch-open')) setOpen(false);
  });

  /* ── The slider ──────────────────────────────────────────────────────────────────────────────
     A transform track, not a scroll container: the two diagrams are different heights, and a
     transform lets the VIEWPORT own the height so it can animate to the active slide instead of
     leaving a lake of whitespace under the shorter one. */
  const tabs = [...mast.querySelectorAll<HTMLButtonElement>('.arch-tab')];
  const track = mast.querySelector<HTMLElement>('.arch-track');
  const viewport = mast.querySelector<HTMLElement>('.arch-viewport');
  const slides = [...mast.querySelectorAll<HTMLElement>('.arch-slide')];
  if (!track || !viewport || !slides.length) return;

  let active = 0;

  const syncHeight = (): void => {
    // Only meaningful once the panel is open and laid out; a closed panel reports height 0.
    if (!mast.classList.contains('arch-open')) return;
    viewport.style.height = `${slides[active].offsetHeight}px`;
  };

  const show = (i: number): void => {
    active = Math.max(0, Math.min(slides.length - 1, i));
    track.style.transform = `translateX(${-active * 100}%)`;
    syncHeight();
    tabs.forEach((t, j) => {
      t.classList.toggle('is-active', j === active);
      t.setAttribute('aria-selected', String(j === active));
    });
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));

  // Reflow changes a diagram's height (columns collapse on a phone), so re-measure the live slide.
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncHeight);
  });

  show(0);
}
