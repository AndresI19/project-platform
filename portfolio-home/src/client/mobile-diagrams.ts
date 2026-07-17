// The mobile forms of the first three architecture diagrams.
//
// WHY THESE EXIST AT ALL. The desktop diagrams are pinned to a wide grid and stay exactly as they
// are — see architecture.ts. Scaling one to fit a phone produces a shape you zoom into rather than a
// picture you read, so a phone gets a picture drawn for it: a transit map. That is not a costume.
// architecture.ts:20-23 already argues the platform diagram in transit terms — "every connector is a
// column SPAN rather than a measured pixel offset" is Beck's principle, topological over geographic —
// so the map was a transit map before anyone drew rails on it.
//
// WHAT MAPS TO WHAT. Services are stations; routes are lines; nginx is an interchange; the VM and the
// cluster are fare zones; volumes are depot sidings (dashed and terminating, because a store is not a
// journey); sealed-secrets is the third rail, which touches everything and carries nobody.
//
// THE DEBT, STATED PLAINLY. This is a SECOND hand-maintained picture of the same platform. That is
// precisely what rotted the old '@media (max-width: 900px)' block — 17 grid rows against the
// desktop's 26 — where adding a service meant editing both or silently colliding two boxes. The two
// forms want one shared description of what connects to what, rendered twice. Until that exists,
// A CHANGE TO A DESKTOP DIAGRAM IS NOT DONE UNTIL THE MOBILE ONE MATCHES. The vmcp interchange below
// is the proof: the desktop draws only the agent arrow into vmcp (architecture.ts, the r10 fan) while
// the box beneath advertises /vmcp/ as a link — nginx routes BOTH '/vmcp/' (a browser) and '/mcp' (an
// agent) to it. The mobile map is drawn correctly and the desktop is not, which is the drift starting.
//
// Every class and custom property here is prefixed per diagram (mt-/mc-/ma-) and every rule is scoped
// under .arch-mobile. The three maps reuse names like "trunk" and "stn" for different strokes, so one
// shared vocabulary would have them fighting.

