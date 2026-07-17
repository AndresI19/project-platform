import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';

/**
 * Migrations, stated as SQL rather than generated. The schema is two tables and won't churn; a
 * drizzle-kit migration folder buys versioning we don't need and a build artifact to ship. `IF NOT
 * EXISTS` is idempotent, the only property the entrypoint needs — it runs this on every boot.
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
