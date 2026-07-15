import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';

/**
 * Migrations, stated as SQL rather than generated.
 *
 * The schema is two tables and will not churn. A drizzle-kit migration folder buys versioning we do
 * not need yet and adds a build artifact that has to travel into the image; `IF NOT EXISTS` is
 * idempotent, which is the only property the entrypoint actually requires — it runs this on every
 * boot.
 */
await db.execute(sql`
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS identities (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username       text NOT NULL UNIQUE,
    password_hash  text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_seen      timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS identities_username_idx ON identities (username);

  CREATE TABLE IF NOT EXISTS auth_attempts (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip  text NOT NULL,
    ok  boolean NOT NULL,
    at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS auth_attempts_at_idx ON auth_attempts (at);
  CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON auth_attempts (ip);
`);

console.log('[auth] migrations applied');
await pool.end();
