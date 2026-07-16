import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization tests for the security endpoints in src/routes/auth.ts. They pin the CURRENT
 * behaviour of sign-up, sign-in and /me before a behaviour-preserving refactor. No real Postgres and
 * no real scrypt: the drizzle `db` layer and the two slow crypto primitives (hashPassword,
 * verifyPassword) are mocked at the import seam so hit / miss / conflict are forced deterministically.
 * The validators (isValidUsername / isValidPassword / normaliseUsername) and the token layer (real
 * mint + real RS256 verification) are left REAL, so the validator contract and /me are exercised for
 * real.
 */

// The signing key and pepper must exist before env.ts is imported — it validates at module load, on
// purpose, so a misconfigured deploy dies at boot instead of on somebody's first sign-in.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.AUTH_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.AUTH_CODE_PEPPER = 'p'.repeat(32);
process.env.DATABASE_URL = 'postgres://unused';
process.env.AUTH_RATE_MAX = '3';

// A drizzle stand-in: every query is a chain of no-op builder methods that finally resolves to a
// per-test result. `select` chains resolve to `selectResult`, `insert` chains to `insertResult`, and
// `update` chains to nothing. Both `.then` (await) and `.catch` (used by audit) are implemented.
const seam = vi.hoisted(() => {
  const state = { selectResult: [] as unknown[], insertResult: [] as unknown[] };
  const chainMethods = ['values', 'onConflictDoNothing', 'returning', 'from', 'where', 'limit', 'set'];
  type Fulfil = ((v: unknown) => unknown) | null | undefined;
  type Reject = ((e: unknown) => unknown) | null | undefined;
  const makeChain = (getResult: () => unknown): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of chainMethods) chain[m] = () => chain;
    // biome-ignore lint/suspicious/noThenProperty: the stand-in is deliberately thenable, like a drizzle builder
    chain.then = (onF: Fulfil, onR: Reject) => Promise.resolve(getResult()).then(onF, onR);
    chain.catch = (onR: Reject) => Promise.resolve(getResult()).catch(onR);
    chain.finally = (f: (() => void) | null | undefined) => Promise.resolve(getResult()).finally(f);
    return chain;
  };
  const db = {
    insert: () => makeChain(() => state.insertResult),
    select: () => makeChain(() => state.selectResult),
    update: () => makeChain(() => undefined),
  };
  return { state, db };
});

vi.mock('../src/db/client.js', () => ({ db: seam.db, pool: {} }));

// Partial mock: keep the real validators / normaliser (their behaviour is part of the contract under
// test), replace only the two slow scrypt primitives with deterministic fakes.
const crypto = vi.hoisted(() => ({ verifyResult: { ok: false } }));
vi.mock('../src/credential.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/credential.js')>();
  return {
    ...actual,
    hashPassword: vi.fn(async (password: string) => `HASH:${password}`),
    verifyPassword: vi.fn(async () => crypto.verifyResult.ok),
  };
});

const { authRouter } = await import('../src/routes/auth.js');
const { mint } = await import('../src/tokens.js');
const { verifyPassword } = await import('../src/credential.js');
const verifyMock = vi.mocked(verifyPassword);

// The hash the sign-in miss-path burns to stay timing-constant: hashPassword('timing-equaliser', …)
// through the mock above.
const DUMMY_HASH = 'HASH:timing-equaliser';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '8kb' }));
app.use('/auth', authRouter);

let base: string;
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  seam.state.selectResult = [];
  seam.state.insertResult = [];
  crypto.verifyResult.ok = false;
  verifyMock.mockClear();
});

let ipCounter = 0;
/** Each call gets a fresh forwarded IP, so the in-process rate-limit Map buckets tests apart. */
function freshIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

interface CallResult {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: response body shape is what we assert
  body: any;
  headers: Headers;
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; ip?: string; auth?: string } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = { 'x-forwarded-for': opts.ip ?? freshIp() };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth) headers.authorization = opts.auth;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

