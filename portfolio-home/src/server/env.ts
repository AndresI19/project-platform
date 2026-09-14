/**
 * The server's entire configuration surface, validated once at boot. Every one is optional — the app
 * runs with an empty environment — but a value that IS set and wrong fails here, named. Otherwise a
 * typo in VMCP_API_BASE quietly fetched a nonsense URL and every badge sat "offline" with no log.
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
  /** The /api/hello fixed-window cap: greetings allowed per IP per window. */
  helloRateMax: number;
  /** The length of that window, in seconds. */
  helloRateWindowSeconds: number;
  /**
   * platform-auth's JWKS endpoint (the public half of the token-signing key). UNSET IS A SUPPORTED
   * MODE meaning one thing: the admin upload route is never registered (see content.ts) — a switch,
   * not a value, which is why the AUTH_ISSUER pairing is validated not defaulted. Empty keeps
   * `npm run dev` one command with no auth service.
   */
  authJwksUri: string;
  /** The issuer those tokens must claim. Required whenever authJwksUri is set — see loadEnv. */
  authIssuer: string;
  /** The audience those tokens must claim. 'platform', as every other verifier on this cluster uses. */
  authAudience: string;
  /**
   * The platform-content volume's DIRECTORY mount — résumé read per request, admin route writes here.
   * A directory deliberately: a single-file subPath mount is pinned to the file's inode at container
   * start, so a replaced file is never seen. See content.ts.
   */
  contentDir: string;
  /** Largest upload body accepted, in bytes. */
  uploadMaxBytes: number;
  /**
   * Postgres holding the FVT run history behind /debug. UNSET IS A SUPPORTED MODE, the same switch
   * authJwksUri is: with no database the FVT routes are never registered (see fvt.ts), so a dev
   * checkout and CI run with no Postgres at all. Set, it must be a postgres:// URL — a typo that
   * still parsed would otherwise surface as a connection error on the first nightly POST, hours
   * after the deploy that caused it.
   */
  databaseUrl: string;
  /** How many days of FVT runs to keep. Older runs are pruned as each new one is ingested. */
  fvtRetentionDays: number;
}

/**
 * Variables whose VALUE is itself a credential, so a validation failure must name them without
 * quoting them. The webhook URL is the credential (anyone holding it can post to the channel) and a
 * Postgres URL embeds the password. Both are rejected by name and shape, never by content — a
 * malformed secret still ends up in a boot log, and boot logs are the least private place it could go.
 */
const SECRET_VARS = new Set(['DISCORD_WEBHOOK_URL', 'DATABASE_URL']);

function fail(name: string, value: string, why: string): never {
  const shown = SECRET_VARS.has(name) ? '<redacted>' : JSON.stringify(value);
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
    return fail(
      name,
      value,
      'must be an absolute URL (e.g. https://api.example.com), or unset for same-origin',
    );
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
    return fail(
      'DISCORD_WEBHOOK_URL',
      value,
      'does not look like a Discord webhook (expected /api/webhooks/… in the path)',
    );
  }
  return value;
}

/**
 * An absolute http(s) URL, PATH AND ALL. Deliberately not absoluteOrigin(): that strips a trailing
 * slash to keep appended paths clean, but a JWKS URI is nothing but a path (…/.well-known/jwks.json)
 * with nothing appended — reusing it would make its own doc comment a lie, worse than six dup lines.
 */
function absoluteUrl(name: string, raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      name,
      value,
      'must be an absolute URL (e.g. http://platform-auth:8002/.well-known/jwks.json)',
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail(name, value, `must be http or https, got "${url.protocol}"`);
  }
  return value;
}

/** An absolute filesystem path, default when unset. Existence is NOT checked, deliberately: /content
 *  doesn't exist in a dev checkout (a supported mode — the seeded résumé answers, uploads aren't
 *  registered), and failing here would make `npm start` require a Kubernetes volume. */
function absolutePath(name: string, raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim();
  if (!value) return fallback;
  if (!value.startsWith('/')) return fail(name, value, 'must be an absolute path');
  return value.replace(/\/+$/, '');
}

/**
 * A postgres:// connection string, or '' for "no database, don't register the FVT routes".
 * Deliberately not absoluteUrl(): that accepts http(s) only, and the failure mode here is a URL that
 * parses but points somewhere that will never answer. The scheme is the one thing worth checking —
 * the host, database, and credentials cannot be validated without connecting, which boot must not do.
 */
function postgresUrl(name: string, raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(name, value, 'must be a postgres:// URL, or unset to run without the /debug history');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return fail(name, value, `must be postgres:// or postgresql://, got "${url.protocol}"`);
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

/** A positive integer with a default when unset. Like PORT above, a value that IS set but is not a
 *  positive integer fails here, named, rather than silently weakening or disabling the cap. */
function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return fail(name, raw, 'must be a positive integer');
  }
  return n;
}

export function loadEnv(e: NodeJS.ProcessEnv = process.env): Env {
  const authJwksUri = absoluteUrl('AUTH_JWKS_URI', e.AUTH_JWKS_URI ?? '');
  const authIssuer = absoluteUrl('AUTH_ISSUER', e.AUTH_ISSUER ?? '');
  // Auth is all-or-nothing. A JWKS URI with no issuer verifies the SIGNATURE then accepts any issuer's
  // token — configured-looking, passes a smoke test, checks nothing about who minted the claim. Unset
  // is a mode; half-set is a mistake, caught here with the variable named, not at the first upload.
  if (authJwksUri && !authIssuer) {
    fail('AUTH_ISSUER', '', 'is required when AUTH_JWKS_URI is set — see content.ts');
  }

  return {
    port: port(e.PORT),
    vmcpApiBase: absoluteOrigin('VMCP_API_BASE', e.VMCP_API_BASE ?? ''),
    discordWebhookUrl: webhook(e.DISCORD_WEBHOOK_URL ?? ''),
    helloRateMax: positiveInt('HELLO_RATE_MAX', e.HELLO_RATE_MAX, 5),
    helloRateWindowSeconds: positiveInt('HELLO_RATE_WINDOW', e.HELLO_RATE_WINDOW, 3600),
    authJwksUri,
    authIssuer,
    authAudience: (e.AUTH_AUDIENCE ?? '').trim() || 'platform',
    contentDir: absolutePath('CONTENT_DIR', e.CONTENT_DIR, '/content'),
    databaseUrl: postgresUrl('DATABASE_URL', e.DATABASE_URL ?? ''),
    // 30 days. One run a day makes this ~30 rows and a few hundred checks — small enough that the
    // prune is bookkeeping, long enough that a regression which began "a few weeks ago" is still
    // on the board when someone goes looking for when it started.
    fvtRetentionDays: positiveInt('FVT_RETENTION_DAYS', e.FVT_RETENTION_DAYS, 30),
    // 5 MiB. The résumé is ~82 KiB and the whole volume is 256Mi, so this is ~60x generous and still
    // far under the volume — an upload cannot fill the disk the quiz's decks live on.
    uploadMaxBytes: positiveInt('UPLOAD_MAX_BYTES', e.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
  };
}
