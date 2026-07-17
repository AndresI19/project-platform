import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * An identity. Three values, kept distinct — the whole design (DESIGN.md §2):
 *
 *   id            the opaque, stable identity — the JWT's `sub` and the FK every other service stores.
 *   username      the PUBLIC identity, chosen by the user. Safe in a dashboard, leaderboard, log.
 *   passwordHash  scrypt(pepper + password, per-row salt), self-describing. The password ITSELF is
 *                 never stored readably — not by us, not by a dump, which also needs the off-table pepper.
 *
 * The password is user-chosen now, not server-generated. Still no recovery: a reset needs an email,
 * an email is PII, and this identity holds none. What changed is who picks the secret.
 */
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The public identity, chosen by the user. Stored lowercase — see credential.ts for why case-
     *  insensitivity is a security property here and not a nicety. */
    username: text('username').notNull().unique(),
    /** scrypt(pepper + password, salt). Salted per row, so it is NOT unique and NOT the lookup key —
     *  login finds the row by `username` (unique, indexed) and then verifies. See credential.ts. */
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Login is a single indexed read on the username — the unique constraint already backs it, but an
    // explicit index states the access path the login query depends on.
    byUsername: index('identities_username_idx').on(t.username),
  }),
);

/**
 * Every attempt to exchange credentials for a token, successful or not. An audit trail, not a rate
 * limiter (that's in-process, in front of it): the table answers "is someone walking the keyspace?"
 * after the fact, which no in-memory counter can across a long window. It stores the IP and the
 * outcome, NOT the credential tried — logging failed credentials is how one user's typo becomes
 * another's credential in plaintext.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    ok: boolean('ok').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAt: index('auth_attempts_at_idx').on(t.at),
    byIp: index('auth_attempts_ip_idx').on(t.ip),
  }),
);
