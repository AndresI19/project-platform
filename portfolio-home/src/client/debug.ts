/**
 * /debug — the nightly FVT board.
 *
 * Admin-only, and the server enforces that: these fetches carry the platform admin token and the API
 * 403s a signed-in non-admin. The check here is about what to RENDER, never about what to permit —
 * a client-side gate is a UI affordance, and treating it as security would be the classic mistake.
 *
 * Form choices, in the order they were made:
 *   * The headline is a set of STAT TILES, not a chart. "Did last night pass" is one number plus a
 *     state; drawing it as a plot would be decoration around a fact.
 *   * History is a STRIP OF ONE CELL PER RUN rather than a line chart. The suite runs once a day and
 *     each run either passed or did not — that is a sequence of states, not a continuous quantity,
 *     and a line drawn through it would imply values between the runs that do not exist. A missing
 *     day is a missing cell, which is the honest rendering of "no run happened".
 *   * Per-service results are a grouped list, failures first, because the only question a failing
 *     board has to answer is "what broke and what did it say".
 *
 * Every status is carried by an ICON and a WORD as well as a colour. The pass/fail hues were chosen
 * against the palette validator rather than by eye — teal-vs-red rather than the green-vs-red that
 * reads as one colour to a deuteranope (it measured ΔE 4.4, well under the floor).
 */

import { authFetch, isAdmin, onIdentity } from '@platform/ui/auth';

interface RunSummary {
  runId: string;
  suite: string;
  target: string;
  runner: string;
  startedAt: string;
  finishedAt: string;
  passed: number;
  failed: number;
  skipped: number;
}

interface Check {
  service: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  detail: string | null;
}

/** Icon + word per state, so identity survives a greyscale print and a colourblind reader. */
const MARK: Record<Check['status'], { icon: string; label: string }> = {
  pass: { icon: '●', label: 'pass' },
  fail: { icon: '✕', label: 'fail' },
  skip: { icon: '–', label: 'skip' },
};

const esc = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** A run is green only if nothing failed. Skips are not failures, but they are not passes either. */
const runState = (r: RunSummary): Check['status'] => (r.failed > 0 ? 'fail' : r.passed > 0 ? 'pass' : 'skip');

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const secs = (a: string, b: string): string =>
  `${Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000))}s`;

/**
 * The tiles. Deliberately three facts and no more: whether the last run was clean, how much of the
 * window was clean, and when we last heard anything at all. A tile per metric we happen to have
 * would bury the one that matters.
 */
function tilesHtml(runs: RunSummary[]): string {
  if (runs.length === 0) {
    return `<p class="dbg-empty">No runs recorded yet. The nightly suite posts here when it next runs.</p>`;
  }
  const latest = runs[0];
  const state = runState(latest);
  const clean = runs.filter((r) => r.failed === 0).length;
  const rate = Math.round((clean / runs.length) * 100);
  const total = latest.passed + latest.failed + latest.skipped;

  return `
    <div class="dbg-tiles">
      <div class="dbg-tile" data-state="${state}">
        <span class="dbg-tile-label">Last run</span>
        <span class="dbg-tile-value">
          <span class="dbg-mark" aria-hidden="true">${MARK[state].icon}</span>${
            state === 'fail' ? `${latest.failed} failing` : 'all clear'
          }
        </span>
        <span class="dbg-tile-note">${esc(when(latest.startedAt))} · ${latest.passed}/${total} checks</span>
      </div>
      <div class="dbg-tile">
        <span class="dbg-tile-label">Clean runs</span>
        <span class="dbg-tile-value">${rate}%</span>
        <span class="dbg-tile-note">${clean} of the last ${runs.length}</span>
      </div>
      <div class="dbg-tile">
        <span class="dbg-tile-label">Target</span>
        <span class="dbg-tile-value dbg-tile-sm">${esc(latest.suite)}</span>
        <span class="dbg-tile-note">${esc(latest.target)} · as ${esc(latest.runner)}</span>
      </div>
    </div>`;
}

/**
 * One cell per run, oldest on the left. Each carries its own title so hovering a cell answers "which
 * run was that and what happened" without a click — the interaction a dense strip owes the reader.
 */
function stripHtml(runs: RunSummary[]): string {
  if (runs.length === 0) return '';
  const cells = [...runs]
    .reverse()
    .map((r) => {
      const st = runState(r);
      const title = `${when(r.startedAt)} — ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped`;
      return `<button class="dbg-cell" data-state="${st}" data-run="${esc(r.runId)}" title="${esc(title)}" aria-label="${esc(title)}"></button>`;
    })
    .join('');
  return `
    <section class="dbg-section">
      <h2 class="dbg-h2">History <span class="dbg-sub">oldest first · click a run for its checks</span></h2>
      <div class="dbg-strip">${cells}</div>
    </section>`;
}

/** The run list. The strip shows shape; this shows detail, and both select the same run. */
function runsHtml(runs: RunSummary[]): string {
  if (runs.length === 0) return '';
  const rows = runs
    .map((r) => {
      const st = runState(r);
      return `
      <button class="dbg-row" data-run="${esc(r.runId)}" data-state="${st}">
        <span class="dbg-row-state"><span class="dbg-mark" aria-hidden="true">${MARK[st].icon}</span>${MARK[st].label}</span>
        <span class="dbg-row-when">${esc(when(r.startedAt))}</span>
        <span class="dbg-row-counts">${r.passed} pass · ${r.failed} fail · ${r.skipped} skip</span>
        <span class="dbg-row-dur">${esc(secs(r.startedAt, r.finishedAt))}</span>
      </button>`;
    })
    .join('');
  return `
    <section class="dbg-section">
      <h2 class="dbg-h2">Runs</h2>
      <div class="dbg-rows">${rows}</div>
      <div class="dbg-detail" id="dbg-detail"></div>
    </section>`;
}