describe('POST /auth/identities (sign up)', () => {
  it('201 with { username, token, expiresIn } when the name is free', async () => {
    seam.state.insertResult = [{ id: 'id-abc', username: 'andres' }];
    const res = await call('POST', '/auth/identities', { body: { username: 'andres', password: 'pw1234' } });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('andres');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3); // a real signed JWT, shape only
    expect(typeof res.body.expiresIn).toBe('number');
  });

  it('409 { error, username } when onConflictDoNothing returns no row (name taken)', async () => {
    seam.state.insertResult = []; // conflict → nothing inserted → no returned row
    const res = await call('POST', '/auth/identities', { body: { username: 'andres', password: 'pw1234' } });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username taken', username: 'andres' });
  });

  it('400 generic body error when the payload is not { username, password }', async () => {
    const res = await call('POST', '/auth/identities', { body: { username: 'andres' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'provide { username, password }' });
  });

  it('400 invalid-username when the username fails the validator', async () => {
    // 'ab' clears the zod min(1) but fails isValidUsername (needs 3–20 chars).
    const res = await call('POST', '/auth/identities', { body: { username: 'ab', password: 'pw1234' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid username');
    expect(res.body.detail).toContain('3–20 characters');
  });

  it('400 invalid-pin when the password is below the 4-char floor', async () => {
    const res = await call('POST', '/auth/identities', { body: { username: 'andres', password: 'abc' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid pin', detail: '4–128 characters' });
  });

  it('429 once the per-IP window is exceeded (rate-limit path)', async () => {
    const ip = freshIp();
    // AUTH_RATE_MAX = 3: the first three are under the cap (they fall through to a 400), the fourth trips.
    for (let i = 0; i < 3; i += 1) {
      const under = await call('POST', '/auth/identities', { body: {}, ip });
      expect(under.status).toBe(400);
    }
    const over = await call('POST', '/auth/identities', { body: {}, ip });
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'too many requests' });
  });
});

describe('POST /auth/token (sign in)', () => {
  it('returns { token, expiresIn, username } on a hit', async () => {
    seam.state.selectResult = [{ id: 'id-abc', username: 'andres', passwordHash: 'HASH:pw1234' }];
    crypto.verifyResult.ok = true;
    const res = await call('POST', '/auth/token', { body: { username: 'andres', password: 'pw1234' } });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('andres');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(typeof res.body.expiresIn).toBe('number');
  });

  it('generic-deny invariant: unknown username and wrong password return the SAME 401 body', async () => {
    // Miss: no row. The handler must still resolve a deny with the generic message.
    seam.state.selectResult = [];
    crypto.verifyResult.ok = false;
    const miss = await call('POST', '/auth/token', { body: { username: 'ghost', password: 'pw1234' } });

    // Wrong password: the row exists, but verify says no.
    seam.state.selectResult = [{ id: 'id-abc', username: 'andres', passwordHash: 'HASH:real' }];
    crypto.verifyResult.ok = false;
    const wrong = await call('POST', '/auth/token', { body: { username: 'andres', password: 'nope1' } });

    expect(miss.status).toBe(401);
    expect(wrong.status).toBe(401);
    // No oracle: identical status AND identical body for "no such user" vs "wrong password".
    expect(miss.body).toEqual({ error: 'unknown username or password' });
    expect(wrong.body).toEqual(miss.body);
  });

  it('timing-equaliser: a miss still burns exactly one hash, against the DUMMY_HASH', async () => {
    // Structural (not wall-clock) proof of the equaliser: even with no row, verifyPassword is invoked
    // once, and against the throwaway dummy hash — so a miss costs the same scrypt derivation a hit does.
    seam.state.selectResult = [];
    crypto.verifyResult.ok = false;
    await call('POST', '/auth/token', { body: { username: 'ghost', password: 'pw1234' } });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock.mock.calls[0]?.[0]).toBe(DUMMY_HASH); // hashed against the dummy, not a real row
  });

  it('a hit verifies against the ROW hash, not the dummy', async () => {
    seam.state.selectResult = [{ id: 'id-abc', username: 'andres', passwordHash: 'HASH:real' }];
    crypto.verifyResult.ok = true;
    await call('POST', '/auth/token', { body: { username: 'andres', password: 'pw1234' } });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock.mock.calls[0]?.[0]).toBe('HASH:real');
  });

  it('an invalid username shape denies WITHOUT a db read (same 401), still generic', async () => {
    // isValidUsername fails first, so deny() runs before any select — and verifyPassword is never called.
    const res = await call('POST', '/auth/token', { body: { username: 'ab', password: 'pw1234' } });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unknown username or password' });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('400 (not 401) when the body itself is malformed', async () => {
    const res = await call('POST', '/auth/token', { body: { username: 'andres' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'provide { username, password }' });
  });
});

describe('GET /auth/me', () => {
  it('verifies a real bearer and echoes sub / username / exp', async () => {
    const { token } = await mint({ sub: 'id-abc', username: 'andres' });
    const res = await call('GET', '/auth/me', { auth: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe('id-abc');
    expect(res.body.username).toBe('andres');
    expect(typeof res.body.exp).toBe('number');
  });

  it('401 { error: "no token" } with a WWW-Authenticate challenge when no header is sent', async () => {
    const res = await call('GET', '/auth/me', {});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'no token' });
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('401 { error: "invalid token" } for a bearer that does not verify', async () => {
    const res = await call('GET', '/auth/me', { auth: 'Bearer not.a.jwt' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid token' });
  });
});
