import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { jwks } from './tokens.js';

const app = express();

// Behind nginx and Cloudflare, so the socket address is a proxy on every request. Without this the
// rate limiter would see one IP for the whole internet and the first brute-forcer would lock
// everybody out.
app.set('trust proxy', true);
app.use(express.json({ limit: '8kb' }));

// A coarse global cap, layered over the fine-grained per-identity login limiter in routes/auth.ts —
// that one defends the login endpoint specifically against credential brute force; this covers every
// route as defence-in-depth. Per-process (single replica), consistent with that limiter's own
// deliberate single-replica design.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip reads: behind Cloudflare's shared edge IPs a per-IP limiter cannot separate clients, so
  // rate-limiting GETs would 429 the liveness polling. Only mutating requests (login, etc.) are capped.
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  validate: { trustProxy: false },
});
app.use(limiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// The version this image was built from. Baked into <root>/VERSION by the Dockerfile, which
// k8s/deploy.sh stamps from the repo's latest git tag (suffixed -snapshot when the source differs
// from main). This file is dist/index.js in the image, so the app root is one directory up. Read once
// at startup — it cannot change without a new image. Absent in a dev checkout, hence "snapshot": an
// untagged build must not claim to be a release.
const VERSION = ((): string => {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    return readFileSync(resolve(root, 'VERSION'), 'utf8').trim() || 'snapshot';
  } catch {
    return 'snapshot';
  }
})();
app.get('/version', (_req, res) => {
  res.json({ version: VERSION });
});

/**
 * The public keys. Everything downstream — the MCP gateway today, the quiz API next — fetches this
 * and verifies tokens on its own. That is the point of RS256: a verifier holds nothing that could
 * mint a token, so compromising one does not compromise every identity on the platform.
 *
 * Cached hard, because it changes only when the signing key rotates, and every verifier fetches it.
 */
app.get('/.well-known/jwks.json', async (_req, res) => {
  res.set('cache-control', 'public, max-age=300');
  res.json(await jwks());
});

app.use('/auth', authRouter);

app.listen(env.port, () => {
  console.log(`[auth] listening on :${env.port}`);
  console.log(`[auth] issuer ${env.issuer}`);
  console.log(`[auth] rate limit ${env.rateMax} attempts / ${env.rateWindowSeconds}s per IP`);
});
