import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * The code the user memorises, and the keyed hash we store instead of it.
 *
 * ── The alphabet ────────────────────────────────────────────────────────────────────────────────
 * Crockford base32: the digits and the uppercase letters, MINUS I, L, O and U.
 *
 * I and L look like 1. O looks like 0. U is excluded because it turns up in words people would
 * rather not read back to a colleague. Dropping them is not decoration: this code exists to be read
 * off a screen, written on paper, and typed back in later, and every ambiguous glyph is a support
 * request waiting to happen.
 *
 * ── The length ──────────────────────────────────────────────────────────────────────────────────
 * Seven characters: 32^7 ≈ 34 BILLION combinations.
 *
 * Seven DIGITS — the obvious alternative — would be 10 million, which an attacker walks in about a
 * day at a modest guess rate. Seven base32 characters cost the user exactly the same effort to
 * remember and are ~3,400× harder to guess. The keyspace was free.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 chars: no I, L, O, U
const CODE_LEN = 7;

/** A fresh code. randomInt is a CSPRNG — Math.random() is not, and a predictable code is no code. */
export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * The username: the PUBLIC identity, chosen by the user.
 *
 * It replaces the random handle the server used to invent. The reason a separate public identity
 * exists at all is unchanged, and it is the load-bearing part of the whole design: the CODE is a
 * credential, and vMCP's dashboard prints user ids on a publicly-readable API. Whatever is shown
 * there must be safe to show a stranger. So the user is known by a name they picked, and proves it
 * with a code nobody ever sees. See DESIGN.md §2.
 *
 * Rules: 3–20 characters, lowercase letters, digits, `_` and `-`. No leading or trailing separator.
 * Case-insensitive for uniqueness, so `Andres` and `andres` cannot both exist — otherwise the
 * username would be an impersonation vector rather than an identity.
 */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{1,18}[a-z0-9])?$/;

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(name: string): boolean {
  return name.length >= 3 && name.length <= 20 && USERNAME_RE.test(name);
}

/** People type `l` for `1` and `o` for `0`. Fold those back before looking anything up. */
export function normaliseCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '');
}

export function isWellFormed(code: string): boolean {
  if (code.length !== CODE_LEN) return false;
  return [...code].every((c) => ALPHABET.includes(c));
}

/**
 * What we store instead of the code: HMAC-SHA256(pepper, code).
 *
 * NOT the code itself, and NOT bcrypt/argon2 either — and the reason for the second is the
 * interesting one. A randomly-salted hash cannot be INDEXED, and signing in means finding a row *by*
 * the code. With a per-row salt you would have to hash the candidate against every row in the table.
 *
 * A keyed hash is deterministic, so the lookup is a single indexed read, and it is not reversible
 * without the key. A plain SHA-256 would give the indexability and none of the safety: with only 34
 * billion possible inputs, anyone holding a database dump could enumerate the entire keyspace offline
 * in minutes. The pepper — which lives in a sealed secret, never in the database — is what makes that
 * infeasible. Steal the dump and you still have nothing.
 */
export function codeLookup(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('base64url');
}

/** Compare lookups without leaking, through timing, how much of a value matched. */
export function lookupsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
