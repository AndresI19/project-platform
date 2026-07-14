import express from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { jwks } from './tokens.js';

const app = express();

// Behind nginx and Cloudflare, so the socket address is a proxy on every request. Without this the
// rate limiter would see one IP for the whole internet and the first brute-forcer would lock
// everybody out.
app.set('trust proxy', true);
app.use(express.json({ limit: '8kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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
