/**
 * FVT run history: the ingest the nightly suite POSTs to, the reads /debug renders, and the Postgres
 * behind both.
 *
 * The suite runs on the host, OUTSIDE the cluster, and drives the public API the same way a visitor
 * does. That makes its results the only record of whether the platform actually worked end to end —
 * but a container's stdout is not a record, it is a thing you have to be watching. So the suite posts
 * what it found, this stores it, and /debug shows it.
 *
 * Two access levels, deliberately different:
 *   * INGEST needs only a valid platform-auth token. The runner already signs in as `fvt-runner` for
 *     a real RS256 token, so requiring admin would mean promoting that account — widening what a
 *     credential living in a .env on the host could do everywhere else, to buy nothing. Writing a
 *     run is not a privileged act; it is the one thing that account exists to do.
 *   * READS are admin-only. A failing check names the service and quotes the error, which is a map of
 *     what is currently broken and how. That is for me, not for visitors.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { requireAdmin } from './content.js';
import type { Env } from './env.js';

// --- The shape the suite posts ---

/** One assertion the suite made. `skip` is a check that could not run, not one that passed. */
export interface FvtCheck {
  service: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  /** Why it failed. Null for a pass — storing "ok" for every green check is noise with a cost. */
  detail: string | null;
}

export interface FvtRun {
  suite: string;
  target: string;
  /** The runner's own id for this run. UNIQUE, so a retried POST updates rather than duplicates. */
  runId: string;
  startedAt: string;
  finishedAt: string;
  checks: FvtCheck[];
}

const STATUSES = new Set(['pass', 'fail', 'skip']);

/**
 * Caps. The ingest is authenticated, so these are not an abuse control — they are a bound on what a
 * BUGGY runner can write. A suite stuck in a loop appending checks would otherwise turn one bad
 * deploy into an unbounded insert, and the first symptom would be the disk the quiz's decks live on.
 */
const MAX_CHECKS = 300;
const MAX_TEXT = 1500;

/**
 * The ingest path, exported because index.ts has to know it: the app-wide `express.json` there is
 * capped at 2kb for the one short string /api/hello accepts, and it runs BEFORE this route's own
 * parser. A whole run — dozens of checks, each able to carry 1500 characters of failure text — is
 * far past that, so the global parser must skip this path and let the route parse its own body.
 *
 * This is the same rule content.ts follows (scope the bigger parser to the route, never widen the
 * global), with one difference that cost a debugging round: an upload is not application/json, so
 * the global parser ignores it without being told to. This body IS json, so it has to be excluded
 * explicitly or the 2kb cap rejects the run before any of this code sees it.
 */
export const FVT_INGEST_PATH = '/api/fvt/results';

/**
 * Body cap for that route. Sized above the worst case the validator will accept
 * (MAX_CHECKS × MAX_TEXT ≈ 450kB) so a payload is rejected by the NAMED check that explains itself,
 * not by a 413 the runner cannot act on.
 */
const MAX_BODY = '1mb';

function text(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string') throw new BadPayload(`${field} must be a string`);
  const s = v.trim();
  if (!s) throw new BadPayload(`${field} must not be empty`);
  if (s.length > max) throw new BadPayload(`${field} must be at most ${max} characters`);
  return s;
}

/** An ISO-8601 instant. Returned as a Date so the caller cannot re-parse it differently. */
function instant(v: unknown, field: string): Date {
  const s = text(v, field, 40);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadPayload(`${field} must be an ISO-8601 timestamp`);
  return d;
}

/** Thrown for anything a caller could fix by sending a different body — always a 400, never a 500. */
export class BadPayload extends Error {}

/**
 * Validate an untrusted body into an FvtRun. Every field is checked here rather than at the SQL
 * boundary so a bad payload is a named 400 instead of a constraint violation the caller cannot read.
 */
