// The platform architecture, revealed by a pull-down in the masthead banner. THREE diagrams now, paged
// by a slider:
//
//   1. Platform topology — who talks to whom, from the browser down to the outbound APIs. This is the
//      evidence for the bio's closing claim: everything below is built, hosted and running right here.
//   2. Auth & the browser — the narrower story of how the identity service issues a token, how the
//      front ends carry it, and how each verifies it on its own. Split out because it is a different
//      question (a sequence, not a topology) and crowding it into the map made both harder to read.
//   3. Security — a service × scan matrix: every workload and the blocking CI gates (image, deps,
//      SAST, secrets, config, manifests) it passes on every PR. A table, not a topology, for the same
//      reason as diagram 2 — a different question deserves its own shape.
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

/* ── Diagram (CICD) — how a merge reaches the cluster ──────────────────────────────────────────────
   The design lives in cicd-design/design.html; this is that same picture, translated shape-for-shape
   and recoloured to the palette above (its --warn/--ok zones become --gold/--proj via .arch-cicd).
   Three worlds — GitHub's, this machine's, the cluster's — and every arrow is opened from our side.
   No prose outside the boxes on purpose; the picture carries it. */
function cicdDiagram(): string {
  return `
    <div class="arch-diagram arch-cicd">
      <svg viewBox="0 0 1280 560" width="100%" role="img" aria-label="A pull request makes a CI job; a merge starts version-tag and release on the same event — version-tag cuts the git tag, release reads it and posts a repository_dispatch. Every job lands in one queue, dispatched by label: ubuntu-latest jobs run on a fresh GitHub-hosted VM, self-hosted jobs are taken by our runner, which polls the queue, pushes to the local registry, tells the apiserver to change the image, and the kubelet pulls. On failure it alerts Discord, outbound.">
        <defs>
          <marker id="cicdA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" style="color:var(--muted)"/>
          </marker>
        </defs>

        <!-- GitHub-hosted -->
        <rect class="zone z-gh" x="6" y="8" width="594" height="544" rx="12"/>
        <rect class="ztag-gh" x="16" y="12" width="238" height="22" rx="11"/>
        <text class="ztt" x="28" y="27">GitHub-hosted · GitHub's infrastructure</text>

        <rect class="box" x="20" y="36" width="160" height="32" rx="7"/>
        <text class="t" x="34" y="56">Service repo 1</text>
        <rect class="box" x="58" y="66" width="160" height="32" rx="7"/>
        <text class="t" x="72" y="86">Service repo 2</text>
        <rect class="box" x="96" y="96" width="160" height="32" rx="7"/>
        <text class="t" x="110" y="116">Service repo 3</text>

        <path class="ln" style="marker-end:url(#cicdA)" d="M110 128 V 148"/>
        <path class="ln" style="marker-end:url(#cicdA)" d="M256 112 H 330 V 146"/>

        <rect class="box" x="20" y="150" width="230" height="44" rx="8"/>
        <text class="t" x="34" y="176">PR</text>

        <path class="ln" style="marker-end:url(#cicdA)" d="M70 194 V 212"/>

        <rect class="box" x="20" y="212" width="230" height="76" rx="8"/>
        <text class="t" x="34" y="230">CI job</text>
        <text class="t m" x="34" y="247">ci.yml</text>
        <text class="t m" x="34" y="262">codeql.yml</text>
        <text class="t m" x="34" y="277">secret-scan.yml</text>

        <rect class="box" x="290" y="150" width="270" height="44" rx="8"/>
        <text class="t" x="304" y="176">Merge</text>

        <path class="ln" style="marker-end:url(#cicdA)" d="M425 194 V 212"/>

        <rect class="box" x="290" y="212" width="270" height="76" rx="8"/>
        <text class="t" x="304" y="232">Version tag and release</text>
        <text class="t m" x="304" y="256">version-tag.yml</text>
        <text class="t m" x="304" y="273">release.yml</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M425 288 V 330"/>
        <path class="ln" style="marker-end:url(#cicdA)" d="M70 288 V 330"/>

        <rect class="box here" x="20" y="330" width="540" height="106" rx="8"/>
        <text class="t big" x="34" y="362">The job queue · every repo's jobs land here</text>
        <text class="t s" x="34" y="388">dispatched BY LABEL: a job reaches only a runner whose labels match.</text>
        <text class="t s" x="34" y="412">The runner is registered solely to platform-cicd, isolated from the application repositories.</text>

        <path class="ln" style="marker-end:url(#cicdA)" d="M303 436 V 475"/>

        <rect class="box vm" x="170" y="475" width="266" height="50" rx="8"/>
        <text class="t" x="184" y="497">GitHub-hosted VM · fresh per job</text>
        <text class="t s" x="184" y="514">provisioned for ONE job, then DESTROYED.</text>

        <!-- Outside K8s -->
        <rect class="zone z-out" x="616" y="8" width="304" height="544" rx="12"/>
        <rect class="ztag-out" x="626" y="12" width="278" height="22" rx="11"/>
        <text class="ztt" x="638" y="27">Outside K8s · this machine, not in the cluster</text>

        <rect class="box here" x="630" y="110" width="276" height="76" rx="8"/>
        <text class="t" x="644" y="130">registry:5000 · TLS, our own CA</text>
        <text class="t s" x="644" y="147">pinned .10 · keeps the latest 2</text>
        <text class="t s" x="644" y="164">the kubelet trusts our CA</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M768 300 V 192"/>
        <text class="t s" x="776" y="250">(2) push</text>

        <rect class="box here" x="630" y="300" width="276" height="155" rx="8"/>
        <text class="t big" x="644" y="326">Self-hosted runner · ephemeral</text>
        <text class="t s" x="644" y="346">ONE job at a time — that IS the serialization</text>
        <text class="t s" x="644" y="360">one job, de-register, restart</text>
        <text class="t m" x="644" y="380">1 · docker build --build-arg VERSION</text>
        <text class="t m" x="644" y="397">2 · docker push registry:5000/quiz:…</text>
        <text class="t m" x="644" y="414">3 · kubectl set image deploy/quiz …</text>
        <text class="t s" x="644" y="434">on failure → rollout undo, and Discord</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M630 385 H 566"/>
        <text class="t s" x="570" y="378">(1) polls</text>

        <!-- an outbound alert to Discord on failure — it LEAVES the box: starts inside, crosses out -->
        <path class="ln" style="marker-end:url(#cicdA)" d="M855 440 V 545"/>
        <text class="t s" x="700" y="500">outbound → Discord ↗</text>

        <!-- Inside K8s -->
        <rect class="zone z-k8s" x="936" y="8" width="338" height="544" rx="12"/>
        <rect class="ztag-k8s" x="946" y="12" width="156" height="22" rx="11"/>
        <text class="ztt" x="958" y="27">Inside K8s · the cluster</text>

        <rect class="box here" x="950" y="110" width="310" height="76" rx="8"/>
        <text class="t" x="964" y="130">kubelet · the minikube node</text>
        <text class="t m" x="964" y="149">pull registry:5000/quiz:0.1.12</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M950 148 H 912"/>
        <text class="t s" x="916" y="102">(4) pull</text>

        <path class="ln" style="stroke-dasharray:4 3; marker-end:url(#cicdA)" d="M1105 300 V 192"/>
        <text class="t s" x="1113" y="240">schedules a Pod for an image</text>
        <text class="t s" x="1113" y="254">the node has yet to pull</text>

        <rect class="box here" x="950" y="300" width="310" height="155" rx="8"/>
        <text class="t big" x="964" y="326">apiserver · platform namespace</text>
        <text class="t s" x="964" y="348">the new image spec → a new ReplicaSet →</text>
        <text class="t m" x="964" y="368">rollout status || rollout undo</text>
        <text class="t s" x="964" y="388">reached at its NATIVE address — the one</text>
        <text class="t s" x="964" y="402">the host cannot route to, but the runner can</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M906 352 H 946"/>
        <text class="t s" x="912" y="344">(3)</text>
      </svg>
    </div>`;
}