/** The platform topology as a vertical line diagram — the strip above a train door. */
export function mobileTopology(): string {
  return `
    <div class="arch-mobile-d mt">
      <p class="mdg-intro">
        Two routes share one trunk from the internet to an <b>nginx</b> interchange, which fans out to
        four services that are <b>peers</b>. <b>vmcp</b> is where both lines stop: nginx routes
        <code>/vmcp/</code> to its dashboard for a browser and <code>/mcp</code> to its gateway for an
        agent. Only the agent's line carries on, to rs-mcp-server.
      </p>
<svg viewBox="0 0 366 620" role="img" aria-label="The platform as a transit line diagram. A browser route and an agent route share a trunk from the internet, through Cloudflare and an outbound tunnel, into an nginx interchange. nginx fans out to four peer services on one rank: home, quiz, platform-auth and vmcp. The browser route serves all four and terminates. The agent route serves vmcp alone, so vmcp is an interchange where both lines stop, and the agent route continues past it to rs-mcp-server and on to the public APIs. Three volumes hang below the rank as sidings, and a sealed-secrets third rail feeds every station without carrying traffic.">
    <!-- ZONES: full-width bands with an inset label. No hand-sized pill — I clipped one twice; the
         band's own geometry is the container now, so there is no number to get wrong. -->
    <!-- The zone labels start RIGHT OF THE TRUNK. They began at the band's left edge and the trunk
         descends at x=96–108, so both headers were read through by two 6px lines — "FEDORA WORKST||ON".
         Present since draft 2 and invisible to me until this render. The bands end above the terminus
         now, so the arrow to the public APIs genuinely LEAVES the cluster instead of stopping on its
         border: the whole claim of the tunnel story is that the boundary is real. -->
    <rect x="12" y="180" width="342" height="400" rx="10" fill="var(--mt-metal)" stroke="var(--mt-metal-e)"/>
    <rect x="12" y="180" width="342" height="16" rx="10" fill="var(--mt-metal-h)"/>
    <rect x="12" y="188" width="342" height="8" fill="var(--mt-metal-h)"/>
    <text class="mt-ztag" x="118" y="192">Fedora workstation · Colima QEMU VM</text>

    <rect x="22" y="206" width="322" height="370" rx="8" fill="var(--mt-cluster)" stroke="var(--mt-cluster-e)"/>
    <rect x="22" y="206" width="322" height="16" rx="8" fill="var(--mt-cluster-h)"/>
    <rect x="22" y="214" width="322" height="8" fill="var(--mt-cluster-h)"/>
    <text class="mt-ztag" x="118" y="218">minikube · namespace: platform</text>

    <!-- THE TRUNK -->
    <path class="mt-trunk mt-t-browser" d="M96 44 V 290"/>
    <path class="mt-trunk mt-t-agent"   d="M105 44 V 290"/>

    <!-- THE FAN. Four peers, ONE rank — the desktop's row 11.
         The red line reaches vmcp too, and that is the correction this draft exists for. nginx routes
         '/vmcp/' to vmcp's dashboard (a browser) and '/mcp' to its gateway (an agent) — two locations,
         one service, so BOTH lines stop there. Draft 5 drew it agent-only and so does the desktop
         (architecture.ts:115 emits a-agent alone, under a box that advertises /vmcp/ as a link).
         Red runs its distributor ABOVE blue's, at y=340, starting right of the blue trunk at x=96 —
         so it reaches x=312 crossing nothing. Every leg is now orthogonal: down, across, down. Draft
         5's legs dived to y=476 and came BACK UP to the rank, which is what crossed it. -->
    <path class="mt-trunk mt-t-agent"   d="M105 322 V 340 H 299 V 410"/>
    <path class="mt-trunk mt-t-browser" d="M96 322 V 352 H 42 V 416"/>
    <path class="mt-trunk mt-t-browser" d="M96 352 H 126 V 416"/>
    <path class="mt-trunk mt-t-browser" d="M96 352 H 210 V 416"/>
    <path class="mt-trunk mt-t-browser" d="M96 352 H 289 V 410"/>

    <!-- THIRD RAIL. The taps ran at y=440 — straight through the label band — because I placed them
         beside a render instead of against the rank's own y. The rank is at 416, so the feeder sits
         above it at 396 and stubs down to each station. -->
    <path class="mt-railline" d="M30 232 V 566"/>
    <path class="mt-tap" d="M34 396 H 294"/>
    <path class="mt-tap" d="M42 396 V 409"/>
    <path class="mt-tap" d="M126 396 V 409"/>
    <path class="mt-tap" d="M210 396 V 409"/>
    <path class="mt-tap" d="M294 396 V 404"/>
    <path class="mt-tap" d="M34 564 H 327"/>

    <!-- TRUNK STATIONS -->
    <circle class="mt-stn" cx="96" cy="40" r="7" stroke="var(--mt-browser)"/>
    <circle class="mt-stn" cx="105" cy="40" r="7" stroke="var(--mt-agent)"/>
    <text class="mt-name" x="124" y="36">You · and the Agent</text>
    <text class="mt-meta" x="124" y="49">a browser · Claude Desktop, an SDK, FVT-traffic</text>

    <rect class="mt-stn" x="90" y="87" width="21" height="14" rx="4"/>
    <text class="mt-name" x="124" y="92">Cloudflare</text>
    <text class="mt-meta" x="124" y="104">terminates TLS · all the internet can see</text>

    <rect class="mt-stn" x="90" y="135" width="21" height="14" rx="4"/>
    <text class="mt-name" x="124" y="140">cloudflared</text>
    <text class="mt-meta" x="124" y="152">dials OUT — there is no open port</text>
    <text class="mt-cap" x="250" y="174">outbound tunnel ↓</text>

    <!-- INTERCHANGE -->
    <rect x="76" y="290" width="176" height="32" rx="16" fill="var(--mt-paper)" stroke="var(--mt-ink)" stroke-width="3"/>
    <circle cx="96" cy="306" r="6" fill="var(--mt-browser)"/>
    <circle cx="105" cy="306" r="6" fill="var(--mt-agent)"/>
    <text class="mt-name" x="122" y="303" font-size="13">nginx</text>
    <text class="mt-meta" x="122" y="315">splits by host and by path</text>

    <!-- THE RANK. Labels HORIZONTAL and centred under each station, name over path — the desktop box,
         unrolled. Rotation (draft 5) was the authentic-looking move and the wrong one: a station on a
         map carries a name, and tilting one to make room only hides that there is no room. -->
    <!-- A STATION CARRIES A NAME, NOT AN ADDRESS. Every draft so far set a name over its URL path,
         and "/cloud-developer-quiz/" is 82px of mono against a 366px viewBox — four names plus four
         paths cannot share this rank, which is what every label collision from draft 2 on was really
         about. The paths are a routing table, so they are drawn as one: see the key below. This is
         also just how the form works — the strip above a train door names the stops, and the fares
         and zones live on a panel beside it. -->
    <g text-anchor="middle">
      <circle class="mt-stn" cx="42" cy="416" r="6.5" stroke="var(--mt-browser)"/>
      <text class="mt-name" x="42" y="441" font-size="11.5">home</text>

      <circle class="mt-stn" cx="126" cy="416" r="6.5" stroke="var(--mt-browser)"/>
      <text class="mt-name" x="126" y="441" font-size="11.5">quiz</text>

      <circle class="mt-stn" cx="210" cy="416" r="6.5" stroke="var(--mt-browser)"/>
      <text class="mt-name" x="210" y="441" font-size="11.5">platform-auth</text>

      <!-- THE INTERCHANGE. Two lines stop here, so it is drawn the way nginx is — a capsule carrying
           one dot per line — not a circle like its single-line neighbours. The form now states the
           fact: blue TERMINATES (the dashboard is where you get off), red CONTINUES to rs-mcp. -->
      <rect class="mt-stn" x="281" y="406" width="26" height="20" rx="10"/>
      <circle cx="289" cy="416" r="3.6" fill="var(--mt-browser)"/>
      <circle cx="299" cy="416" r="3.6" fill="var(--mt-agent)"/>
      <text class="mt-name" x="294" y="441" font-size="11.5">vmcp</text>
    </g>

    <!-- SIDINGS: below the rank, never through it. Each label sits BELOW its own siding rather than
         beside it — the last render had the platform-content fork running through its own text. The
         fork is itself the label: it visibly serves two stations, so the words need not say so. -->
    <path class="mt-siding" d="M42 458 V 484 H 126 V 458"/>
    <rect class="mt-depot" x="78" y="478" width="12" height="12" rx="2"/>
    <text class="mt-mono" x="84" y="504">platform-content</text>

    <path class="mt-siding" d="M210 458 V 502"/>
    <rect class="mt-depot mt-db" x="204" y="502" width="12" height="12" rx="2"/>
    <text class="mt-mono" x="222" y="512">platform-db</text>

    <!-- Hangs off the red lane, label end-anchored to its left so it never touches the line. -->
    <path class="mt-siding" d="M330 476 H 308"/>
    <rect class="mt-depot mt-db" x="296" y="470" width="12" height="12" rx="2"/>
    <text class="mt-mono" x="292" y="480" text-anchor="end">vmcp-db</text>

    <!-- DOWNSTREAM OF vmcp — the only thing that earns a lower rank, and now the only thing the red
         line reaches ALONE. Blue stopped at the interchange; this leg is the agent's and nobody else's. -->
    <!-- Red EXITS THE INTERCHANGE SIDEWAYS and descends in the far-right lane at x=344, clear of the
         label band. Draft 6's first render had it drop straight from the capsule at x=312 — through
         "vmcp" and "/vmcp/ · /mcp", both centred at 307. A jog is also the truer subway idiom: a line
         that continues past an interchange leaves on its own alignment. -->
    <path class="mt-trunk mt-t-agent" d="M307 416 H 330 V 540"/>
    <circle class="mt-stn" cx="330" cy="540" r="6.5" stroke="var(--mt-agent)"/>
    <text class="mt-name" x="321" y="537" text-anchor="end" font-size="11.5">rs-mcp-server</text>
    <text class="mt-meta" x="321" y="548" text-anchor="end">17 RuneScape tools</text>

    <path class="mt-trunk mt-t-agent" d="M330 540 V 578"/>
    <path d="M322 578 L338 578 L330 592 Z" fill="var(--mt-agent)"/>
    <text class="mt-meta" x="321" y="584" text-anchor="end">→ public APIs</text>
  </svg>
      <table class="mdg-tbl">
        <caption>Where nginx sends you</caption>
        <tr><td class="mdg-p">/</td><td class="mdg-s">home</td><td class="mdg-l mdg-you">You</td></tr>
        <tr><td class="mdg-p">/cloud-developer-quiz/</td><td class="mdg-s">quiz</td><td class="mdg-l mdg-you">You</td></tr>
        <tr><td class="mdg-p">/auth/</td><td class="mdg-s">platform-auth</td><td class="mdg-l mdg-you">You</td></tr>
        <tr><td class="mdg-p">/vmcp/</td><td class="mdg-s">vmcp · the dashboard</td><td class="mdg-l mdg-you">You</td></tr>
        <tr><td class="mdg-p">/mcp</td><td class="mdg-s">vmcp · the gateway</td><td class="mdg-l mdg-agent">Agent</td></tr>
      </table>
      <div class="mdg-key">
        <span class="mdg-k"><i class="mdg-sw" style="background:#1F5FD0"></i>You</span>
        <span class="mdg-k"><i class="mdg-sw" style="background:#C2185B"></i>Agent · MCP</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-both"></i>both lines stop</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-dash"></i>siding — a store</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-db"></i>Postgres database</span>
      </div>
    </div>`;
}

