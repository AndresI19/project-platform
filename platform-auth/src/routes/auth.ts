import { and, eq, sql } from "drizzle-orm";
import { Router, type Request } from "express";
import { jwtVerify, createLocalJWKSet } from "jose";
import { z } from "zod";
import {
  codeLookup,
  generateCode,
  isValidUsername,
  isWellFormed,
  normaliseCode,
  normaliseUsername,
} from "../code.js";
import { db } from "../db/client.js";
import { authAttempts, identities } from "../db/schema.js";
import { env } from "../env.js";
import { jwks, mint } from "../tokens.js";

export const authRouter = Router();

/**
 * The rate limiter — the code's ONLY defence.
 *
 * In-process, and that is a deliberate single-replica choice: a Redis-backed limiter would be correct
 * across replicas, but this service is one pod, and an in-memory Map is one fewer thing that can be
 * down when nobody can sign in. If this is ever scaled out, THIS breaks first, and it breaks quietly
 * — each replica would enforce its own limit, multiplying the real ceiling by the replica count.
 *
 * What it buys and what it does not: it stops the keyspace being walked QUICKLY. It does not protect
 * any individual user. See DESIGN.md §4.
 */
const attempts = new Map<string, number[]>();

function clientIp(req: Request): string {
  // Behind nginx and Cloudflare, so the socket address is a proxy every time. `trust proxy` makes
  // req.ip read X-Forwarded-For — without it every caller shares one bucket and the first
  // brute-forcer locks out the entire internet.
  return req.ip ?? "unknown";
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
  await db.insert(authAttempts).values({ ip, ok }).catch(() => {});
}

/* ── Sign up ─────────────────────────────────────────────────────────────────────────────────────
 * The user brings a USERNAME. The server brings the UUID and the CODE.
 *
 * Splitting it that way is the whole point. The username is public — it is printed in vMCP's
 * dashboard, which anyone can read — so it must be safe for a stranger to see. The code is the proof
 * that the username is yours, and nobody ever sees it but you.
 *
 * This response is the ONLY place in the system's entire lifetime where the code appears. It is
 * never returned again, never logged, never put in a token. If the user does not write it down, it
 * is gone — and there is no reset, because a reset needs an email and an email is PII.
 */
const SignUpBody = z.object({ username: z.string().min(1).max(64) });

authRouter.post("/identities", async (req, res) => {
  const ip = clientIp(req);
  if (overLimit(ip)) {
    res.status(429).json({ error: "too many requests" });
    return;
  }

  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "provide { username }" });
    return;
  }

  const username = normaliseUsername(parsed.data.username);
  if (!isValidUsername(username)) {
    res.status(400).json({
      error: "invalid username",
      detail: "3–20 characters: lowercase letters, digits, _ and -, not starting or ending with a separator",
    });
    return;
  }

  // A code collision is astronomically unlikely (34 billion), but "unlikely" is not "impossible" and
  // the failure mode is two people sharing one identity — so it is checked, not assumed. A USERNAME
  // collision, by contrast, is entirely likely and is a normal, expected answer.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const lookup = codeLookup(code, env.codePepper);

    const [row] = await db
      .insert(identities)
      .values({ username, codeLookup: lookup })
      .onConflictDoNothing()
      .returning({ id: identities.id, username: identities.username });

    if (!row) {
      // Conflicted on username or on code, and the two need different answers. Ask the database
      // which: a taken username is a 409 the user can act on; a code collision just means draw again.
      const [taken] = await db
        .select({ id: identities.id })
        .from(identities)
        .where(eq(identities.username, username))
        .limit(1);
      if (taken) {
        res.status(409).json({ error: "username taken", username });
        return;
      }
      continue; // code collision — draw another
    }

    const { token, expiresIn } = await mint({ sub: row.id, username: row.username });
    res.status(201).json({
      username: row.username,
      code, //  ← the one and only time this is ever sent
      token,
      expiresIn,
      warning: "Write this code down. It cannot be recovered, and it is the only way back into this account.",
    });
    return;
  }

  res.status(503).json({ error: "could not allocate an identity; try again" });
});

/* ── Check a username before committing to it ─────────────────────────────────────────────────────
 * Usernames are public by design, so telling a caller whether one exists leaks nothing that reading
 * the dashboard would not. Worth having: discovering your name is taken AFTER being handed a code you
 * were told to write down would be a miserable first experience.
 */
authRouter.get("/usernames/:name", async (req, res) => {
  const username = normaliseUsername(req.params.name ?? "");
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

/* ── Sign in ─────────────────────────────────────────────────────────────────────────────────────
 * Username + code. No password — a code is a key, not a password — but not nothing, either: without
 * the code, a username is a claim and anyone could make it.
 */
const TokenBody = z.object({
  username: z.string().min(1).max(64),
  code: z.string().min(1).max(32),
});

authRouter.post("/token", async (req, res) => {
  const ip = clientIp(req);
  if (overLimit(ip)) {
    await audit(ip, false);
    res.status(429).json({ error: "too many attempts" });
    return;
  }

  const parsed = TokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "provide { username, code }" });
    return;
  }

  const username = normaliseUsername(parsed.data.username);
  const code = normaliseCode(parsed.data.code);

  // EVERY failure below returns the same generic message. Distinguishing "no such username" from
  // "wrong code" would hand an attacker a free oracle: they could confirm which usernames exist and
  // then spend the whole rate-limit budget on codes for one that does. The username being public
  // elsewhere does not make it free to confirm HERE, on the endpoint the keyspace is attacked
  // through.
  const deny = async () => {
    await audit(ip, false);
    res.status(401).json({ error: "unknown username or code" });
  };

  if (!isValidUsername(username) || !isWellFormed(code)) return void (await deny());

  const lookup = codeLookup(code, env.codePepper);
  const [row] = await db
    .select({ id: identities.id, username: identities.username })
    .from(identities)
    .where(and(eq(identities.username, username), eq(identities.codeLookup, lookup)))
    .limit(1);

  if (!row) return void (await deny());

  await db.update(identities).set({ lastSeen: sql`now()` }).where(eq(identities.id, row.id));
  await audit(ip, true);

  const { token, expiresIn } = await mint({ sub: row.id, username: row.username });
  res.json({ token, expiresIn, username: row.username });
});

/* ── Who am I ─────────────────────────────────────────────────────────────────────────────────── */
authRouter.get("/me", async (req, res) => {
  const bearer = /^Bearer (.+)$/i.exec(req.get("authorization") ?? "")?.[1];
  if (!bearer) {
    res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "no token" });
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
    res.status(401).json({ error: "invalid token" });
  }
});
