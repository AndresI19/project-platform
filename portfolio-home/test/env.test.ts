import { describe, expect, test } from 'vitest';
import { loadEnv } from '../src/server/env.js';

/**
 * The config guards. Every variable is optional — the app must run with an empty environment — but a
 * value that is SET and WRONG has to fail at boot with the variable named, not misbehave silently at
 * request time.
 */

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';

describe('an empty environment is valid', () => {
  test('defaults: port 3000, same-origin API, greetings logged not relayed, 5/hour cap', () => {
    expect(loadEnv({})).toEqual({
      port: 3000,
      vmcpApiBase: '',
      discordWebhookUrl: '',
      helloRateMax: 5,
      helloRateWindowSeconds: 3600,
      // Empty auth is not a gap to be filled in later — it is the mode that keeps `npm run dev` a
      // single command, and it is what makes mountContent register no upload route at all.
      authJwksUri: '',
      authIssuer: '',
      authAudience: 'platform',
      contentDir: '/content',
      uploadMaxBytes: 5 * 1024 * 1024,
    });
  });
});

describe('AUTH_*', () => {
  test('a JWKS URI keeps its path — it is not an origin', () => {
    const uri = 'http://platform-auth:8002/.well-known/jwks.json';
    expect(loadEnv({ AUTH_JWKS_URI: uri, AUTH_ISSUER: 'https://api.example/auth' }).authJwksUri).toBe(uri);
  });

  test('AUTH_ISSUER is required once AUTH_JWKS_URI is set', () => {
    // The failure this prevents is the quiet one: a JWKS URI with no issuer verifies the signature and
    // then accepts ANY issuer's token — a guard that looks configured and checks nothing about who
    // minted the claim. Half-set is a mistake, and it belongs at boot with the variable named.
    expect(() => loadEnv({ AUTH_JWKS_URI: 'http://platform-auth:8002/.well-known/jwks.json' })).toThrow(
      /AUTH_ISSUER/,
    );
  });

  test('an issuer without a JWKS URI is simply unconfigured, not an error', () => {
    // Only the pairing is invalid. An issuer alone cannot verify anything, so there is nothing to
    // half-configure: the route is not registered either way.
    expect(loadEnv({ AUTH_ISSUER: 'https://api.example/auth' }).authJwksUri).toBe('');
  });

  test.each(['not-a-url', 'ftp://platform-auth/jwks.json', '//platform-auth/jwks.json'])(
    'rejects AUTH_JWKS_URI=%s by name',
    (bad) => {
      expect(() => loadEnv({ AUTH_JWKS_URI: bad })).toThrow(/AUTH_JWKS_URI/);
    },
  );

  test('AUTH_AUDIENCE defaults to platform', () => {
    expect(loadEnv({}).authAudience).toBe('platform');
    expect(loadEnv({ AUTH_AUDIENCE: 'other' }).authAudience).toBe('other');
  });
});

describe('CONTENT_DIR / UPLOAD_MAX_BYTES', () => {
  test('defaults to the volume mount, and strips a trailing slash', () => {
    expect(loadEnv({}).contentDir).toBe('/content');
    expect(loadEnv({ CONTENT_DIR: '/mnt/content/' }).contentDir).toBe('/mnt/content');
  });

  test('a relative CONTENT_DIR fails by name', () => {
    expect(() => loadEnv({ CONTENT_DIR: 'content' })).toThrow(/CONTENT_DIR/);
  });

  test('a CONTENT_DIR that does not exist is fine — that is a dev checkout', () => {
    // Existence is deliberately unchecked: /content is a Kubernetes volume, and requiring one to boot
    // would make `npm start` need a cluster.
    expect(loadEnv({ CONTENT_DIR: '/no/such/place' }).contentDir).toBe('/no/such/place');
  });

  test.each(['0', '-1', 'abc', '1.5'])('rejects UPLOAD_MAX_BYTES=%s by name', (bad) => {
    expect(() => loadEnv({ UPLOAD_MAX_BYTES: bad })).toThrow(/UPLOAD_MAX_BYTES/);
  });
});

describe('PORT', () => {
  test('accepts a valid port', () => {
    expect(loadEnv({ PORT: '8080' }).port).toBe(8080);
  });

  test.each(['abc', '0', '70000', '3000.5', '-1'])('rejects %s', (bad) => {
    expect(() => loadEnv({ PORT: bad })).toThrow(/PORT/);
  });
});

describe('HELLO_RATE_MAX / HELLO_RATE_WINDOW', () => {
  test('override the greeting cap', () => {
    const env = loadEnv({ HELLO_RATE_MAX: '20', HELLO_RATE_WINDOW: '600' });
    expect(env.helloRateMax).toBe(20);
    expect(env.helloRateWindowSeconds).toBe(600);
  });

  test.each(['abc', '0', '-1', '2.5'])('reject %s for HELLO_RATE_MAX', (bad) => {
    expect(() => loadEnv({ HELLO_RATE_MAX: bad })).toThrow(/HELLO_RATE_MAX/);
  });

  test.each(['abc', '0', '-1', '2.5'])('reject %s for HELLO_RATE_WINDOW', (bad) => {
    expect(() => loadEnv({ HELLO_RATE_WINDOW: bad })).toThrow(/HELLO_RATE_WINDOW/);
  });
});

describe('VMCP_API_BASE', () => {
  test('accepts an absolute origin', () => {
    expect(loadEnv({ VMCP_API_BASE: 'https://api.example.com' }).vmcpApiBase).toBe('https://api.example.com');
  });

  test('strips a trailing slash — it would otherwise build //api/servers', () => {
    expect(loadEnv({ VMCP_API_BASE: 'https://api.example.com/' }).vmcpApiBase).toBe(
      'https://api.example.com',
    );
  });

  test('rejects a bare hostname, which is the typo that used to fail silently', () => {
    expect(() => loadEnv({ VMCP_API_BASE: 'api.example.com' })).toThrow(/VMCP_API_BASE/);
  });

  test('rejects a path — the probes need an origin to prefix', () => {
    expect(() => loadEnv({ VMCP_API_BASE: '/vmcp/api' })).toThrow(/VMCP_API_BASE/);
  });

  test('empty means same-origin, which is the local deployment', () => {
    expect(loadEnv({ VMCP_API_BASE: '' }).vmcpApiBase).toBe('');
  });
});

describe('DISCORD_WEBHOOK_URL', () => {
  test('accepts a Discord webhook', () => {
    expect(loadEnv({ DISCORD_WEBHOOK_URL: WEBHOOK }).discordWebhookUrl).toBe(WEBHOOK);
  });

  test('rejects http — the URL itself is the credential', () => {
    expect(() => loadEnv({ DISCORD_WEBHOOK_URL: 'http://discord.com/api/webhooks/1/x' })).toThrow(/https/);
  });

  test('rejects a URL that is not a webhook, rather than POSTing greetings at it', () => {
    expect(() => loadEnv({ DISCORD_WEBHOOK_URL: 'https://example.com/hook' })).toThrow(/Discord webhook/);
  });

  test('NEVER puts the value in the error message — the URL is the secret', () => {
    // A malformed webhook is still a webhook: it may be a real, working credential that was simply
    // pasted with a typo. Echoing it into a log or a crash trace would publish it.
    const leaky = 'https://example.com/api/hooks/REAL-LOOKING-TOKEN-abc123';
    expect(() => loadEnv({ DISCORD_WEBHOOK_URL: leaky })).toThrow(/<redacted>/);
    expect(() => loadEnv({ DISCORD_WEBHOOK_URL: leaky })).not.toThrow(/REAL-LOOKING-TOKEN/);
  });
});
