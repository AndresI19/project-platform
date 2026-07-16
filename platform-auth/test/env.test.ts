import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization tests for src/env.ts: the admin-list parse (split / trim / lowercase / dedup), the
 * case-insensitive isAdmin(), and the PEM `\n` un-escaping. env.ts resolves everything ONCE at import,
 * so each scenario resets the module registry and re-imports with a fresh process.env.
 */

// The always-required floor: without these env.ts throws at import before we can assert anything else.
const BASE = {
  DATABASE_URL: 'postgres://unused',
  AUTH_SIGNING_KEY: 'x', // env.ts only checks min(1); it is parsed as PEM later, in tokens.ts
  AUTH_CODE_PEPPER: 'p'.repeat(32),
};

async function loadEnv(overrides: Record<string, string>): Promise<typeof import('../src/env.js').env> {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('AUTH_')) delete process.env[k];
  }
  Object.assign(process.env, BASE, overrides);
  vi.resetModules();
  return (await import('../src/env.js')).env;
}

afterEach(() => {
  vi.resetModules();
});

describe('admin-list parse', () => {
  it('splits on commas, trims, lowercases and de-duplicates', async () => {
    const env = await loadEnv({ AUTH_ADMINS: 'Andres, zezima ,ANDRES,, bob ' });
    // 'Andres' and 'ANDRES' collapse to one; the empty field between the commas is dropped.
    expect(env.adminCount).toBe(3);
    expect(env.isAdmin('andres')).toBe(true);
    expect(env.isAdmin('zezima')).toBe(true);
    expect(env.isAdmin('bob')).toBe(true);
  });

  it('an empty list means nobody is an admin', async () => {
    const env = await loadEnv({ AUTH_ADMINS: '' });
    expect(env.adminCount).toBe(0);
    expect(env.isAdmin('andres')).toBe(false);
    expect(env.isAdmin('')).toBe(false);
  });

  it('defaults to empty when AUTH_ADMINS is unset', async () => {
    const env = await loadEnv({}); // no AUTH_ADMINS at all
    expect(env.adminCount).toBe(0);
    expect(env.isAdmin('anyone')).toBe(false);
  });

  it('a list of only separators and blanks yields no admins', async () => {
    const env = await loadEnv({ AUTH_ADMINS: ' , , ,' });
    expect(env.adminCount).toBe(0);
  });

  it('counts case-collapsed duplicates once', async () => {
    const env = await loadEnv({ AUTH_ADMINS: 'a,A,a,B,b' });
    expect(env.adminCount).toBe(2); // {a, b}
  });
});

describe('isAdmin(username)', () => {
  it('is case-insensitive on the QUERY as well as on the stored list', async () => {
    const env = await loadEnv({ AUTH_ADMINS: 'andres' });
    expect(env.isAdmin('ANDRES')).toBe(true);
    expect(env.isAdmin('Andres')).toBe(true);
    expect(env.isAdmin('andres')).toBe(true);
    expect(env.isAdmin('mallory')).toBe(false);
  });
});

describe('PEM \\n un-escaping', () => {
  it('turns literal backslash-n (as a k8s secret ships it) into real newlines', async () => {
    const env = await loadEnv({ AUTH_SIGNING_KEY: '-----BEGIN-----\\nMIIB\\nline3\\n-----END-----' });
    expect(env.signingKeyPem).toBe('-----BEGIN-----\nMIIB\nline3\n-----END-----');
    expect(env.signingKeyPem).not.toContain('\\n');
    expect(env.signingKeyPem.split('\n')).toHaveLength(4);
  });

  it('leaves an already-real-newline PEM unchanged', async () => {
    const env = await loadEnv({ AUTH_SIGNING_KEY: 'a\nb' });
    expect(env.signingKeyPem).toBe('a\nb');
  });
});
