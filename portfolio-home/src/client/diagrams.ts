// The two drawn graphics. Assets, not logic — kept out of the render module so that adding a
// diagram is an edit to a data file rather than to the code that lays the page out.
import { esc } from './util.js';
import type { Project } from './data.js';

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
// so this is `kubectl -n platform get pods`, the interface you actually drive it through. Kept in
// sync by hand with the Deployments under k8s/base/.
export const POD_ROWS: { name: string; ready: string }[] = [
  { name: 'nginx', ready: '1/1' },
  { name: 'home', ready: '1/1' },
  { name: 'quiz', ready: '1/1' },
  { name: 'vmcp', ready: '1/1' },
  { name: 'vmcp-db', ready: '1/1' },
  { name: 'rs-mcp-server', ready: '1/1' },
  { name: 'platform-auth', ready: '1/1' },
  // Runs no server — it only makes outbound MCP calls through the gateway, on a timer.
  { name: 'fvt-traffic', ready: '1/1' },
];

// Drawn as an actual terminal window — chrome, traffic lights, dark body — rather than a table on
// the page background, so it reads as a screenshot of the live cluster at a glance.
export const K8S_DIAGRAM = `<div class="term" role="img" aria-label="A terminal showing kubectl -n platform get pods with eight running pods: nginx, home, quiz, vmcp, vmcp-db, rs-mcp-server, platform-auth and fvt-traffic.">
  <div class="term-bar">
    <span class="tl r"></span><span class="tl y"></span><span class="tl g"></span>
    <span class="term-title">platform — kubectl</span>
  </div>
  <div class="term-body">
    <div class="term-cmd"><span class="p">➜</span> <span class="d">~/platform-orchestration</span> <span class="c">kubectl -n platform get pods</span></div>
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

export const DIAGRAMS: Record<NonNullable<Project['diagram']>, string> = {
  vmcp: VMCP_DIAGRAM,
  k8s: K8S_DIAGRAM,
  platformui: PLATFORMUI_DIAGRAM,
};