/** The pipeline as a journey with a junction — a merge reaches a pod, a pull request does not. */
export function mobileCicd(): string {
  return `
    <div class="arch-mobile-d mc">
      <p class="mdg-intro">
        A pull request makes a <b>CI job</b>; a merge starts <b>version-tag</b> and <b>release</b> on the
        same event. Every job lands in one queue and is dispatched <b>by label</b> — GitHub's own VMs take
        the ordinary jobs, our self-hosted runner takes the rest. It builds, pushes and upgrades one
        service's release, then leaves: the rollout is watched from <b>inside</b> the cluster, because by
        the time one stalls the runner is long gone.
      </p>
      <div class="mdg-key">
        <span class="mdg-k"><i class="mdg-sw" style="background:#C8880E"></i>a pull request</span>
        <span class="mdg-k"><i class="mdg-sw" style="background:#C2185B"></i>a merge</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-cicd"></i>both routes call</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-dash"></i>a fetch — not a leg</span>
      </div>
      <table class="mdg-tbl mdg-lead">
        <caption>The four movements</caption>
        <tr><td class="mdg-n mdg-n-poll">1</td><td class="mdg-f">the runner <b>polls</b> — outbound. GitHub is never given a route in.</td></tr>
        <tr><td class="mdg-n">2</td><td class="mdg-f">the image is <b>stabled</b> in the depot — never handed over directly</td></tr>
        <tr><td class="mdg-n">3</td><td class="mdg-f"><b>helm upgrade</b> — the runner's last act before it leaves</td></tr>
        <tr><td class="mdg-n mdg-n-pull">4</td><td class="mdg-f">the kubelet <b>fetches</b> the image it was scheduled to run</td></tr>
      </table>
<svg viewBox="0 0 366 700" role="img" aria-label="The deploy pipeline as a transit line diagram, running top to bottom through three zones. In GitHub's zone, a service repo is an interchange where two routes begin: an amber pull-request route and a crimson merge route. Amber stops at the CI job, crimson at version-tag and release, and both meet again at the job queue, which dispatches by label. There the routes part: amber goes to a GitHub-hosted VM and ends at a buffer stop, because a pull request never deploys. Crimson crosses into the second zone, this machine outside the cluster, where a hatched single-track section admits one job at a time to the self-hosted runner. The runner pushes an image to the registry depot in the left-hand lane, reports to Discord, and calls helm upgrade, which crosses into the third zone, the cluster. There the apiserver makes a new ReplicaSet, the kubelet pulls the image back out of the depot along the dashed lane, and a Job watches the rollout. A separate dashed line shows the runner polling GitHub outbound, so GitHub never dials in.">
    <defs>
      <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--mc-rel)" stroke-width="2.2"/>
      </pattern>
    </defs>

    <!-- ── THE THREE ZONES. Stacked and adjacent, not nested: these are three trust domains, and
         nobody's is inside anybody else's. (The topology map nests, because the cluster genuinely
         sits inside the workstation.) -->
    <rect x="12" y="30" width="342" height="270" rx="9" fill="var(--mc-gh)" stroke="var(--mc-gh-e)"/>
    <rect x="12" y="30" width="342" height="16" rx="9" fill="var(--mc-gh-h)"/>
    <rect x="12" y="38" width="342" height="8" fill="var(--mc-gh-h)"/>
    <text class="mc-ztag" x="76" y="42">GitHub-hosted · GitHub's infrastructure</text>

    <rect x="12" y="300" width="342" height="200" rx="9" fill="var(--mc-out)" stroke="var(--mc-out-e)"/>
    <rect x="12" y="300" width="342" height="16" rx="9" fill="var(--mc-out-h)"/>
    <rect x="12" y="308" width="342" height="8" fill="var(--mc-out-h)"/>
    <text class="mc-ztag" x="76" y="312">Outside K8s · this machine, not in the cluster</text>

    <rect x="12" y="500" width="342" height="180" rx="9" fill="var(--mc-k8s)" stroke="var(--mc-k8s-e)"/>
    <rect x="12" y="500" width="342" height="16" rx="9" fill="var(--mc-k8s-h)"/>
    <rect x="12" y="508" width="342" height="8" fill="var(--mc-k8s-h)"/>
    <text class="mc-ztag" x="76" y="512">Inside K8s · the cluster</text>

    <!-- ── THE LANES. Amber and crimson run 12px apart down a left gutter; every label lives right of
         x=76. That is the strip above a train door, and it is the one layout at 366px where four
         words and a line never argue. -->
    <path class="mc-trunk mc-t-pr"  d="M44 70 V 215"/>
    <path class="mc-trunk mc-t-rel" d="M56 70 V 215"/>

    <!-- ① Service repos — both routes begin here, so it is an interchange, drawn as the topology
         map draws vmcp: a capsule with one dot per line. -->
    <rect class="mc-stn" x="32" y="61" width="32" height="18" rx="9"/>
    <circle cx="44" cy="70" r="3.4" fill="var(--mc-pr)"/>
    <circle cx="56" cy="70" r="3.4" fill="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="66">Service repos</text>
    <text class="mc-meta" x="76" y="78">one pipeline each</text>

    <!-- Each route's first stop is its OWN station — the fork is what a PR and a merge disagree about. -->
    <circle class="mc-stn" cx="44" cy="120" r="5.5" stroke="var(--mc-pr)"/>
    <text class="mc-name" x="76" y="116">CI job</text>
    <text class="mc-meta" x="76" y="128">a pull request · checks only</text>

    <circle class="mc-stn" cx="56" cy="168" r="5.5" stroke="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="164">Version tag and release</text>
    <text class="mc-meta" x="76" y="176">a merge · the thing that ships</text>

    <!-- ② The job queue — both routes call, so it is an interchange too. -->
    <rect class="mc-stn" x="32" y="206" width="32" height="18" rx="9"/>
    <circle cx="44" cy="215" r="3.4" fill="var(--mc-pr)"/>
    <circle cx="56" cy="215" r="3.4" fill="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="211">The job queue</text>
    <text class="mc-meta" x="76" y="223">every job, one queue — dispatched BY LABEL</text>
    <text class="mc-meta" x="76" y="234">a job reaches only a runner whose labels match</text>
    <text class="mc-meta" x="76" y="245">our runner is registered to platform-cicd alone</text>

    <!-- ③ THE JUNCTION. Below the queue the two routes physically part, which is what "by label"
         MEANS. Amber ends at a buffer stop: a pull request never reaches a pod, and that is the
         single most important thing this picture has to say. -->
    <path class="mc-trunk mc-t-pr"  d="M44 224 V 268"/>
    <path class="mc-trunk mc-t-rel" d="M56 224 V 300"/>

    <circle class="mc-stn" cx="44" cy="268" r="5.5" stroke="var(--mc-pr)"/>
    <text class="mc-name" x="76" y="264">GitHub-hosted VM</text>
    <text class="mc-meta" x="76" y="276">ubuntu-latest · fresh per job, then destroyed</text>
    <path class="mc-buffer" d="M44 268 V 286"/>
    <path class="mc-buffer" d="M36 286 H 52"/>
    <text class="mc-meta" x="76" y="290" font-style="italic">the line ends — a pull request cannot deploy</text>

    <!-- ── (1) THE RUNNER POLLS. Outbound, in its own dashed lane on the right, arrowhead pointing UP
         into GitHub's zone: the same claim cloudflared makes on the topology map. GitHub is never
         given a route in. -->
    <path class="mc-poll" d="M50 378 H 20 V 215 H 28"/>
    <path d="M32 215 L24 211 L24 219 Z" fill="var(--mc-out-h)"/>
    <circle class="mc-num" cx="20" cy="290" r="6.5" stroke="var(--mc-out-h)"/>
    <text class="mc-numt" x="20" y="292.8" fill="var(--mc-out-h)">1</text>

    <!-- ④ SINGLE-TRACK SECTION — the signature. "ONE job at a time — that IS the serialization" is
         literally single-track working: the section admits one train, and the next waits at the
         boundary until it clears. The pinch is the whole argument in one mark. -->
    <text class="mc-name" x="76" y="336" font-size="10.5">Single-track section</text>
    <text class="mc-meta" x="76" y="347">ONE job at a time — that IS the serialization</text>

    <!-- Crimson runs UNBROKEN from the zone boundary to the next — draft 1 drew it as two paths with
         a gap from y=300 to y=386, so the line simply stopped for 86px through the very section this
         diagram is about. The hatch is painted OVER the line, not instead of it. -->
    <path class="mc-trunk mc-t-rel" d="M56 300 V 500"/>
    <rect x="48" y="330" width="16" height="20" fill="url(#hatch)"/>
    <rect x="48" y="330" width="16" height="20" fill="none" stroke="var(--mc-rel)" stroke-width="1.2"/>

    <circle class="mc-stn" cx="56" cy="378" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="374">Self-hosted runner · ephemeral</text>
    <text class="mc-meta" x="76" y="386">one job, de-register, restart</text>

    <!-- ⑤ THE DEPOT. An image is stabled here and fetched later — the runner never hands it over.
         It lives in the LEFT gutter so that both accesses (the runner's push, the kubelet's pull)
         run in a lane that no label ever enters. -->
    <path class="mc-trunk mc-t-rel" d="M56 400 H 32 V 410" stroke-width="3"/>
    <rect class="mc-depot" x="24" y="410" width="16" height="14" rx="2"/>
    <circle class="mc-num" cx="46" cy="400" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-numt" x="46" y="402.8" fill="var(--mc-rel)">2</text>
    <text class="mc-name" x="76" y="404" font-size="10.5">registry:5000 — the depot</text>
    <text class="mc-meta" x="76" y="415">TLS, our own CA · the kubelet trusts our CA</text>
    <text class="mc-meta" x="76" y="426">pinned .10 · keeps the latest 2</text>

    <text class="mc-meta" x="76" y="448" font-style="italic">applied, not awaited — free again in ~0.5s</text>

    <!-- The release summary leaves the map entirely. An exit, not a station. -->
    <path class="mc-exit" d="M60 470 H 250"/>
    <path d="M250 466 L258 470 L250 474 Z" fill="var(--mc-muted)"/>
    <text class="mc-mono" x="76" y="465">the release summary → Discord ↗</text>

    <circle class="mc-num" cx="56" cy="492" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-numt" x="56" y="494.8" fill="var(--mc-rel)">3</text>

    <!-- ⑥ THE CLUSTER. Causal order: helm upgrade reaches the apiserver, the apiserver makes a
         ReplicaSet and schedules a Pod, and only THEN does the kubelet pull the image it needs.
         The desktop stacks the kubelet above the apiserver with "schedules the Pod" between them,
         which reads as the kubelet doing the scheduling. Worth a second opinion before it is called
         a bug — but the order below is the one the boxes' own words describe. -->
    <path class="mc-trunk mc-t-rel" d="M56 516 V 644"/>

    <!-- "It schedules a Pod for an image the node has yet to pull" belongs to the APISERVER — it is
         the apiserver's own sentence on the desktop, and draft 1 hung it under the kubelet, which
         says the node schedules its own work. Exactly the error the desktop's own stacking invites,
         reproduced by me while I was busy noticing it. -->
    <circle class="mc-stn" cx="56" cy="546" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="542">apiserver · platform namespace</text>
    <text class="mc-meta" x="76" y="554">the release's new image → a new ReplicaSet</text>
    <text class="mc-meta" x="76" y="565">it schedules a Pod for an image the node has yet to pull</text>

    <circle class="mc-stn" cx="56" cy="596" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="592">kubelet · the minikube node</text>
    <text class="mc-mono" x="76" y="604" fill="var(--mc-k8s-h)">registry:5000/quiz:0.1.22</text>

    <!-- (4) the kubelet pulls the image — back out of the depot, up the same gutter, dashed because
         it is a fetch rather than a leg of the journey. -->
    <path class="mc-pull" d="M32 424 V 596 H 46"/>
    <path d="M46 596 L38 592 L38 600 Z" fill="var(--mc-k8s-h)"/>
    <circle class="mc-num" cx="32" cy="540" r="6.5" stroke="var(--mc-k8s-h)"/>
    <text class="mc-numt" x="32" y="542.8" fill="var(--mc-k8s-h)">4</text>

    <circle class="mc-stn" cx="56" cy="644" r="6.5" stroke="var(--mc-rel)"/>
    <text class="mc-name" x="76" y="640">A Job watches the rollout</text>
    <text class="mc-meta" x="76" y="652">stalls → helm rollback + a Discord alert</text>
    <text class="mc-meta" x="76" y="663">RollingUpdate — the old pods never stopped serving</text>
  </svg>
      <table class="mdg-tbl">
        <caption>What starts a route</caption>
        <tr><td class="mdg-ev mdg-ev-pr">a pull request</td><td class="mdg-f mdg-mono">ci.yml · codeql.yml · secret-scan.yml</td></tr>
        <tr><td class="mdg-ev mdg-ev-rel">a merge</td><td class="mdg-f mdg-mono">version-tag.yml · release.yml</td></tr>
      </table>
      <table class="mdg-tbl">
        <caption>On the runner, in the single-track section</caption>
        <tr><td class="mdg-n">1</td><td class="mdg-cmd">docker build --build-arg VERSION</td></tr>
        <tr><td class="mdg-n">2</td><td class="mdg-cmd">docker push registry:5000/quiz:…</td></tr>
        <tr><td class="mdg-n">3</td><td class="mdg-cmd">helm upgrade quiz · its own release</td></tr>
      </table>
    </div>`;
}

