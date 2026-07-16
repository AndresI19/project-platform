import type { Project } from './data.js';
// The two drawn graphics. Assets, not logic — kept out of the render module so that adding a
// diagram is an edit to a data file rather than to the code that lays the page out.
import { esc } from './util.js';

// What open-vMCP is, drawn rather than described: one client reaching several MCP servers through
// a single gateway, stacked top-to-bottom. The edges are labelled with the transport, because
// "streams over HTTP/SSE" is the part of MCP a box-and-line drawing otherwise leaves out.
// Inline SVG, so it needs no network request and recolours with the theme.
export const VMCP_DIAGRAM = `<svg class="dgm" viewBox="0 0 300 176" role="img" aria-label="An agent streams to the vMCP reverse proxy over MCP on HTTP/SSE; the proxy fans out to two MCP servers over SSE.">
  <defs>
    <marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0 0.5 5 3 0 5.5Z" fill="currentColor"/>
    </marker>
  </defs>
  <g class="dgm-line" marker-end="url(#ah)">
    <path d="M150 20V42"/>
    <path d="M92 92V126"/>
    <path d="M208 92V126"/>
  </g>
  <g class="dgm-box">
    <rect class="hub" x="14" y="44" width="272" height="46" rx="10"/>
    <rect x="24" y="128" width="112" height="36" rx="8"/>
    <rect x="164" y="128" width="112" height="36" rx="8"/>
  </g>
  <g class="dgm-t">
    <text class="you" x="150" y="10">Agent</text>
    <text class="edge" x="214" y="31">MCP over HTTP/SSE</text>
    <text class="hub-t" x="150" y="62">vMCP</text>
    <text class="sub" x="150" y="77">reverse proxy · one endpoint</text>
    <text class="edge" x="66" y="109">SSE</text>
    <text class="edge" x="234" y="109">SSE</text>
    <text x="80" y="141">MCP server</text>
    <text class="sub" x="80" y="154">rs-mcp</text>
    <text x="220" y="141">MCP server</text>
    <text class="sub" x="220" y="154">…</text>
  </g>
</svg>`;

// The orchestration repo has no screenshot to show, so it shows its own output: the running stack
// as the cluster reports it. There is no docker-compose any more — the platform runs on minikube —
// so this is `kubectl -n platform get pods`, the interface you actually drive it through.
//
// This is a CURATED CORE SUBSET, not the full pod list, and deliberately so: this card equalises to
// the height of the tallest featured tile, and the full eight-pod listing made it the tallest, which
// stretched every other card to match. Four load-bearing pods — the router, the two front doors, and
// the identity service — say "a cluster is running here" without the height. Do not restore the
// dropped pods (quiz, vmcp-db, rs-mcp-server, fvt-traffic) to "match the deployments"; the omission
// is the feature. The `-l 'app in (…)'` selector names exactly these four — the pods carry only an
// `app` label, no `tier` — which is what keeps the short list honest (a real command, a real subset).
export const POD_ROWS: { name: string; ready: string }[] = [
  { name: 'nginx', ready: '1/1' },
  { name: 'home', ready: '1/1' },
  { name: 'vmcp', ready: '1/1' },
  { name: 'platform-auth', ready: '1/1' },
];

// Drawn as an actual terminal window — chrome, traffic lights, dark body — rather than a table on
// the page background, so it reads as a screenshot of the live cluster at a glance.
export const K8S_DIAGRAM = `<div class="term" role="img" aria-label="A terminal showing kubectl -n platform get pods for the four core services — nginx, home, vmcp and platform-auth — each running.">
  <div class="term-bar">
    <span class="tl r"></span><span class="tl y"></span><span class="tl g"></span>
    <span class="term-title">platform — kubectl</span>
  </div>
  <div class="term-body">
    <div class="term-cmd"><span class="p">➜</span> <span class="d">~/platform-orchestration</span> <span class="c">kubectl -n platform get pods -l 'app in (nginx,home,vmcp,platform-auth)'</span></div>
    <table class="ps">
      <thead><tr><th>NAME</th><th>READY</th><th>STATUS</th></tr></thead>
      <tbody>
        ${POD_ROWS.map(
          (r) => `<tr>
          <td class="n">${esc(r.name)}</td>
          <td class="rd">${esc(r.ready)}</td>
          <td class="up"><span class="dot"></span>Running</td>
        </tr>`,
        ).join('')}
      </tbody>
    </table>
    <div class="term-cmd last"><span class="p">➜</span> <span class="cur"></span></div>
  </div>
</div>`;

