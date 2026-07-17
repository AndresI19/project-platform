// The platform architecture, revealed by a pull-down in the masthead banner. FOUR diagrams, paged by a
// slider. On a phone the first three are DIFFERENT pictures, not these reflowed (see mobile-diagrams.ts):
// a wide grid scaled to a phone is a shape you zoom into, not one you read, so a phone gets transit maps.
// The cost is two hand-maintained pictures of one platform.
//
//   1. Platform topology — who talks to whom, browser down to the outbound APIs; the evidence for the
//      bio's closing claim.
//   2. CICD — how a merge reaches the cluster, commit through blocking gates to a rollout. A sequence.
//   3. Auth & the browser — how the identity service issues a token, how the front ends carry it, and
//      how each verifies it. A sequence, split out so it doesn't crowd the map.
//   4. Security — a service × scan matrix: every workload and the blocking CI gates it passes per PR.
//
// WHY HTML AND NOT SVG (or ASCII): both scale only UNIFORMLY — on a phone the whole picture shrinks past
// legibility. Boxes in a grid REFLOW: columns collapse, boxes go full width, labels stay readable. THE
// GRID IS THE DIAGRAM: the sealed-secrets rail is column 1, twelve content columns carry four services
// at three each, so every connector is a column SPAN not a pixel offset — exact across reflow. Mirrors
// the "whole picture" section of the orchestration wiki, the source of truth.

import { CICD_DIAGRAM } from './diagrams.js';
import { mobileAuth, mobileCicd, mobileTopology } from './mobile-diagrams.js';

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
  const inner = `${icon}<span class="arch-name">${name}</span>${meta ? `<span class="arch-meta">${meta}</span>` : ''}`;
  return href
    ? `<a class="arch-box ${cls} arch-link" href="${href}">${inner}</a>`
    : `<div class="arch-box ${cls}">${inner}</div>`;
};

/** A downward arrow. `cls` places it (row + column); the label sits BESIDE the shaft, not over it. */
const arrow = (cls: string, label = ''): string =>
  `<div class="arch-arrow ${cls}" aria-hidden="true">${label ? `<span class="arch-arrow-l">${label}</span>` : ''}</div>`;

/** A horizontal arrow for diagram 2. `cls` carries the direction ('fwd' → or 'back' ←) and a tint
 *  ('rose' for a token, 'key' for a public-key fetch). */
const harrow = (cls: string, label: string): string =>
  `<div class="auth-h ${cls}" aria-hidden="true"><span class="auth-h-l">${label}</span></div>`;

/** A short vertical connector inside diagram 2's provider column (platform-auth → platform-db). */
const vconn = (label: string): string =>
  `<div class="auth-v" aria-hidden="true"><span class="auth-v-l">${label}</span></div>`;

