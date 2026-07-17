import { eq, sql } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import {
  hashPassword,
  isValidPassword,
  isValidUsername,
  normaliseUsername,
  verifyPassword,
} from '../credential.js';
import { db } from '../db/client.js';
import { authAttempts, identities } from '../db/schema.js';
import { env } from '../env.js';
import { jwks, mint } from '../tokens.js';

export const authRouter = Router();

/**
 * A real hash of a throwaway value, computed once at boot. Sign-in verifies against THIS when the
 * username doesn't exist, so a miss costs one scrypt derivation just like a hit — otherwise "no such
 * user" would answer faster than "wrong password", a timing oracle for which usernames are real.
 */
const DUMMY_HASH = await hashPassword('timing-equaliser', env.codePepper);

/**
 * The rate limiter — the code's ONLY defence. In-process, a deliberate single-replica choice: a Redis
 * limiter would be correct across replicas, but this is one pod and a Map is one fewer thing that can
 * be down. Scaled out, THIS breaks quietly — each replica enforces its own limit, multiplying the real
 * ceiling by the replica count. It stops the keyspace being walked QUICKLY; it does not protect any
 * individual user. See DESIGN.md §4.
 */
const attempts = new Map<string, number[]>();

function clientIp(req: Request): string {
  // Behind nginx and Cloudflare, so the socket address is a proxy every time. `trust proxy` makes
  // req.ip read X-Forwarded-For — without it every caller shares one bucket and the first
  // brute-forcer locks out the entire internet.
  return req.ip ?? 'unknown';
}

function overLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = env.rateWindowSeconds * 1000;
  const hits = (attempts.get(ip) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  attempts.set(ip, hits);
  return hits.length > env.rateMax;
}

async function audit(ip: string, ok: boolean): Promise<void> {
  // Records the outcome, never the code that was tried. Logging failed credentials is how one user's
  // typo becomes another user's credential, sitting in plaintext in a table forever.
  await db
    .insert(authAttempts)
    .values({ ip, ok })
    .catch(() => {});
}

/* Sign up. The user brings a USERNAME and PASSWORD; the server brings the UUID. Splitting username
 * from secret is the point: the username is public (printed in vMCP's dashboard) so must be safe for a
 * stranger, the password proves the username is yours and is hashed on arrival — never stored, logged,
 * or put in a token. The entropy floor is a minimum length and the defence a slow, salted, peppered
 * hash (credential.ts). Still no recovery — a reset would need an email, and an email is PII.
 */
const CredentialsBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Both credential endpoints accept the same body and reject a malformed one the same way. Returns the
 *  parsed fields, or null once it has already answered 400 — so a caller's only job is `if (!c) return`. */
function readCredentials(req: Request, res: Response): z.infer<typeof CredentialsBody> | null {
  const parsed = CredentialsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'provide { username, password }' });
    return null;
  }
  return parsed.data;
}

authRouter.post('/identities', async (req, res) => {
  const ip = clientIp(req);
  if (overLimit(ip)) {
    res.status(429).json({ error: 'too many requests' });
    return;
  }

  const creds = readCredentials(req, res);
  if (!creds) return;

  const username = normaliseUsername(creds.username);
  if (!isValidUsername(username)) {
    res.status(400).json({
      error: 'invalid username',
      detail: '3–20 characters: lowercase letters, digits, _ and -, not starting or ending with a separator',
    });
    return;
  }
  if (!isValidPassword(creds.password)) {
    res.status(400).json({
      error: 'invalid pin',
      detail: '4–128 characters',
    });
    return;
  }

  // Hash BEFORE the insert, so plaintext never leaves this handler and a failed insert writes nothing.
  // Username is the only unique column, so a conflict means exactly one thing — name taken — answered
  // directly, no retry loop.
  const passwordHash = await hashPassword(creds.password, env.codePepper);

  const [row] = await db
    .insert(identities)
    .values({ username, passwordHash })
    .onConflictDoNothing()
    .returning({ id: identities.id, username: identities.username });

  if (!row) {
    res.status(409).json({ error: 'username taken', username });
    return;
  }

  const { token, expiresIn } = await mint({ sub: row.id, username: row.username });
  res.status(201).json({ username: row.username, token, expiresIn });
});

/* Check a username before committing. Usernames are public, so saying whether one exists leaks nothing
 * the dashboard wouldn't — and discovering your name is taken only after signing up is a miserable
 * first experience.
 */
authRouter.get('/usernames/:name', async (req, res) => {
  const username = normaliseUsername(req.params.name ?? '');
  if (!isValidUsername(username)) {
    res.json({ username, valid: false, available: false });
    return;
  }
  const [row] = await db
    .select({ id: identities.id })
    .from(identities)
    .where(eq(identities.username, username))
    .limit(1);
  res.json({ username, valid: true, available: !row });
});

/* Sign in. Username + password — without the password a username is a claim anyone could make, so both
 * are required and both fail the same generic way.
 */
authRouter.post('/token', async (req, res) => {
  const ip = clientIp(req);
  if (overLimit(ip)) {
    await audit(ip, false);
    res.status(429).json({ error: 'too many attempts' });
    return;
  }

  const creds = readCredentials(req, res);
  if (!creds) return;

  const username = normaliseUsername(creds.username);
  const password = creds.password;

  // EVERY failure returns the same generic message. Distinguishing "no such username" from "wrong
  // password" would hand an attacker an oracle to confirm which usernames exist, then spend the whole
  // rate-limit budget on one that does. Being public elsewhere doesn't make it free to confirm HERE,
  // the endpoint credentials are attacked through.
  const deny = async () => {
    await audit(ip, false);
    res.status(401).json({ error: 'unknown username or password' });
  };

  if (!isValidUsername(username)) {
    await deny();
    return;
  }

  const [row] = await db
    .select({ id: identities.id, username: identities.username, passwordHash: identities.passwordHash })
    .from(identities)
    .where(eq(identities.username, username))
    .limit(1);

  // Verify whether or not the row exists: skipping scrypt on a missing username would answer faster
  // than "wrong password" — a timing oracle — so a miss still burns one hash against a throwaway.
  const ok = row
    ? await verifyPassword(row.passwordHash, password, env.codePepper)
    : await verifyPassword(DUMMY_HASH, password, env.codePepper);

  if (!row || !ok) {
    await deny();
    return;
  }

  await db.update(identities).set({ lastSeen: sql`now()` }).where(eq(identities.id, row.id));
  await audit(ip, true);

  const { token, expiresIn } = await mint({ sub: row.id, username: row.username });
  res.json({ token, expiresIn, username: row.username });
});

/* ── Who am I ─────────────────────────────────────────────────────────────────────────────────── */
authRouter.get('/me', async (req, res) => {
  const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1];
  if (!bearer) {
    res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'no token' });
    return;
  }

  try {
    // Verified against our own public key, not merely decoded. This endpoint exists partly so the
    // verification path is exercised by our own tests and not only by downstream services.
    const set = createLocalJWKSet(await jwks());
    const { payload } = await jwtVerify(bearer, set, {
      issuer: env.issuer,
      audience: env.audience,
    });
    res.json({ sub: payload.sub, username: payload.username, exp: payload.exp });
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
});
