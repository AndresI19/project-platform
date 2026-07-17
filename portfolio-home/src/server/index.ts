import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveClient } from '@platform/ui/server';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { contentWritable, mountContent, resumePath, resumeUid, serveResume } from './content.js';
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
    not be usable as a free megaphone; a handful of greetings an hour is far more than it needs. The
    defaults (5 per hour) are validated in env.ts and overridable via HELLO_RATE_MAX/HELLO_RATE_WINDOW. */
const RATE_LIMIT = { max: env.helloRateMax, windowMs: env.helloRateWindowSeconds * 1000 };
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

// ---------------------------------------------------------------------------
// The résumé, and the admin route that replaces it.
//
// /resume.pdf is READ PER REQUEST from the content volume's DIRECTORY mount — the same move, for the
// same reason, as platformVersion() above. It used to arrive as a subPath single-file mount, which is
// a bind mount pinned to the source file's INODE at container start: a replacement file has a new
// inode and the mount goes on serving the old one, which is why swapping the résumé needed a rollout.
// Reading the directory mount per request is what removes the rollout.
//
// This MUST be registered above serveClient(), and not merely because serveClient ends in a catch-all.
// Dropping the subPath mount does NOT make dist/client/resume.pdf disappear — vite.config.ts still
// copies public/resume.pdf into the build — so without this route serveClient's express.static serves
// the IMAGE's stale copy, silently and forever: a 200 indistinguishable from the bug being fixed here.
// That same copy is the seed fallback below, which is why the fallback costs nothing.
// ---------------------------------------------------------------------------
// #37 removed the rollout-to-swap by reading per request; this removes the OTHER staleness, the one
// #37 could not reach: Cloudflare edge-caches /resume.pdf under a Browser-Cache-TTL it stamps itself
// (measured max-age=14400), overriding the origin's no-cache, so a replaced PDF still shows old in a
// browser for hours. The URL is made to change instead. The page links the EXTENSIONLESS /resume,
// which Cloudflare does not edge-cache (it caches by extension), so it always resolves fresh to the
// current /resume-<uid>.pdf — and THAT url, one exact version, is cached hard. See content.ts.
const RESUME_SEED = resolve(CLIENT_DIR, 'resume.pdf');
const serveCurrent = serveResume(env.contentDir, RESUME_SEED); // no-cache — the fallback when no UID
const serveVersioned = serveResume(env.contentDir, RESUME_SEED, 'public, max-age=31536000, immutable');

// The redirect target moves every deploy, so it must never be cached — no-store keeps both the browser
// and Cloudflare re-resolving it. With no UID (dev, or before the first write) serve the file directly,
// exactly as #37 did, so nothing regresses in a checkout without a volume.
function toCurrentResume(req: Request, res: Response): void {
  const uid = resumeUid(env.contentDir);
  if (uid) {
    res.set('Cache-Control', 'no-store');
    res.redirect(302, resumePath(uid));
    return;
  }
  serveCurrent(req, res);
}

app.get('/resume', toCurrentResume);
// Bare /resume.pdf is what old links and bookmarks point at — redirect them forward to the current
// version rather than 404, so a saved link always lands on the latest résumé.
app.get('/resume.pdf', toCurrentResume);
app.get('/resume-:uid.pdf', (req, res) => {
  if (req.params.uid === resumeUid(env.contentDir)) {
    serveVersioned(req, res);
    return;
  }
  // A stale or unknown UID — an old link after a newer résumé shipped — goes to the current one.
  toCurrentResume(req, res);
});

// Admin-only writes to that volume. Registers NOTHING when AUTH_JWKS_URI is unset — see content.ts.
mountContent(app, { env });

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
  // The upload route 404s when unconfigured — deliberately, but that makes a misconfigured deploy
  // silent. This line is the only thing that says so out loud, so it reports what was actually
  // decided rather than what was intended.
  console.log(
    `  uploads    : ${
      env.authJwksUri
        ? `admin-only PUT /api/content/* (max ${env.uploadMaxBytes} bytes)`
        : 'disabled — route not registered (AUTH_JWKS_URI unset)'
    }`,
  );
  // Which résumé path is live: a versioned /resume-<uid>.pdf once a UID is on the volume, or the bare
  // file as a fallback before the first write. Reports what is actually served, in the same spirit as
  // the uploads line — a deploy that never minted a UID is otherwise silent.
  {
    const uid = resumeUid(env.contentDir);
    console.log(
      `  résumé     : ${uid ? `/resume → /resume-${uid}.pdf (versioned)` : '/resume (bare — no UID yet)'}`,
    );
  }
  // Checked once, for the log only. Never to gate a request: that would be a TOCTOU check, and the
  // write already reports the truth (503, see content.ts).
  void contentWritable(env.contentDir).then((ok) => {
    console.log(`  content    : ${env.contentDir}${ok ? '' : ' (NOT writable — uploads would 503)'}`);
  });
});