/* ── Diagram 1 — the topology ──────────────────────────────────────────────────────────────────── */
function topologyDiagram(): string {
  // Row map (keep in step with styles.css):
  //   1 callers   3 Cloudflare   7 cloudflared   9 nginx   11 services   13 volumes   14 rs-mcp
  //   2 arrows    4 pierce↓      8 arrow↓        10 fan-out 12 connectors            16 arrow↓ 17 APIs
  //
  // Four services, THREE content columns each: home 2-4, quiz 5-7, vmcp 8-10, platform-auth 11-13
  // (grid lines s1 2/5 · s2 5/8 · s3 8/11 · s4 11/14). vmcp keeps its stack (database in the middle
  // column, MCP-over-SSE down the right lane to rs-mcp). fvt-traffic left the cluster — it drives the
  // public API like any MCP consumer, so it's named in the caller box, not drawn; that freed its row,
  // and rs-mcp sits directly under the volumes. The TOKEN story lives in diagram 2, so this stays a map.
  return `
    <div class="arch-diagram">
      <div class="arch-grid">

        <!-- ── Callers, both above the front door ────────────────────────────────────────── -->
        ${box('b-you r1', 'You', 'a browser', '', PERSON)}
        ${box('b-agent r1', 'Agent / MCP consumer', 'Claude Desktop, an SDK or <strong>FVT-traffic</strong>', '', ROBOT)}

        ${arrow('a-user w r2', 'TLS')}
        ${arrow('a-agent right r2', 'MCP')}

        <div class="arch-frame arch-hw" aria-hidden="true"></div>
        <div class="arch-frame arch-k8s" aria-hidden="true"></div>
        <span class="arch-tag arch-tag-hw r5">one Fedora workstation · Colima QEMU VM</span>
        <span class="arch-tag arch-tag-k8s r6">minikube cluster · namespace: platform</span>

        <!-- Not "the vault": a vault is a service you FETCH from at runtime; nothing here does. The
             credential is encrypted with the controller's public key, committed to a public repo as
             ciphertext, and unsealed ONCE at apply time into an ordinary k8s Secret, which the pods
             read. The claim isn't "the secrets are safe", it's that they're safe IN THE OPEN. -->
        <div class="arch-box vault">
          <span class="vault-t">sealed-secrets</span>
          <span class="vault-m">asymmetric-key sealed</span>
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
        ${box('b-vol b-db s3 r13 db', 'vmcp-db', 'Postgres')}
        ${box('b-vol b-db s4 r13 authdb', 'platform-db', 'Postgres')}

        <!-- Down the right edge of the gateway's column, PAST the database. rs-mcp-server sits directly
             below the databases now — fvt-traffic used to occupy this band but left the cluster. -->
        <div class="vm-rail" aria-hidden="true"><span class="vm-rail-l">MCP over SSE</span></div>

        ${box('b-infra s3 r14', 'rs-mcp-server', '17 RuneScape tools')}

        <!-- The outbound call is rs-mcp-server's: the arrow starts at its box and leaves the cluster,
             rather than appearing from the frame's edge. OUTSIDE the machine: other people's servers. -->
        ${arrow('a-user s3 r15 outbound', 'outbound HTTPS')}
        <div class="arch-box b-ext arch-ext-box s3 r16">
          <span class="arch-name">Public APIs</span>
          <table class="arch-tbl">
            ${OUTBOUND.map(([n, w]) => `<tr><th>${n}</th><td>${w}</td></tr>`).join('')}
          </table>
        </div>

      </div>

      <footer class="arch-foot arch-foot-slim">
        <a class="arch-more" href="${WIKI}" target="_blank" rel="noopener">Full write-up in the wiki →</a>
      </footer>
    </div>`;
}

/* ── Diagram 2 — CICD ──────────────────────────────────────────────────────────────────────────── */
// Desktop uses the inline SVG (CICD_DIAGRAM); the phone gets mobileCicd(). Briefly rebuilt as one HTML
// picture for both widths, but a separate mobile diagram already exists, so the SVG is back.

