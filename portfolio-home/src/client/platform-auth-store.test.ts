import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../../packages/platform-ui/src/auth.js';

/**
 * Characterization tests for the shared client identity/token store (packages/platform-ui/src/auth.ts).
 * This module is public API consumed by the quiz — these tests only PIN its current behaviour, they do
 * not change it. The reachable seams from the exports are fetch (mocked) and localStorage (the memory
 * store installed by test/setup.ts). They exercise: token() silent re-mint near expiry, and the
 * base64url decode used by adopt()/claims() via signIn/signUp. `claims` and `adopt` are not exported,
 * so they are pinned through the exported calls that drive them.
 */

/** Build a JWT whose payload base64url deliberately contains BOTH '-' and '_', so the decode path's
 *  url-safe → standard translation (replace -→+, _→/) is genuinely exercised, not bypassed. */
function jwtWith(payload: Record<string, unknown>): string {
  const seg = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${seg}.signature`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  auth.signOut(); // clears module identity + localStorage
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sign-in adopt() + base64url claims decode', () => {
  it('decodes a url-safe payload (containing - and _) and reads admin:true from the signed token', async () => {
    const token = jwtWith({ admin: true, username: '>>>???' });
    expect(token.split('.')[1]).toMatch(/[-_]/); // guard: the payload really is url-safe-encoded
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'andres', token, expiresIn: 86400 }),
    });

    await auth.signIn('andres', 'pw1234');

    const id = auth.current();
    expect(id?.mode).toBe('user');
    expect(id?.username).toBe('andres');
    expect(id?.token).toBe(token);
    expect(id?.password).toBe('pw1234'); // stored, by design, to allow silent re-mint
    expect(id?.admin).toBe(true); // read from the token, not from anything the client said
    expect(auth.isAdmin()).toBe(true);
    expect(auth.isSignedIn()).toBe(true);
  });

  it('admin is false when the token omits the claim, and expiresAt is now + expiresIn*1000', async () => {
    const token = jwtWith({ username: 'andres' }); // no admin claim
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'andres', token, expiresIn: 100 }),
    });
    const before = Date.now();
    await auth.signIn('andres', 'pw1234');
    const after = Date.now();

    const id = auth.current();
    expect(id?.admin).toBe(false);
    expect(auth.isAdmin()).toBe(false);
    expect(id?.expiresAt).toBeGreaterThanOrEqual(before + 100_000);
    expect(id?.expiresAt).toBeLessThanOrEqual(after + 100_000);
  });

  it('a malformed token decodes to no claims, so admin is false (decode never throws)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'andres', token: 'not-a-jwt', expiresIn: 86400 }),
    });
    await auth.signIn('andres', 'pw1234');
    expect(auth.current()?.admin).toBe(false);
  });

  it('signUp adopts the same way and returns the username', async () => {
    const token = jwtWith({ admin: true, username: '>>>???' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'zezima', token, expiresIn: 86400 }),
    });
    const out = await auth.signUp('zezima', 'pw1234');
    expect(out).toEqual({ username: 'zezima' });
    expect(auth.current()?.username).toBe('zezima');
    expect(auth.isAdmin()).toBe(true);
  });

  it('surfaces the server error message on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'username taken' }) });
    await expect(auth.signUp('taken', 'pw1234')).rejects.toThrow('username taken');
  });
});

describe('token() silent re-mint', () => {
  it('returns the existing token untouched when it is comfortably before expiry', async () => {
    const token = jwtWith({ username: 'andres' });
    auth.setIdentity({
      mode: 'user',
      username: 'andres',
      password: 'pw1234',
      token,
      expiresAt: Date.now() + 3_600_000, // an hour out — well past the 60s skew window
    });
    const t = await auth.token();
    expect(t).toBe(token);
    expect(fetchMock).not.toHaveBeenCalled(); // no re-mint when the token is fresh
  });

  it('silently re-mints via signIn when within 60s of expiry, using the stored password', async () => {
    const fresh = jwtWith({ username: 'andres', v: 2 });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'andres', token: fresh, expiresIn: 86400 }),
    });
    auth.setIdentity({
      mode: 'user',
      username: 'andres',
      password: 'stored-pw',
      token: jwtWith({ username: 'andres', v: 1 }),
      expiresAt: Date.now() + 30_000, // inside the 60s window → must re-mint
    });

    const t = await auth.token();
    expect(t).toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The re-mint hits the sign-in endpoint with the stored credentials.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/auth/token');
    expect(JSON.parse(init.body)).toEqual({ username: 'andres', password: 'stored-pw' });
  });

  it('returns null (not a throw) when a near-expiry re-mint fails at the network', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'nope' }) });
    auth.setIdentity({
      mode: 'user',
      username: 'andres',
      password: 'stored-pw',
      token: jwtWith({ username: 'andres' }),
      expiresAt: Date.now() + 30_000,
    });
    expect(await auth.token()).toBeNull();
  });

  it('returns null when there is no stored password to re-mint with', async () => {
    auth.setIdentity({
      mode: 'user',
      username: 'andres',
      token: jwtWith({ username: 'andres' }),
      expiresAt: Date.now() + 30_000, // near expiry, but nothing to re-mint from
    });
    expect(await auth.token()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for a guest or when nobody is signed in', async () => {
    expect(await auth.token()).toBeNull(); // signed out in beforeEach
    auth.continueAsGuest();
    expect(await auth.token()).toBeNull();
  });
});

describe('authFetch()', () => {
  it('attaches a fresh bearer when there is a live token', async () => {
    const token = jwtWith({ username: 'andres' });
    auth.setIdentity({
      mode: 'user',
      username: 'andres',
      password: 'pw1234',
      token,
      expiresAt: Date.now() + 3_600_000,
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await auth.authFetch('/api/thing', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${token}`);
  });

  it('returns null without calling fetch when there is no identity', async () => {
    expect(await auth.authFetch('/api/thing')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
