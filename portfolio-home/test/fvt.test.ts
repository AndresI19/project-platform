import express, { type Express } from 'express';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../src/server/env.js';
import {
  BadPayload,
  type FvtCheck,
  type FvtRun,
  type FvtStoreLike,
  FVT_INGEST_PATH,
  type RunSummary,
  mountFvt,
  parseRun,
  tally,
} from '../src/server/fvt.js';

/**
 * Real RS256 keys and a real Express app, same convention and same reason as content.test.ts: the
 * cases worth testing here are about MIDDLEWARE COMPOSITION and token verification, and a stubbed
 * verifier would assert exactly the bugs we care about out of existence. An alg-confusion token has
 * to meet the real `algorithms: ['RS256']` pin to prove anything.
 *
 * Postgres is the one thing faked — it is the only dependency on this path that cannot be made real
 * here — through the FvtStoreLike seam the module exports for it.
 */

const ISSUER = 'https://auth.test/issue';
const AUDIENCE = 'platform';

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let priv: Pair['privateKey'];
let jwksKeys: { keys: JWK[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  priv = pair.privateKey;
  jwksKeys = { keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256', use: 'sig' }] };
});

/** A genuine signed token. `admin` is a claim, so a non-admin and an admin differ only in the claim. */
async function token(opts: { admin?: boolean; username?: string; issuer?: string } = {}) {
  return new SignJWT({ admin: opts.admin ?? false, username: opts.username ?? 'fvt-runner' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('sub-123')
    .setExpirationTime('5m')
    .sign(priv);
}

function env(over: Partial<Env> = {}): Env {
  return {
    port: 3000,
    vmcpApiBase: '',
    discordWebhookUrl: '',
    helloRateMax: 5,
    helloRateWindowSeconds: 3600,
    authJwksUri: 'https://auth.test/.well-known/jwks.json',
    authIssuer: ISSUER,
    authAudience: AUDIENCE,
    contentDir: '/tmp/does-not-matter',
    uploadMaxBytes: 1024,
    databaseUrl: 'postgres://u:p@db:5432/fvt',
    fvtRetentionDays: 30,
    ...over,
  };
}

/** Records what it was asked to store, so a test can assert on the runner the guard derived. */
class FakeStore implements FvtStoreLike {
  recorded: { run: FvtRun; runner: string }[] = [];
  runs: RunSummary[] = [];
  checks: FvtCheck[] = [];
  failWith: Error | null = null;

  async init(): Promise<void> {}
  async record(run: FvtRun, runner: string) {
    if (this.failWith) throw this.failWith;
    this.recorded.push({ run, runner });
    return { id: this.recorded.length, pruned: 0 };
  }
  async recentRuns(limit: number): Promise<RunSummary[]> {
    if (this.failWith) throw this.failWith;
    return this.runs.slice(0, limit);
  }
  async checksFor(_runId: string): Promise<FvtCheck[]> {
    if (this.failWith) throw this.failWith;
    return this.checks;
  }
}

/**
 * Mirrors index.ts's middleware composition EXACTLY — the tiny global JSON parser, and the path
 * exclusion that lets the ingest bring its own.
 *
 * This used to mount a permissive `express.json({limit:'256kb'})` instead, which quietly made the
 * tests useless for the bug that actually shipped: the real app caps bodies at 2kb globally, so a
 * genuine 24-check run was rejected with PayloadTooLargeError before reaching any handler. Every
 * test here passed. If a test app's middleware stack differs from the real one, the tests are about
 * a server that does not exist.
 */
function appWith(store: FvtStoreLike, e: Env = env()): Express {
  const app = express();
  const smallJson = express.json({ limit: '2kb' });
  app.use((req, res, next) => (req.path === FVT_INGEST_PATH ? next() : smallJson(req, res, next)));
  mountFvt(app, { env: e, store, jwks: createLocalJWKSet(jwksKeys) });
  return app;
}

/** A run with enough checks to exceed the 2kb global cap — the size a real sweep actually is. */
function bigRun(checks = 24) {
  return {
    ...goodRun(),
    checks: Array.from({ length: checks }, (_, i) => ({
      service: ['home', 'quiz', 'job-searcher', 'vmcp', 'auth'][i % 5],
      name: `GET /some/reasonably-descriptive/path number ${i} returns 200`,
      status: i % 7 === 0 ? 'fail' : 'pass',
      durationMs: 100 + i,
      detail: i % 7 === 0 ? 'x'.repeat(400) : null,
    })),
  };
}

const goodRun = () => ({
  suite: 'platform-sanity',
  target: 'https://andres.project-platform.me',
  runId: 'run-1',
  startedAt: '2026-09-14T01:00:00.000Z',
  finishedAt: '2026-09-14T01:00:42.000Z',
  checks: [
    { service: 'home', name: 'GET / is 200', status: 'pass', durationMs: 120, detail: null },
    { service: 'quiz', name: 'GET /quiz is 200', status: 'fail', durationMs: 90, detail: 'got 502' },
  ],
});

describe('parseRun', () => {
  test('accepts a well-formed run and normalises its timestamps', () => {
    const run = parseRun(goodRun());
    expect(run.runId).toBe('run-1');
    expect(run.checks).toHaveLength(2);
    expect(run.startedAt).toBe('2026-09-14T01:00:00.000Z');
  });

  test.each([
    ['a non-object body', 'nope'],
    ['an array body', []],
  ])('rejects %s', (_label, body) => {
    expect(() => parseRun(body)).toThrow(BadPayload);
  });

  test('rejects an unknown status', () => {
    const b = goodRun();
    b.checks[0].status = 'flaky';
    expect(() => parseRun(b)).toThrow(/status must be one of/);
  });

  test('rejects a negative duration', () => {
    const b = goodRun();
    b.checks[0].durationMs = -1;
    expect(() => parseRun(b)).toThrow(/non-negative/);
  });

  test('rejects a run that finished before it started', () => {
    const b = goodRun();
    b.finishedAt = '2026-09-14T00:59:00.000Z';
    expect(() => parseRun(b)).toThrow(/must not be before/);
  });

  test('rejects an empty check list', () => {
    const b = goodRun();
    b.checks = [];
    expect(() => parseRun(b)).toThrow(/must not be empty/);
  });

  test('bounds how much one run can write', () => {
    // 300, chosen so the worst case a run can legally contain (checks × detail length) stays under
    // the route's 1mb body cap — a payload should be refused by the named check that explains
    // itself, not by a 413 the runner cannot act on. The real sweep is ~24 checks.
    const b = goodRun();
    b.checks = Array.from({ length: 301 }, () => ({
      service: 's',
      name: 'n',
      status: 'pass',
      durationMs: 1,
      detail: null,
    }));
    expect(() => parseRun(b)).toThrow(/at most 300/);
  });
});

describe('tally', () => {
  test('counts each status', () => {
    const checks = [
      { service: 'a', name: 'x', status: 'pass', durationMs: 1, detail: null },
      { service: 'a', name: 'y', status: 'fail', durationMs: 1, detail: 'bad' },
      { service: 'a', name: 'z', status: 'skip', durationMs: 0, detail: null },
      { service: 'a', name: 'w', status: 'pass', durationMs: 1, detail: null },
    ] satisfies FvtCheck[];
    expect(tally(checks)).toEqual({ passed: 2, failed: 1, skipped: 1 });
  });
});

describe('mounting', () => {
  test('registers nothing without a database — the route does not exist, it is not disabled', async () => {
    const app = appWith(new FakeStore(), env({ databaseUrl: '' }));
    const res = await request(app).post('/api/fvt/results').send(goodRun());
    expect(res.status).toBe(404);
  });

  test('registers nothing without a way to verify tokens', async () => {
    const app = appWith(new FakeStore(), env({ authJwksUri: '' }));
    expect((await request(app).get('/api/fvt/runs')).status).toBe(404);
  });
});

describe('POST /api/fvt/results', () => {
  let store: FakeStore;
  let app: Express;
  beforeEach(() => {
    store = new FakeStore();
    app = appWith(store);
  });

  test('refuses an unauthenticated post', async () => {
    const res = await request(app).post('/api/fvt/results').send(goodRun());
    expect(res.status).toBe(401);
    expect(store.recorded).toHaveLength(0);
  });

  test('accepts a non-admin identity — posting a run is not a privileged act', async () => {
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token({ admin: false })}`)
      .send(goodRun());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ passed: 1, failed: 1, skipped: 0 });
    expect(store.recorded).toHaveLength(1);
  });

  test('records the username from the token, not from the body', async () => {
    await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token({ username: 'nightly-runner' })}`)
      .send({ ...goodRun(), runner: 'i-say-i-am-someone-else' });
    expect(store.recorded[0].runner).toBe('nightly-runner');
  });

  test('rejects a token from another issuer', async () => {
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token({ issuer: 'https://evil.test/issue' })}`)
      .send(goodRun());
    expect(res.status).toBe(401);
    expect(store.recorded).toHaveLength(0);
  });

  test('a bad payload is 400, not 500 — the caller can fix that one', async () => {
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token()}`)
      .send({ ...goodRun(), checks: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must not be empty/);
  });

  test('accepts a realistically-sized run — the case the 2kb global parser rejected', async () => {
    // The regression test for the bug this suite failed to catch: a real sweep is ~24 checks with
    // failure text, comfortably over the app-wide 2kb cap. It must reach the handler, not 413.
    const run = bigRun(24);
    expect(JSON.stringify(run).length).toBeGreaterThan(2048); // the payload really is over the cap
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token()}`)
      .send(run);
    expect(res.status).toBe(201);
    expect(store.recorded[0].run.checks).toHaveLength(24);
  });

  test('still caps a body far beyond any real run', async () => {
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token()}`)
      .send({ ...goodRun(), suite: 'x'.repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });

  test('a storage failure is 503 — distinguishable from a bad payload, and worth retrying', async () => {
    store.failWith = new Error('connection refused');
    const res = await request(app)
      .post('/api/fvt/results')
      .set('authorization', `Bearer ${await token()}`)
      .send(goodRun());
    expect(res.status).toBe(503);
  });
});