/* ── Diagram 3 — auth & the browser ────────────────────────────────────────────────────────────── */
// TWO stacked pictures, because a front end touches platform-auth for two different reasons. TOP is the
// MISS path: the browser's gate, finding no local identity, asks platform-auth for a token — client-side,
// the only thing that calls /auth. BOTTOM is the VALIDATION path: a front-end pod's middleware checks a
// handed token against the public keys — server-side, per request, no database. Consuming services on the
// LEFT of both, the identity service on the RIGHT.
function authDiagram(): string {
  return `
    <div class="arch-diagram arch-auth">

      <!-- ① THE MISS PATH — client-side, the browser has no identity yet -->
      <section class="auth-panel">
        <div class="auth-panel-h">
          <span class="auth-badge miss">auth miss</span>
          <h4>Getting a token — the client side</h4>
        </div>
        <div class="auth-flow">
          <div class="auth-col consumer">
            ${box('b-app au-cbox', 'home · quiz · vmcp', 'the gate / account menu — in the browser')}
            <span class="auth-tag">no <code>platform:identity</code> in localStorage → the gate opens</span>
          </div>
          <div class="auth-conn">
            ${harrow('fwd', 'POST /auth/token')}
            ${harrow('back rose', 'signed token → localStorage')}
          </div>
          <div class="auth-col provider">
            ${box('b-auth au-cbox', 'platform-auth', 'mints &amp; signs an RS256 token')}
            ${vconn('verifies the password')}
            ${box('b-vol b-db au-cbox', 'platform-db', 'Postgres — usernames + hashed passwords')}
          </div>
        </div>
        <p class="auth-expl">
          The <strong>gate</strong> reads the browser's local storage. On a <strong>miss</strong> —
          first visit or after sign-out — it calls platform-auth, which checks your password against
          platform-db and returns a signed token; that token is all it keeps. “Continue as guest” writes
          a local marker and calls nothing. All three front ends share one storage key, so one sign-in
          fills it for the rest.
        </p>
      </section>

      <div class="auth-divider" aria-hidden="true"><span>then, on every request that carries the token…</span></div>

      <!-- ② THE VALIDATION PATH — server-side, a token is presented and checked -->
      <section class="auth-panel">
        <div class="auth-panel-h">
          <span class="auth-badge met">validation</span>
          <h4>Checking a token — the server side</h4>
        </div>
        <div class="auth-flow">
          <div class="auth-col consumer">
            ${box('b-app au-cbox', 'quiz · vmcp', 'the pod — its verify middleware')}
            <span class="auth-tag met">valid → the request proceeds, as that user / admin</span>
            <span class="auth-tag miss">invalid or absent → anonymous (refused, or read-only on vMCP)</span>
          </div>
          <div class="auth-conn">
            ${harrow('fwd key', 'GET /.well-known/jwks.json')}
            ${harrow('back key', 'public keys — fetched once, cached')}
          </div>
          <div class="auth-col provider">
            ${box('b-auth au-cbox', 'platform-auth', 'serves the public keys')}
          </div>
        </div>
        <p class="auth-expl">
          The browser sends the token as an <code>Authorization: Bearer</code> header. Each pod's own
          <strong>middleware</strong> verifies the signature against platform-auth's public keys —
          fetched once and cached, so there is no per-request call to auth. A good signature is
          <strong>validation met</strong> and the request runs as that user; anything else (expired,
          forged, missing) falls to anonymous. Every service checks for itself; home has no gated
          routes, so it never reaches this row.
        </p>
      </section>
    </div>`;
}

/* ── Diagram 3 — the security posture ──────────────────────────────────────────────────────────── */
// Every service against the automated scans that gate its CI. Rows are repos (the two in the platform
// monorepo share one); columns are scan classes. A tick is a BLOCKING check on every PR — a regression
// fails before it reaches the cluster. Mirrors the orchestration wiki's security section.
const SEC_COLS = ['Image', 'Deps', 'SAST', 'Secrets', 'Config', 'Manifests'] as const;
type SecCol = (typeof SEC_COLS)[number];

interface SecRow {
  repo: string;
  has: SecCol[];
}
// One row per repo — a repo is what a CI pipeline gates. The two services in the platform monorepo
// (home + platform-auth) share its pipeline, so they share a row.
const SEC_ROWS: SecRow[] = [
  { repo: 'project-platform', has: ['Image', 'Deps', 'SAST', 'Secrets'] },
  { repo: 'data-driven-quiz-server', has: ['Image', 'Deps', 'SAST', 'Secrets'] },
  { repo: 'open-vMCP', has: ['Image', 'Deps', 'SAST', 'Secrets'] },
  { repo: 'rs-mcp-server', has: ['Image', 'Deps', 'SAST', 'Secrets'] },
  { repo: 'platform-orchestration', has: ['Secrets', 'Config', 'Manifests'] },
];
/** What each column actually runs — the tool, and the class of problem it catches. */
const SEC_LEGEND: [SecCol, string][] = [
  ['Image', 'Trivy — container-image CVEs'],
  ['Deps', 'Trivy fs — dependency CVEs (SCA)'],
  ['SAST', 'CodeQL — static analysis of our own code'],
  ['Secrets', 'gitleaks — secrets across git history'],
  ['Config', 'Trivy config — Kubernetes misconfig'],
  ['Manifests', 'kubeconform — manifest schema validation'],
];

