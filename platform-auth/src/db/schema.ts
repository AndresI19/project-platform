import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * An identity. Three values, and keeping them distinct is the whole design (DESIGN.md §2):
 *
 *   id           the opaque, stable identity. This is the JWT's `sub`, and the foreign key every
 *                other service stores. It is meaningless on its own.
 *   username     the PUBLIC identity, chosen by the user. Safe in a dashboard, a leaderboard, a log.
 *   codeLookup   HMAC-SHA256(pepper, code). The code ITSELF is never stored, anywhere, in any form
 *                that can be read back — not by us, not by a stolen dump.
 *
 * The code appears exactly once in this system's whole lifetime: in the response to the request that
 * created it. If the user forgets it, it is gone. That is not a gap to fill later with an email
 * reset — an email would be PII, and this identity is explicitly designed to hold none.
 */
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The public identity, chosen by the user. Stored lowercase — see code.ts for why case-
     *  insensitivity is a security property here and not a nicety. */
    username: text('username').notNull().unique(),
    codeLookup: text('code_lookup').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The login path is a single indexed read on this column. That is only possible because the hash
    // is keyed rather than salted — see code.ts.
    byLookup: index('identities_code_lookup_idx').on(t.codeLookup),
  }),
);

/**
 * Every attempt to exchange a code for a token, successful or not.
 *
 * This is an audit trail, not a rate limiter — the limiter is in front of it and is in-process. The
 * table is what lets you answer "is someone walking the keyspace?" after the fact, which no
 * in-memory counter can, because the answer only becomes visible across a long window.
 *
 * It stores the IP and whether the attempt succeeded. It does NOT store the code that was tried:
 * logging failed credentials is how one user's typo becomes another user's credential sitting in
 * plaintext in a table.
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