export function parseRun(body: unknown): FvtRun {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadPayload('body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  const startedAt = instant(b.startedAt, 'startedAt');
  const finishedAt = instant(b.finishedAt, 'finishedAt');
  // Not a formality: these two drive the duration shown on /debug, and a run that "finished" before
  // it started would render as a negative one. Rejecting it here keeps the dashboard's arithmetic
  // trustworthy without every consumer having to re-check.
  if (finishedAt.getTime() < startedAt.getTime()) {
    throw new BadPayload('finishedAt must not be before startedAt');
  }

  if (!Array.isArray(b.checks)) throw new BadPayload('checks must be an array');
  if (b.checks.length === 0) throw new BadPayload('checks must not be empty');
  if (b.checks.length > MAX_CHECKS) {
    throw new BadPayload(`checks must contain at most ${MAX_CHECKS} entries`);
  }

  const checks = b.checks.map((raw, i): FvtCheck => {
    if (typeof raw !== 'object' || raw === null) {
      throw new BadPayload(`checks[${i}] must be an object`);
    }
    const c = raw as Record<string, unknown>;
    const status = text(c.status, `checks[${i}].status`, 10);
    if (!STATUSES.has(status)) {
      throw new BadPayload(`checks[${i}].status must be one of pass, fail, skip`);
    }
    const durationMs = c.durationMs;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new BadPayload(`checks[${i}].durationMs must be a non-negative number`);
    }
    // Detail is optional and only meaningful on a failure, but it is NOT rejected on a pass — a
    // suite that reports something useful about a slow-but-green check should not 400 for it.
    const detail =
      c.detail === undefined || c.detail === null ? null : text(c.detail, `checks[${i}].detail`, MAX_TEXT);
    return {
      service: text(c.service, `checks[${i}].service`, 60),
      name: text(c.name, `checks[${i}].name`, 200),
      status: status as FvtCheck['status'],
      durationMs: Math.round(durationMs),
      detail,
    };
  });

  return {
    suite: text(b.suite, 'suite', 60),
    target: text(b.target, 'target', 200),
    runId: text(b.runId, 'runId', 120),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    checks,
  };
}

/**
 * Totals, computed HERE rather than read from the payload. The runner already knows them, but a
 * total that disagrees with the checks it shipped is a number the dashboard would repeat without
 * being able to justify. Deriving them means "12 passed" is always a fact about stored rows.
 */
export function tally(checks: FvtCheck[]): { passed: number; failed: number; skipped: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of checks) {
    if (c.status === 'pass') passed++;
    else if (c.status === 'fail') failed++;
    else skipped++;
  }
  return { passed, failed, skipped };
}

// --- Storage ---

/**
 * Created on every boot, idempotently, the same way job-searcher migrates: the alternative is a
 * migration tool whose state is a row in the database it is supposed to be creating.
 *
 * fvt_checks cascades from fvt_runs so the retention prune is one DELETE against runs — a prune that
 * had to remember to clear children is a prune that eventually forgets.
 */
const SCHEMA_SQL = `
create table if not exists fvt_runs (
  id           bigserial primary key,
  run_id       text        not null unique,
  suite        text        not null,
  target       text        not null,
  runner       text        not null,
  started_at   timestamptz not null,
  finished_at  timestamptz not null,
  passed       integer     not null,
  failed       integer     not null,
  skipped      integer     not null,
  received_at  timestamptz not null default now()
);
create table if not exists fvt_checks (
  id          bigserial primary key,
  run_id      bigint  not null references fvt_runs(id) on delete cascade,
  ordinal     integer not null,
  service     text    not null,
  name        text    not null,
  status      text    not null,
  duration_ms integer not null,
  detail      text
);
create index if not exists fvt_runs_started_idx on fvt_runs (started_at desc);
create index if not exists fvt_checks_run_idx on fvt_checks (run_id, ordinal);
`;

export interface RunSummary {
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

/**
 * What the routes need from storage. Narrower than FvtStore on purpose: it is the ONE seam the tests
 * substitute, because Postgres is the only dependency on this path that cannot be made real in a unit
 * test. Everything else the routes depend on — RS256 verification, the JWKS, Express's middleware
 * chain — stays genuine, so the tests still exercise the parts where a stub would assert the bug out
 * of existence.
 */
export interface FvtStoreLike {
  /**
   * Create the schema. On the interface rather than only on the class so mountFvt can stay the ONE
   * place that decides whether FVT is configured — index.ts calling init() on what it returns needs
   * no second copy of that condition, and a duplicated guard is the thing content.ts warns about.
   */
  init(): Promise<void>;
  record(run: FvtRun, runner: string): Promise<{ id: number; pruned: number }>;
  recentRuns(limit: number): Promise<RunSummary[]>;
  checksFor(runId: string): Promise<FvtCheck[]>;
}

export class FvtStore implements FvtStoreLike {
  private readonly pool: pg.Pool;
  private readonly retentionDays: number;

