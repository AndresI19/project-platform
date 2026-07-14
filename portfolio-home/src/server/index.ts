import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveClient } from '@platform/ui/server';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { loadEnv } from './env.js';
import { collectVersions, platformVersion } from './versions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // project root
const CLIENT_DIR = resolve(ROOT, 'dist/client'); // vite build output (includes /assets)

// Validated once, at boot. A bad value fails here with the variable named, rather than silently
// misbehaving at request time.
const env = loadEnv();

const app = express();

// The only body this server ever accepts is one short string, so the limit is deliberately tiny.
app.use(express.json({ limit: '2kb' }));
app.set('trust proxy', true); // sits behind the nginx reverse proxy, so req.ip needs the header

// A coarse global cap as defence-in-depth, layered over the finer per-endpoint limiter on /api/hello
// below. Generous because this process also serves the SPA's static assets; real abuse trips it long
// before a human browsing does. Per-process (single replica) — resets on restart.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip reads: behind Cloudflare's shared edge IPs a per-IP limiter cannot separate clients, so
  // rate-limiting GETs would 429 the liveness polling. Only mutating requests are capped.
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  validate: { trustProxy: false },
});
app.use(limiter);

// Runtime config for the client. `vmcpApiBase` is where the liveness probes read the gateway
// registry from: empty means same-origin (/vmcp/api, the local deployment), and in production it is
// the API host. Served rather than baked in, so one image runs in both places.
app.get('/api/config', (_req, res) => res.json({ vmcpApiBase: env.vmcpApiBase }));

// ---------------------------------------------------------------------------
// Versions. This server's own, and — because it is the one component that can reach all the others
// from inside the cluster — everybody else's, aggregated (see versions.ts for why that fan-out is
// here and not in the browser).
//
// The version is READ FROM A FILE, not from package.json and not from a build-time define. The page
// used to show `__APP_VERSION__`, which Vite bakes in from package.json at BUILD time — a number
// that only ever changed when someone remembered to bump it by hand, and which said nothing about
// what was actually deployed. This one is stamped into the image by k8s/deploy.sh from the real git
// tag, so the page cannot claim a version it is not running.
// ---------------------------------------------------------------------------
const VERSION = ((): string => {
  try {
    return readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim() || 'snapshot';
  } catch {
    // No VERSION file means a dev checkout, not a release. Say so rather than inventing a number.
    return 'snapshot';
  }
})();

// `version` is this image's own — baked in, fixed for the life of the container. `platform` is the
// orchestration repo's, read from the version spec on the shared volume: the platform has no image
// to carry a version in, so its version is written next to the résumé and the card decks. Two
// different things, two fields, rather than one field that means whichever the caller assumed.
app.get('/version', (_req, res) => res.json({ version: VERSION, platform: platformVersion() }));
app.get('/api/versions', async (_req, res) => res.json(await collectVersions(VERSION)));

// ---------------------------------------------------------------------------
// "Who are you?" — the optional greeting the home page collects on a first visit, relayed to me
// as a Discord push. Unset webhook is a supported mode, not a failure: the greeting is logged to
// stdout instead, so the feature works in local dev and in CI with no secret present.
// ---------------------------------------------------------------------------
const DISCORD_WEBHOOK_URL = env.discordWebhookUrl;

/** Crude fixed-window cap. The endpoint is unauthenticated and fans out to a webhook, so it must
    not be usable as a free megaphone; a handful of greetings an hour is far more than it needs. */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();
function overLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

async function notifyDiscord(content: string): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log(`[hello] (no DISCORD_WEBHOOK_URL set) ${content.replace(/[\r\n]/g, ' ')}`);
    return;
  }
  try {
    const r = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions parse:[] neuters @everyone/@here, which a visitor could otherwise type.
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`[hello] discord webhook returned ${r.status}`);
  } catch (err) {
    console.error('[hello] discord webhook failed:', (err as Error).message);
  }
}

/** Backticks fence a visitor's text so it cannot smuggle Discord markdown into my notification. */
const fence = (s: string): string => `\`${s.replace(/`/g, "'")}\``;

app.post('/api/hello', (req, res) => {
  const body = req.body as { who?: unknown; company?: unknown; referrer?: unknown };
  const who = String(body?.who ?? '')
    .trim()
    .slice(0, 200);
  const company = String(body?.company ?? '')
    .trim()
    .slice(0, 120);
  // Either field alone is a real answer — "someone from Acme is looking" is worth knowing even
  // without a name — so only a wholly empty submission is rejected.
  if (!who && !company) return res.status(400).json({ ok: false, error: 'nothing to send' });
  if (overLimit(req.ip ?? 'unknown')) return res.status(429).json({ ok: false, error: 'slow down' });

  const referrer = String(body?.referrer ?? '')
    .trim()
    .slice(0, 200);
  const lines = ['👀 **Someone is curious about your page**'];
  if (who) lines.push(`**Who:**     ${fence(who)}`);
  if (company) lines.push(`**Company:** ${fence(company)}`);
  if (referrer) lines.push(`**Via:**     ${fence(referrer)}`);

  // Answered and acknowledged — the relay is fire-and-forget so a slow webhook never stalls the page.
  res.json({ ok: true });
  void notifyDiscord(lines.join('\n'));
});

// The built client, its cache policy, the health probe and the SPA fallback — all shared with the
// quiz. Mounted LAST: it ends in a catch-all, so any route added after it would never be reached.
serveClient(app, { clientDir: CLIENT_DIR, appName: 'portfolio-home' });

app.listen(env.port, () => {
  console.log(`portfolio-home listening on http://localhost:${env.port}`);
  console.log(`  version    : ${VERSION}`);
  console.log(`  vMCP API   : ${env.vmcpApiBase || '(same-origin /vmcp/api)'}`);
  console.log(
    `  greetings  : ${env.discordWebhookUrl ? 'relayed to Discord' : 'logged to stdout (DISCORD_WEBHOOK_URL unset)'}`,
  );
});