function securityDiagram(): string {
  const head = SEC_COLS.map((c) => `<th class="sec-c">${c}</th>`).join('');
  const rows = SEC_ROWS.map((r) => {
    const cells = SEC_COLS.map((c) =>
      r.has.includes(c)
        ? `<td class="sec-y"><span aria-label="${c}: yes">✓</span></td>`
        : `<td class="sec-n"><span aria-label="${c}: not applicable">N/A</span></td>`,
    ).join('');
    return `<tr><th class="sec-repo-name">${r.repo}</th>${cells}</tr>`;
  }).join('');
  const legend = SEC_LEGEND.map(([c, d]) => `<tr><th>${c}</th><td>${d}</td></tr>`).join('');
  return `
    <div class="arch-diagram arch-sec">
      <p class="sec-intro">
        Every service repo ships through the same gates. A <strong>✓</strong> is a <strong>blocking</strong>
        check on every pull request — plus branch protection on all of them, so nothing merges unscanned.
        (<code>platform-cicd</code> is the deploy pipeline itself — no service, so these scans don't apply.)
      </p>
      <div class="sec-wrap">
        <table class="sec-tbl">
          <thead><tr><th class="sec-repo-name">Repo</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="sec-tables">
        <div class="sec-col">
          <div class="sec-rt-h">Scans — the tool behind each ✓</div>
          <table class="arch-tbl sec-what">${legend}</table>
        </div>
        <div class="sec-col">
          <div class="sec-rt-h">Runtime — what a pen test meets</div>
          <table class="arch-tbl sec-rt">
            <tr><th>No public origin</th><td>ClusterIP behind an outbound tunnel — no origin IP, no open port.</td></tr>
            <tr><th>Edge DDoS + WAF</th><td>Cloudflare eats floods and screens L7 before nginx.</td></tr>
            <tr><th>Rate limiting</th><td>per-IP caps on writes; auth <code>/token</code> hard-limited vs credential-stuffing.</td></tr>
            <tr><th>Signed identity</th><td>RS256 JWTs via JWKS; admin needs a signed admin claim.</td></tr>
            <tr><th>Least privilege</th><td>deploy SA patches Deployments, <strong>can't read Secrets</strong>.</td></tr>
          </table>
        </div>
      </div>
      <footer class="arch-foot">
        <div class="arch-key">
          <span class="arch-chip sec-chip-y">✓ blocking scan</span>
          <span class="arch-chip sec-chip-n">N/A not applicable</span>
        </div>
        <a class="arch-more" href="${WIKI}" target="_blank" rel="noopener">Security write-up in the wiki →</a>
      </footer>
    </div>`;
}

export function architecturePanel(): string {
  return `
    <div class="arch-panel" id="arch-panel">
      <div class="arch-panel-in">
        <div class="arch-slider">
          <div class="arch-tabs" role="tablist" aria-label="Architecture diagrams">
            <!-- TWO LABELS PER TAB, only one rendered. Four full labels don't fit 390px, so the bar
                 became a scroller with the 4th tab off-screen; a phone gets the short name. display:none
                 (not visibility) keeps the hidden one out of the a11y tree, so a screen reader hears one
                 name; the aria-label carries the full one at every width. -->
            <button class="arch-tab is-active" type="button" role="tab" aria-selected="true" data-slide="0" aria-label="Platform Topology"><span class="tab-full">Platform Topology</span><span class="tab-brief">Topology</span></button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="1" aria-label="CICD"><span class="tab-full">CICD</span><span class="tab-brief">CICD</span></button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="2" aria-label="Authentication"><span class="tab-full">Authentication</span><span class="tab-brief">Auth</span></button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="3" aria-label="Security"><span class="tab-full">Security</span><span class="tab-brief">Security</span></button>
          </div>
          <div class="arch-viewport">
            <div class="arch-track">
              <section class="arch-slide" role="tabpanel" aria-label="Platform Topology">
                <div class="arch-desktop">${topologyDiagram()}</div>
                <div class="arch-mobile">${mobileTopology()}</div>
              </section>
              <section class="arch-slide" role="tabpanel" aria-label="CICD">
                <div class="arch-desktop">${CICD_DIAGRAM}</div>
                <div class="arch-mobile">${mobileCicd()}</div>
              </section>
              <section class="arch-slide" role="tabpanel" aria-label="Authentication">
                <div class="arch-desktop">${authDiagram()}</div>
                <div class="arch-mobile">${mobileAuth()}</div>
              </section>
              <section class="arch-slide" role="tabpanel" aria-label="Security posture">${securityDiagram()}</section>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
