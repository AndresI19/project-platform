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

// A coarse global cap over the fine-grained login limiter in routes/auth.ts (which defends the login
// endpoint against credential brute force); this covers every route as defence-in-depth. Per-process
// (single replica), like that limiter.
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

// The version this image was built from. Baked into <root>/VERSION by the Dockerfile, stamped by
// k8s/deploy.sh from the git tag (-snapshot off main). This file is dist/index.js, so the root is one
// dir up. Read once at startup — it can't change without a new image. Absent in a dev checkout, hence
// "snapshot": an untagged build must not claim to be a release.
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
 * The public keys. Everything downstream fetches this and verifies tokens on its own — the point of
 * RS256: a verifier holds nothing that could mint a token, so compromising one doesn't compromise
 * every identity. Cached hard, since it changes only when the signing key rotates.
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