export const PLATFORMUI_DIAGRAM = `<svg class="dgm" viewBox="0 0 300 176" role="img" aria-label="The @platform/ui package, defined in portfolio-home, feeds shared design tokens down to both the home page and the quiz.">
    <defs>
      <marker id="ahp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0 0.5 5 3 0 5.5Z" fill="currentColor"/>
      </marker>
    </defs>
    <g class="dgm-line" marker-end="url(#ahp)">
      <path d="M92 92V126"/>
      <path d="M208 92V126"/>
    </g>
    <g class="dgm-box">
      <rect class="hub" x="14" y="44" width="272" height="46" rx="10"/>
      <rect x="24" y="128" width="112" height="36" rx="8"/>
      <rect x="164" y="128" width="112" height="36" rx="8"/>
    </g>
    <g class="dgm-t">
      <text class="you" x="150" y="26">this page</text>
      <text class="hub-t" x="150" y="62">@platform/ui</text>
      <text class="sub" x="150" y="77">tokens · base · serveClient</text>
      <text class="edge" x="66" y="109">imports</text>
      <text class="edge" x="234" y="109">imports</text>
      <text x="80" y="150">home</text>
      <text x="220" y="150">quiz</text>
    </g>
  </svg>`;

// The CI/CD pipeline — how a merge reaches the cluster, drawn shape-for-shape from
// cicd-design/design.html and recoloured to the arch palette (its --warn/--ok zones become
// --gold/--proj via .arch-cicd). Three worlds — GitHub’s, this machine’s, the cluster’s —
// and every arrow is opened from our side. A static asset: no interpolation, no logic.
export const CICD_DIAGRAM = `
    <div class="arch-diagram arch-cicd">
      <svg viewBox="0 0 1280 560" width="100%" role="img" aria-label="A pull request makes a CI job; a merge starts version-tag and release on the same event — version-tag cuts the git tag, release reads it and posts a repository_dispatch. Every job lands in one queue, dispatched by label: ubuntu-latest jobs run on a fresh GitHub-hosted VM, self-hosted jobs are taken by our runner, which polls the queue, builds and pushes to the local registry, checks out the Helm chart and runs helm upgrade to roll the release forward, and the kubelet pulls the new image. On failure Helm rolls the release back and it alerts Discord, outbound.">
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
        <text class="t m" x="644" y="414">3 · helm upgrade platform --reuse-values</text>
        <text class="t s" x="644" y="434">on failure → helm rollback, and Discord</text>

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
        <text class="t m" x="964" y="149">pull registry:5000/quiz:0.1.22</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M950 148 H 912"/>
        <text class="t s" x="916" y="102">(4) pull</text>

        <path class="ln" style="stroke-dasharray:4 3; marker-end:url(#cicdA)" d="M1105 300 V 192"/>
        <text class="t s" x="1113" y="240">schedules a Pod for an image</text>
        <text class="t s" x="1113" y="254">the node has yet to pull</text>

        <rect class="box here" x="950" y="300" width="310" height="155" rx="8"/>
        <text class="t big" x="964" y="326">apiserver · platform namespace</text>
        <text class="t s" x="964" y="348">the release's new image → a new ReplicaSet →</text>
        <text class="t m" x="964" y="368">helm --wait, else roll the release back</text>
        <text class="t s" x="964" y="388">reached at its NATIVE address — the one</text>
        <text class="t s" x="964" y="402">the host cannot route to, but the runner can</text>

        <path class="ln hot" style="marker-end:url(#cicdA)" d="M906 352 H 946"/>
        <text class="t s" x="912" y="344">(3)</text>
      </svg>
    </div>`;

export const DIAGRAMS: Record<NonNullable<Project['diagram']>, string> = {
  vmcp: VMCP_DIAGRAM,
  k8s: K8S_DIAGRAM,
  platformui: PLATFORMUI_DIAGRAM,
};
