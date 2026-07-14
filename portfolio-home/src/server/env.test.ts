import { describe, expect, test } from 'vitest';
import { loadEnv } from './env.js';

/**
 * The config guards. Every variable is optional — the app must run with an empty environment — but a
 * value that is SET and WRONG has to fail at boot with the variable named, not misbehave silently at
 * request time.
 */

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';

describe('an empty environment is valid', () => {
  test('defaults: port 3000, same-origin API, greetings logged not relayed', () => {
    expect(loadEnv({})).toEqual({ port: 3000, vmcpApiBase: '', discordWebhookUrl: '' });
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