/** Auth as a ticket and the barriers that read it. Deliberately not a line diagram: this is not a journey. */
export function mobileAuth(): string {
  return `
    <div class="arch-mobile-d ma">
      <p class="mdg-intro">
        The <b>gate</b> reads the browser's local storage. On a miss it calls platform-auth, which verifies
        your password and returns a signed token — the only thing kept. After that, each pod's own
        <b>middleware</b> checks the signature against public keys it fetched once and cached. Issued by
        one service; checked by every service.
      </p>
      <div class="mdg-key">
        <span class="mdg-k"><i class="mdg-sw" style="background:#B0003A"></i>the ticket — it travels with you</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-key"></i>the key — posted once to each barrier</span>
        <span class="mdg-k"><i class="mdg-sw mdg-sw-guest"></i>guest — never buys one</span>
      </div>
      <table class="mdg-tbl mdg-lead mdg-matrix">
        <caption>At the barrier</caption>
        <thead><tr><th>Service</th><th>No ticket</th><th>A valid ticket</th></tr></thead>
        <tbody>
          <tr><th class="mdg-svc">home</th><td class="mdg-none" colspan="2">no gated routes — no barrier, it never checks</td></tr>
          <tr><th class="mdg-svc">quiz</th><td class="mdg-no">refused</td><td class="mdg-yes">runs as that user</td></tr>
          <tr><th class="mdg-svc">vmcp</th><td class="mdg-no">read-only</td><td class="mdg-yes">runs as that user / admin</td></tr>
        </tbody>
      </table>
<svg viewBox="0 0 366 620" role="img" aria-label="Auth drawn as a ticket and the barriers that read it. In the upper section, the ticket office: a passenger with no ticket in local storage goes to platform-auth, which verifies the password against platform-db and signs an RS256 token. A dotted branch shows continue-as-guest bypassing the office entirely and ending at a marker rather than a ticket. In the middle, the ticket itself is drawn, carrying a subject, an admin flag and an RS256 signature, kept under one local-storage key shared by all three front ends. In the lower section, three barriers stand side by side: home has no barrier because it has no gated routes, while quiz and vmcp each hold their own cached copy of the public keys, posted once from the office along a dashed line, and check the ticket themselves without calling the office.">
    <!-- ── ① THE TICKET OFFICE ─────────────────────────────────────────────────────────────────── -->
    <rect x="12" y="14" width="342" height="216" rx="9" fill="var(--ma-office)" stroke="var(--ma-office-e)"/>
    <rect x="12" y="14" width="342" height="16" rx="9" fill="var(--ma-office-h)"/>
    <rect x="12" y="22" width="342" height="8" fill="var(--ma-office-h)"/>
    <text class="ma-ztag" x="76" y="26">The ticket office · in the browser, once</text>

    <!-- One unbroken line from "no ticket" to the barriers. Draft 1 stopped it at the ticket and
         restarted it below with a floating segment, so the thing the whole diagram is about sat
         beside the line rather than on it. -->
    <path class="ma-trunk" d="M56 56 V 376"/>
    <path class="ma-trunk" d="M56 269 H 88" stroke-width="3"/>

    <circle class="ma-stn" cx="56" cy="56" r="6.5" stroke="var(--ma-ticket)"/>
    <text class="ma-name" x="76" y="52">You — with no ticket</text>
    <text class="ma-meta" x="76" y="64">no platform:identity in localStorage → the gate opens</text>

    <circle class="ma-stn" cx="56" cy="118" r="6.5" stroke="var(--ma-ticket)"/>
    <text class="ma-name" x="76" y="114">platform-auth — the office</text>
    <text class="ma-mono" x="76" y="126">POST /auth/token</text>

    <!-- The office's records. It reads them; nobody else ever does. -->
    <path class="ma-trunk" d="M56 148 H 32 V 158" stroke-width="3"/>
    <rect class="ma-depot" x="24" y="158" width="16" height="14" rx="2"/>
    <text class="ma-meta" x="76" y="152">it verifies your password against platform-db</text>
    <text class="ma-meta" x="76" y="163">usernames + hashed passwords · read here and nowhere else</text>

    <circle class="ma-stn" cx="56" cy="196" r="6.5" stroke="var(--ma-ticket)"/>
    <text class="ma-name" x="76" y="192">Signed — RS256</text>
    <text class="ma-meta" x="76" y="204">the office is the only thing that can sign one</text>

    <!-- ── THE GUEST PATH. It bypasses the office: a guest marker is not a ticket, and the office is
         never called at all. Dotted, in the right-hand lane, ending at a marker rather than a ticket. -->
    <path class="ma-guest" d="M64 40 H 330 V 214"/>
    <rect x="322" y="214" width="16" height="12" rx="2" fill="var(--ma-paper)" stroke="var(--ma-muted)" stroke-width="1.4"/>
    <text class="ma-mono" x="326" y="36" text-anchor="end">continue as guest →</text>
    <text class="ma-mono" x="316" y="223" text-anchor="end">a local marker · the office is never called</text>

    <!-- ── ② THE TICKET ITSELF — the signature of this diagram. Everything above exists to produce
         it; everything below exists to read it. A perforated stub, because that is what a ticket
         looks like and because the stub is where the claims live. -->
    <!-- The stub's text ran into the body's: the body lines reach x≈241 and the stub began at 232.
         The ticket is wider now and the perforation sits at 250, which is what actually divides them. -->
    <g>
      <rect x="88" y="238" width="250" height="58" rx="5" fill="var(--ma-paper)" stroke="var(--ma-ticket)" stroke-width="2"/>
      <line x1="280" y1="238" x2="280" y2="296" stroke="var(--ma-ticket)" stroke-width="1" stroke-dasharray="3 3"/>
      <text class="ma-ztag" x="98" y="252" fill="var(--ma-ticket)" font-size="7.5">Platform ticket</text>
      <text class="ma-mono" x="98" y="266" font-size="8" fill="var(--ma-ink)">sub: you · admin: true|false</text>
      <text class="ma-mono" x="98" y="279" font-size="8" fill="var(--ma-ink)">signed by the office</text>
      <text class="ma-mono" x="98" y="292" font-size="8">exp — then buy another</text>
      <!-- The stub carries the validation mark, which is what a stub is for. The localStorage facts
           moved to the caption: they are about where the ticket LIVES, not what is printed on it. -->
      <text class="ma-mono" x="290" y="262" font-size="8" font-weight="700" fill="var(--ma-ticket)">RS256</text>
      <text class="ma-mono" x="290" y="280" font-size="13" fill="var(--ma-ticket)">✓</text>
    </g>
    <text class="ma-meta" x="88" y="312">Kept under platform:identity — ONE key. home, quiz</text>
    <text class="ma-meta" x="88" y="323">and vmcp share it, so one sign-in fills it for all three.</text>

    <!-- ── ③ THE BARRIERS ──────────────────────────────────────────────────────────────────────── -->
    <rect x="12" y="336" width="342" height="268" rx="9" fill="var(--ma-gates)" stroke="var(--ma-gates-e)"/>
    <rect x="12" y="336" width="342" height="16" rx="9" fill="var(--ma-gates-h)"/>
    <rect x="12" y="344" width="342" height="8" fill="var(--ma-gates-h)"/>
    <text class="ma-ztag" x="76" y="348">The barriers · in each pod, every request</text>

    <!-- The keys are POSTED to the barriers, once. One line, two barriers: it is the same fetch, and
         drawing it twice would imply two different keys. -->
    <!-- The key line leaves the OFFICE — it did not, in draft 1: it started at the ticket's corner,
         which says the ticket carries the key that validates it. It does not, and that would be the
         whole design inverted. It runs down the far-right lane to vmcp and quiz and STOPS: it must
         never reach home's approach at x=82, because home holds no key and checks nothing. -->
    <!-- TWO sides, not three. Run it right-then-down-then-left and it stops being a delivery and
         becomes a dashed box drawn around the ticket — the same shape that ruined the pipeline's
         poll line. It descends from the office zone's own edge instead: the reader gets "from the
         office" without a bracket. It stops at quiz and never reaches home's approach at x=82,
         because home holds no key. -->
    <path class="ma-keyline" d="M344 232 V 392 H 196"/>
    <path d="M196 392 L204 388 L204 396 Z" fill="var(--ma-key)"/>
    <text class="ma-mono" x="340" y="364" text-anchor="end" fill="var(--ma-key)">GET /.well-known/jwks.json — fetched once, cached</text>

    <!-- The ticket arrives at all three. It is the same ticket: one trunk, three approaches. -->
    <path class="ma-trunk" d="M56 376 H 310" stroke-width="4"/>
    <path class="ma-trunk" d="M82 376 V 404" stroke-width="4"/>
    <path class="ma-trunk" d="M196 376 V 404" stroke-width="4"/>
    <path class="ma-trunk" d="M310 376 V 404" stroke-width="4"/>

    <g text-anchor="middle">
      <!-- home: an OPEN station. The posts are drawn apart and grey — there is nothing to check. -->
      <rect x="66" y="404" width="5" height="26" rx="1.5" fill="var(--ma-open)"/>
      <rect x="93" y="404" width="5" height="26" rx="1.5" fill="var(--ma-open)"/>
      <text class="ma-name" x="82" y="448" font-size="11">home</text>
      <text class="ma-meta" x="82" y="460" font-size="8">no barrier</text>

      <rect x="182" y="404" width="5" height="26" rx="1.5" fill="var(--ma-svc)"/>
      <rect x="205" y="404" width="5" height="26" rx="1.5" fill="var(--ma-svc)"/>
      <circle cx="196" cy="392" r="5" fill="var(--ma-paper)" stroke="var(--ma-key)" stroke-width="1.8"/>
      <text class="ma-name" x="196" y="448" font-size="11">quiz</text>
      <text class="ma-meta" x="196" y="460" font-size="8">its own key</text>

      <rect x="296" y="404" width="5" height="26" rx="1.5" fill="var(--ma-svc)"/>
      <rect x="319" y="404" width="5" height="26" rx="1.5" fill="var(--ma-svc)"/>
      <circle cx="310" cy="392" r="5" fill="var(--ma-paper)" stroke="var(--ma-key)" stroke-width="1.8"/>
      <text class="ma-name" x="310" y="448" font-size="11">vmcp</text>
      <text class="ma-meta" x="310" y="460" font-size="8">its own key</text>
    </g>

    <text class="ma-meta" x="24" y="490">Each barrier checks the signature itself, against the key it already holds.</text>
    <text class="ma-meta" x="24" y="503">No call to the office. No database read. No central gateway.</text>
    <text class="ma-meta" x="24" y="522" font-style="italic">A good signature — the request runs as that user.</text>
    <text class="ma-meta" x="24" y="535" font-style="italic">Expired, forged or missing — it falls to anonymous. See the table above.</text>
    <text class="ma-mono" x="24" y="558">Authorization: Bearer &lt;the ticket&gt;</text>
    <text class="ma-meta" x="24" y="578">Every barrier trusts the office because it has the office's public key —</text>
    <text class="ma-meta" x="24" y="591">and only the office holds the private one. That asymmetry IS the design.</text>
  </svg>
    </div>`;
}