  constructor(databaseUrl: string, retentionDays: number) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    // A pool that throws on an idle client's error takes the process with it. This server's main job
    // is serving the home page, which does not need Postgres at all — losing it to a database blip
    // would be the FVT feature breaking the site it reports on.
    this.pool.on('error', (err) => console.error('[fvt] idle pool client error:', err.message));
    this.retentionDays = retentionDays;
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Insert a run and its checks in ONE transaction, then prune. A half-written run — the parent row
   * with some of its checks — would render on /debug as a run that silently lost assertions, which is
   * indistinguishable from a suite that never made them.
   *
   * Re-posting the same runId replaces the previous attempt rather than erroring: the runner retries
   * on a network failure, and the second attempt is the same truth, not a new one.
   */
  async record(run: FvtRun, runner: string): Promise<{ id: number; pruned: number }> {
    const { passed, failed, skipped } = tally(run.checks);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ id: string }>(
        `insert into fvt_runs (run_id, suite, target, runner, started_at, finished_at, passed, failed, skipped)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (run_id) do update set
           suite = excluded.suite, target = excluded.target, runner = excluded.runner,
           started_at = excluded.started_at, finished_at = excluded.finished_at,
           passed = excluded.passed, failed = excluded.failed, skipped = excluded.skipped,
           received_at = now()
         returning id`,
        [run.runId, run.suite, run.target, runner, run.startedAt, run.finishedAt, passed, failed, skipped],
      );
      const id = Number(rows[0].id);
      // The conflict path above updated an existing run, so its old checks are still there. Clearing
      // unconditionally is simpler than branching and correct in both cases (a fresh insert deletes
      // nothing).
      await client.query('delete from fvt_checks where run_id = $1', [id]);

      // One parameterised INSERT for every check rather than a statement each: a 60-check suite is 60
      // round trips inside a transaction otherwise, all of them holding it open.
      if (run.checks.length > 0) {
        const values: unknown[] = [];
        const tuples = run.checks.map((c, i) => {
          values.push(id, i, c.service, c.name, c.status, c.durationMs, c.detail);
          const b = i * 7;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
        });
        await client.query(
          `insert into fvt_checks (run_id, ordinal, service, name, status, duration_ms, detail)
           values ${tuples.join(',')}`,
          values,
        );
      }

      // Prune inside the same transaction. Retention that runs on its own schedule is a second thing
      // that can stop; tied to the write, it cannot fall behind while runs keep arriving.
      const pruned = await client.query(
        `delete from fvt_runs where started_at < now() - ($1 || ' days')::interval`,
        [String(this.retentionDays)],
      );
      await client.query('commit');
      return { id, pruned: pruned.rowCount ?? 0 };
    } catch (err) {
      await client.query('rollback').catch(() => {
        /* the connection is already gone; the transaction dies with it */
      });
      throw err;
    } finally {
      client.release();
    }
  }

  /** Most recent runs, newest first. */
  async recentRuns(limit: number): Promise<RunSummary[]> {
    const { rows } = await this.pool.query(
      `select run_id, suite, target, runner, started_at, finished_at, passed, failed, skipped
         from fvt_runs order by started_at desc limit $1`,
      [limit],
    );
    return rows.map((r) => ({
      runId: r.run_id,
      suite: r.suite,
      target: r.target,
      runner: r.runner,
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: new Date(r.finished_at).toISOString(),
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped,
    }));
  }

  /** Every check of one run, in the order the suite reported them. */
  async checksFor(runId: string): Promise<FvtCheck[]> {
    const { rows } = await this.pool.query(
      `select c.service, c.name, c.status, c.duration_ms, c.detail
         from fvt_checks c join fvt_runs r on r.id = c.run_id
        where r.run_id = $1 order by c.ordinal`,
      [runId],
    );
    return rows.map((r) => ({
      service: r.service,
      name: r.name,
      status: r.status,
      durationMs: r.duration_ms,
      detail: r.detail,
    }));
  }
}