/** Checks for one run, grouped by service, failures first — the order you read a broken board in. */
function checksHtml(runId: string, checks: Check[]): string {
  const byService = new Map<string, Check[]>();
  for (const c of checks) {
    const list = byService.get(c.service);
    if (list) list.push(c);
    else byService.set(c.service, [c]);
  }
  // A service with a failure sorts to the top; within a service the failures lead too.
  const services = [...byService.entries()].sort(
    (a, b) => Number(b[1].some((c) => c.status === 'fail')) - Number(a[1].some((c) => c.status === 'fail')),
  );

  const blocks = services
    .map(([service, list]) => {
      const ordered = [...list].sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail'));
      const items = ordered
        .map(
          (c) => `
        <li class="dbg-check" data-state="${c.status}">
          <span class="dbg-check-state"><span class="dbg-mark" aria-hidden="true">${MARK[c.status].icon}</span><span class="dbg-vh">${MARK[c.status].label}</span></span>
          <span class="dbg-check-name">${esc(c.name)}</span>
          <span class="dbg-check-dur">${c.durationMs}ms</span>
          ${c.detail ? `<span class="dbg-check-detail">${esc(c.detail)}</span>` : ''}
        </li>`,
        )
        .join('');
      const failed = list.filter((c) => c.status === 'fail').length;
      return `
      <div class="dbg-service" data-state="${failed ? 'fail' : 'pass'}">
        <h3 class="dbg-h3">${esc(service)} <span class="dbg-sub">${failed ? `${failed} failing` : 'ok'}</span></h3>
        <ul class="dbg-checks">${items}</ul>
      </div>`;
    })
    .join('');

  return `<div class="dbg-detail-inner"><h3 class="dbg-h3">Run ${esc(runId)}</h3>${blocks}</div>`;
}

async function loadChecks(runId: string, into: HTMLElement): Promise<void> {
  into.innerHTML = `<p class="dbg-empty">Loading…</p>`;
  const res = await authFetch(`/api/fvt/runs/${encodeURIComponent(runId)}`);
  if (!res || !res.ok) {
    into.innerHTML = `<p class="dbg-empty">Could not load that run${res ? ` (${res.status})` : ''}.</p>`;
    return;
  }
  const body = (await res.json()) as { checks: Check[] };
  into.innerHTML = checksHtml(runId, body.checks);
}

function shell(inner: string): string {
  return `
    <main class="dbg">
      <header class="dbg-head">
        <h1 class="dbg-h1">Platform FVT</h1>
        <p class="dbg-lede">
          What the nightly function-verification suite found driving the public API from outside the
          cluster. <a href="/">← back to the site</a>
        </p>
      </header>
      ${inner}
    </main>`;
}

async function render(root: HTMLElement): Promise<void> {
  if (!isAdmin()) {
    // Not an error state — a signed-out visitor is the common case. The account FAB (mounted by
    // main.ts) is how they sign in, so this says where to go rather than offering a second door.
    root.innerHTML = shell(
      `<p class="dbg-empty">This board is admin-only. Sign in with the account button, bottom right.</p>`,
    );
    return;
  }
  root.innerHTML = shell(`<p class="dbg-empty">Loading…</p>`);
  const res = await authFetch('/api/fvt/runs?limit=30');
  if (!res || !res.ok) {
    // 503 is the server telling us Postgres is unreachable; anything else is unexpected. Either way
    // say which, because "no data" and "cannot reach the data" are different problems.
    const why = res?.status === 503 ? 'the run history is unreachable' : `unexpected status ${res?.status}`;
    root.innerHTML = shell(`<p class="dbg-empty">Could not load runs — ${esc(why)}.</p>`);
    return;
  }
  const { runs } = (await res.json()) as { runs: RunSummary[] };
  root.innerHTML = shell(`${tilesHtml(runs)}${stripHtml(runs)}${runsHtml(runs)}`);

  const detail = document.getElementById('dbg-detail');
  if (!detail) return;
  // One delegated listener rather than one per cell and row: both select a run, and the strip can be
  // 30 buttons wide.
  root.addEventListener('click', (e) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-run]');
    if (!hit) return;
    const runId = hit.dataset.run;
    if (!runId) return;
    for (const el of root.querySelectorAll('[data-run].is-open')) el.classList.remove('is-open');
    hit.classList.add('is-open');
    void loadChecks(runId, detail);
  });
}

/**
 * Mount the board if this is /debug. Returns whether it handled the page, so main.ts can skip the
 * home page's own setup rather than building both and hiding one.
 */
export function mountDebug(): boolean {
  if (window.location.pathname.replace(/\/+$/, '') !== '/debug') return false;
  const root = document.getElementById('app');
  if (!root) return false;
  document.title = 'Platform FVT — debug';
  void render(root);
  // Identity resolves asynchronously (the FAB establishes it), so a first paint can land before we
  // know whether this visitor is an admin. Re-render when that settles rather than showing the
  // signed-out message to an admin who simply arrived faster than their token did.
  onIdentity(() => void render(root));
  return true;
}