describe('reads are admin-only', () => {
  let store: FakeStore;
  let app: Express;
  beforeEach(() => {
    store = new FakeStore();
    app = appWith(store);
  });

  test('a verified non-admin is 403 — we know exactly who you are, and no', async () => {
    const res = await request(app)
      .get('/api/fvt/runs')
      .set('authorization', `Bearer ${await token({ admin: false })}`);
    expect(res.status).toBe(403);
  });

  test('no token at all is 401', async () => {
    expect((await request(app).get('/api/fvt/runs')).status).toBe(401);
  });

  test('an admin reads the history', async () => {
    store.runs = [
      {
        runId: 'run-1',
        suite: 'platform-sanity',
        target: 'https://x.test',
        runner: 'fvt-runner',
        startedAt: '2026-09-14T01:00:00.000Z',
        finishedAt: '2026-09-14T01:00:42.000Z',
        passed: 1,
        failed: 1,
        skipped: 0,
      },
    ];
    const res = await request(app)
      .get('/api/fvt/runs')
      .set('authorization', `Bearer ${await token({ admin: true })}`);
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(1);
  });

  test('an unknown run is 404, not an empty success', async () => {
    const res = await request(app)
      .get('/api/fvt/runs/nope')
      .set('authorization', `Bearer ${await token({ admin: true })}`);
    expect(res.status).toBe(404);
  });
});
