/**
 * The server's entire configuration surface, validated once at boot.
 *
 * Every one of these is optional — the app runs with an empty environment — but a value that IS set
 * and is wrong should fail here, loudly, with the variable named. The alternative is what this
 * replaces: a typo in VMCP_API_BASE meant the liveness probes quietly fetched a nonsense URL and
 * every badge sat at "offline" with nothing in the log to say why.
 */

export interface Env {
  /** Port the server listens on. */
  port: number;
  /**
   * Absolute origin of the vMCP data API, or '' for same-origin (`/vmcp/api`, the local default).
   * Served to the browser at /api/config, so the same image runs locally and in production.
   */
  vmcpApiBase: string;
  /** Discord webhook that receives the optional "who are you?" greeting. Empty = log it instead. */
  discordWebhookUrl: string;
}

function fail(name: string, value: string, why: string): never {
  // Never print the value of a secret. The webhook URL *is* the credential — anyone holding it can
  // post to the channel — so a bad one is reported by name and shape, not by content.
  const shown = name === 'DISCORD_WEBHOOK_URL' ? '<redacted>' : JSON.stringify(value);
  throw new Error(`Invalid ${name}=${shown}: ${why}`);
}

/** An absolute http(s) origin, e.g. https://api-andres.example — not a path, not a bare hostname. */
function absoluteOrigin(name: string, raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(name, value, 'must be an absolute URL (e.g. https://api.example.com), or unset for same-origin');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail(name, value, `must be http or https, got "${url.protocol}"`);
  }
  // A trailing slash here would produce '//api/servers' when a path is appended.
  return value.replace(/\/+$/, '');
}

function webhook(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('DISCORD_WEBHOOK_URL', value, 'must be an absolute URL');
  }
  if (url.protocol !== 'https:') {
    return fail('DISCORD_WEBHOOK_URL', value, 'must be https — a webhook is a credential in the URL');
  }
  if (!url.pathname.includes('/api/webhooks/')) {
    return fail('DISCORD_WEBHOOK_URL', value, 'does not look like a Discord webhook (expected /api/webhooks/… in the path)');
  }
  return value;
}

function port(raw: string | undefined): number {
  if (!raw) return 3000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return fail('PORT', raw, 'must be an integer between 1 and 65535');
  }
  return n;
}

export function loadEnv(e: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: port(e.PORT),
    vmcpApiBase: absoluteOrigin('VMCP_API_BASE', e.VMCP_API_BASE ?? ''),
    discordWebhookUrl: webhook(e.DISCORD_WEBHOOK_URL ?? ''),
  };
}
