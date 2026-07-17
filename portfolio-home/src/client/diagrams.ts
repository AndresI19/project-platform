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

export const DIAGRAMS: Record<NonNullable<Project['diagram']>, string> = {
  vmcp: VMCP_DIAGRAM,
  k8s: K8S_DIAGRAM,
};