// --- Auth ---

/**
 * Any verified platform-auth identity. Mirrors content.ts's requireAdmin — same RS256 pinning, same
 * issuer/audience checks, same 401-vs-403 split — but stops short of the admin claim, and hands the
 * username down so a stored run records WHO reported it.
 */
export function requireIdentity(env: Env, jwks: JWTVerifyGetKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1];
    if (!bearer) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'sign in to post results' });
      return;
    }
    try {
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer: env.authIssuer,
        audience: env.authAudience,
        algorithms: ['RS256'],
      });
      // `sub` is the stable identity; `username` is what a human recognises on the dashboard. Prefer
      // the readable one and fall back, rather than showing a UUID in a column headed "runner".
      const username = typeof payload.username === 'string' ? payload.username : payload.sub;
      (req as Request & { fvtRunner?: string }).fvtRunner = String(username ?? 'unknown');
      next();
    } catch {
      res.status(401).json({ error: 'invalid token' });
    }
  };
}

// --- Mounting ---

export interface MountFvtOpts {
  env: Env;
  /** Injectable for tests; defaults to the real store built from env.databaseUrl. */
  store?: FvtStoreLike;
  /** Injectable for tests; defaults to a remote key set built from env.authJwksUri. */
  jwks?: JWTVerifyGetKey;
}

/**
 * Register the FVT routes — ONLY when there is both a database to write to and a way to verify who
 * is writing. Following content.ts: an unregistered route makes "open by accident" unrepresentable,
 * where a registered-but-disabled one rests on an `if` staying correct forever. Here the stakes are
 * an unauthenticated write to shared Postgres, so the same rule applies with more reason.
 *
 * Returns the store when it mounted (so the caller can init and close it), or null when it did not.
 */
export function mountFvt(app: Express, opts: MountFvtOpts): FvtStoreLike | null {
  const { env } = opts;
  if (!env.databaseUrl || !env.authJwksUri) return null;

  const store = opts.store ?? new FvtStore(env.databaseUrl, env.fvtRetentionDays);
  const jwks = opts.jwks ?? createRemoteJWKSet(new URL(env.authJwksUri));
  const identity = requireIdentity(env, jwks);
  // content.ts's guard, handed THIS module's key set rather than letting it build its own — one JWKS
  // cache and one re-fetch cooldown for the process, instead of two that expire independently.
  const admin = requireAdmin(env, jwks);

  app.post(
    FVT_INGEST_PATH,
    // This route's own parser, ahead of the guard. index.ts excludes this path from the app-wide
    // 2kb one; without both halves a real run is a 413 before it reaches any of this.
    express.json({ limit: MAX_BODY }),
    identity,
    async (req: Request, res: Response): Promise<void> => {
      let run: FvtRun;
      try {
        run = parseRun(req.body);
      } catch (err) {
        if (err instanceof BadPayload) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
      const runner = (req as Request & { fvtRunner?: string }).fvtRunner ?? 'unknown';
      try {
        const { id, pruned } = await store.record(run, runner);
        const { passed, failed, skipped } = tally(run.checks);
        res.status(201).json({ id, runId: run.runId, passed, failed, skipped, pruned });
      } catch (err) {
        // The suite must be able to tell "you sent me nonsense" from "I could not store it" — the first
        // is its bug to fix, the second is mine, and only the second is worth retrying.
        console.error('[fvt] failed to record run:', (err as Error).message);
        res.status(503).json({ error: 'could not record the run' });
      }
    },
  );

  app.get('/api/fvt/runs', admin, async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    try {
      res.json({ runs: await store.recentRuns(limit) });
    } catch (err) {
      console.error('[fvt] failed to read runs:', (err as Error).message);
      res.status(503).json({ error: 'could not read the run history' });
    }
  });

  app.get('/api/fvt/runs/:runId', admin, async (req: Request, res: Response): Promise<void> => {
    try {
      const checks = await store.checksFor(req.params.runId);
      if (checks.length === 0) {
        res.status(404).json({ error: 'no such run' });
        return;
      }
      res.json({ runId: req.params.runId, checks });
    } catch (err) {
      console.error('[fvt] failed to read checks:', (err as Error).message);
      res.status(503).json({ error: 'could not read the run' });
    }
  });

  return store;
}