/* ── Diagram 2 — auth & the browser ────────────────────────────────────────────────────────────── */
// TWO stacked pictures, because a front end touches platform-auth for two different reasons and the
// old single grid blurred them. TOP is the MISS path: the browser's gate, finding no local identity,
// asks platform-auth for a token — this is client-side, and it is the only thing that ever calls
// /auth. BOTTOM is the VALIDATION path: a front-end POD's middleware checks a token it was handed,
// against the public keys — server-side, once per request, no database. Consuming services sit on the
// LEFT of both, the identity service on the RIGHT: who GETS a token above, who CHECKS one below.
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
            ${box('b-vol au-cbox', 'platform-db', 'usernames + hashed passwords')}
          </div>
        </div>
        <p class="auth-expl">
          The <strong>gate</strong> (vMCP uses a slimmer account menu) reads the browser's local storage.
          On a <strong>miss</strong> — a first visit, or after signing out — it calls platform-auth,
          which verifies your username and password against platform-db and returns a signed token. That
          token is the only thing kept. “Continue as guest” never reaches this row: it writes a local guest
          marker and calls nothing. Because all three front ends share the one storage key, exactly one
          sign-in fills it — the others then find it already set and never open the gate.
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
          fetched once and cached, so there is no per-request call to auth and no database read. A good
          signature is <strong>validation met</strong>, and the request runs as that user; anything else
          (expired, forged, missing) falls to anonymous. No central gateway does this — every service
          checks for itself. home has no gated routes, so it never reaches this row at all.
        </p>
      </section>

      <footer class="arch-foot">
        <div class="arch-key">
          <span class="arch-chip b-app">consuming service</span>
          <span class="arch-chip b-auth">identity</span>
          <span class="arch-chip b-vol">database</span>
          <span class="arch-chip au-chip-verify">public-key fetch</span>
        </div>
        <span class="arch-more" style="cursor:default">Issued by one service · checked by every service.</span>
      </footer>
    </div>`;
}

/* ── Diagram 3 — the security posture ──────────────────────────────────────────────────────────── */
// Every service on the platform, against the automated scans that gate its CI. Rows are services (one
// per repo, except the two that share the platform monorepo); columns are scan classes. A tick is a
// BLOCKING check on every pull request — a regression fails the PR before it can reach the cluster. It
// mirrors the security section of the orchestration wiki, the source of truth.
const SEC_COLS = ['Image', 'Deps', 'SAST', 'Secrets', 'Config', 'Manifests'] as const;
type SecCol = (typeof SEC_COLS)[number];

interface SecRow {
  repo: string;
  has: SecCol[];
}
// One row per repo — the granularity that matters, since a repo is what a CI pipeline gates. The two
// services in the platform monorepo (home + platform-auth) share its pipeline, so they share a row.
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
        Every repo ships through the same gates. A <strong>✓</strong> is a <strong>blocking</strong>
        check on every pull request — plus branch protection on all of them, so nothing merges unscanned.
      </p>
      <div class="sec-wrap">
        <table class="sec-tbl">
          <thead><tr><th class="sec-repo-name">Repo</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <table class="arch-tbl sec-what">${legend}</table>
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
            <button class="arch-tab is-active" type="button" role="tab" aria-selected="true" data-slide="0">Platform Topography</button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="1">CICD</button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="2">Auth and Entrypoint</button>
            <button class="arch-tab" type="button" role="tab" aria-selected="false" data-slide="3">Security</button>
          </div>
          <div class="arch-viewport">
            <div class="arch-track">
              <section class="arch-slide" role="tabpanel" aria-label="Platform Topography">${topologyDiagram()}</section>
              <section class="arch-slide" role="tabpanel" aria-label="CICD">${cicdDiagram()}</section>
              <section class="arch-slide" role="tabpanel" aria-label="Auth and Entrypoint">${authDiagram()}</section>
              <section class="arch-slide" role="tabpanel" aria-label="Security posture">${securityDiagram()}</section>
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
