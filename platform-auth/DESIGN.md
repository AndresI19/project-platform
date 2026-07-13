# platform-auth — design

A memorable code, a signed token, and an honest name for what that is.

---

## 1. What this is, and what it is not

A user is given a **7-character code** (`4KP7R2M`) and asked to remember it. That code is the entire
credential. There is no password, no email, no second factor, and no recovery — lose the code and the
identity is gone.

**This is pseudonymous identity, not security.** Anyone holding a code *is* that user. The right
mental model is a cloakroom ticket, not a login.

That is a perfectly good trade for what it carries — quiz progress, a garden, and attribution of MCP
tool calls. It is a *terrible* trade for anything else, so the rule is absolute:

> **Nothing sensitive is ever stored behind this code. No email, no real name, no PII, ever.**

The code is 7 characters of Crockford base32 (`0-9A-Z` minus `I L O U`, which look like other
characters): **32⁷ ≈ 34 billion** combinations. Seven digits would have been 10 million — walkable in
about a day at a modest guess rate. Same thing to memorise, 3,400× the keyspace.

---

## 2. The code is NOT the user id

This is the one structural decision that everything else follows from, and the naïve design gets it
wrong.

If the code doubles as the user id, then it appears wherever a user id appears — and vMCP's dashboard
has a **User column on a publicly readable API**. Every visitor to `/vmcp/calls` would be shown other
people's credentials. Rate limiting would be beside the point: nobody would need to guess.

So three distinct things:

| | What | Where it may appear |
| --- | --- | --- |
| **code** | `4KP7R2M` — the secret the user memorises | The user's own screen, once. Never logged, never in a token, never in an API response after issue. |
| **sub** | a UUID — the stable internal identity | Inside JWTs; as a foreign key in every service's database. |
| **handle** | `K7R2M` — a short public display id | Dashboards, leaderboards, the User column. Safe to show to anyone. |

The token carries `sub` and `handle`. **It never carries the code.**

### The code is not stored in plaintext either

Storing it hashed the usual way (bcrypt/argon2, random salt) would make lookup impossible — logging
in means finding a row *by* the code, and a randomly salted hash cannot be indexed.

So: `code_lookup = HMAC-SHA256(pepper, code)`, unique-indexed.

- **Deterministic**, so login is a single indexed lookup.
- **Keyed**, so a stolen database dump reveals nothing without the pepper — which lives in a sealed
  secret, not in the database.

A plain SHA-256 would not do: with only 34 billion possible inputs, an attacker with the dump could
enumerate the entire keyspace offline in minutes. The pepper is what makes that infeasible.

---

## 3. Tokens

**RS256, with a JWKS endpoint.** The auth service holds the private key; everything else fetches the
public key and verifies. A verifier that is compromised cannot mint tokens — which is the whole
reason not to use a shared HS256 secret across three services.

(open-vMCP's auth config schema already declares a `jwksUri` field. It has always been unused. The
design anticipated this.)

```json
{
  "iss": "https://api-andres.project-platform.me/auth",
  "sub": "0b7f…-uuid",         // the identity. NOT the code.
  "handle": "K7R2M",           // safe to display
  "aud": ["vmcp", "quiz"],
  "iat": 1752460000,
  "exp": 1752546400,           // 24h
  "jti": "…"
}
```

**24-hour access tokens, no refresh tokens.** The browser already holds the code (it must, or the
user would re-type it every visit), so re-minting is a single call to `POST /auth/token`. A refresh
token would be a second long-lived credential guarding a credential we already store — complexity
with nothing to show for it.

---

## 4. API

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/identities` | Mint a new identity. Server generates the code (CSPRNG), checks it is unused, returns `{ code, handle, token }`. **The only time the code is ever returned.** |
| `POST /auth/token` | `{ code }` → `{ token, handle, expiresIn }`. Rate-limited hard. |
| `GET /auth/me` | Bearer → `{ sub, handle, createdAt }`. |
| `GET /.well-known/jwks.json` | The public keys, with `kid`, so verifiers can rotate. |
| `GET /health` | Liveness. |

### Rate limiting is the only defence the code has

`POST /auth/token` is where the entire keyspace is attacked. Per-IP limiting, plus a global ceiling,
plus an `auth_attempts` audit table.

Note what rate limiting *cannot* do: it protects the **service**, not any individual user. A
distributed attacker sampling the keyspace slowly will eventually hit *somebody's* code. With 34
billion combinations that is a long way off, and the prize is a stranger's flashcard garden. This is
stated so nobody later mistakes rate limiting for safety.

---

## 5. Data ownership

**One Postgres server. Several databases. One owner each.**

```
┌─ platform-db (one pod, Postgres 16) ───────────┐   ┌─ vmcp-db (as it is today) ─┐
│                                                │   │                            │
│   database: auth   ← platform-auth             │   │   open-vMCP                │
│     identities, auth_attempts                  │   │   mcp_servers, tool_calls  │
│                                                │   │   users.external_id = sub  │
│   database: quiz   ← the quiz server           │   │                            │
│     progress                                   │   │                            │
└────────────────────────────────────────────────┘   └────────────────────────────┘
```

Sharing a **server** is resource consolidation: one pod, one backup, one thing to operate.
Sharing a **schema** is coupling, and is not done here. Each service has its own database and its own
role; none can read or migrate another's tables. They exchange `sub`, and that is the entire
contract.

That distinction is the whole point. Two services reading one schema is the distributed-monolith
trap: a migration in one silently breaks the other, and neither can be deployed independently — and
you would have coupled them at the worst possible layer while believing you had saved a pod.

`vmcp-db` stays where it is. Folding its live data into `platform-db` is a migration, not a freebie,
and it buys nothing today.

---

## 6. Quiz progress: a document, not a schema

The quiz's data is **not relational, and never was**. It is one nested JSON document per player —
a garden of cells, a list of sessions each carrying its own notes map, a mid-quiz snapshot holding an
entire question queue, and per-card statistics. It was designed as a localStorage blob and it reads
like one.

The temptation is to "do it properly": tables for sessions, cards, garden cells, foreign keys, joins.
That is a great deal of modelling to reproduce, exactly, a document that already exists — followed by
a great deal of assembly to hand it back to a client that wants it as one object again.

```sql
CREATE TABLE progress (
  sub         uuid PRIMARY KEY,        -- the JWT's sub. No FK: auth owns identity, quiz owns progress.
  data        jsonb NOT NULL,          -- the localStorage document, verbatim
  -- DERIVED from `data` by the server on every write. NEVER accepted from the client.
  coins       integer NOT NULL DEFAULT 0,
  correct     integer NOT NULL DEFAULT 0,
  answered    integer NOT NULL DEFAULT 0,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX progress_coins_idx ON progress (coins DESC);
```

### The promoted columns are derived, never supplied

`coins`, `correct` and `answered` exist so a leaderboard is possible without reading every blob. They
are a **projection of `data`**, extracted server-side on write — the client sends only the document.

If the client could send them independently, it could send a document with 10 coins and a `coins`
column claiming 10,000, and the leaderboard would be forgeable by anyone holding a bearer token.
Deriving them makes that impossible, and makes the two disagreeing structurally unrepresentable
rather than merely unlikely.

### `version` exists because last-write-wins destroys gardens

One identity, two browsers. Someone plays on their phone, opens their laptop, and the laptop's stale
document overwrites an evening's progress — silently, with no error and nothing to roll back to.

So the client sends the `version` it read, and a mismatch is a **409**, not a clobber. What the client
does with the 409 (merge, prompt, refetch) is a UI decision; what the *server* must not do is throw
data away without saying so.

This is settled now, deliberately, because the alternative is settling it after someone loses a
garden.

---

## 7. Tying existing data to a user

### vMCP — nearly free

It already has a `users` table keyed on `external_id`, populated from a token claim, and a
`claimMappings` config that maps a claim path to a user id. The work is:

1. Implement real verification (the `verify: true` path is currently **dead code** — setting the flag
   changes nothing, which is a trap in waiting).
2. Point `jwksUri` at this service and map `sub` → `userId`.
3. Show `handle` in the dashboard, never the code.

### The quiz — the work is the migration, not the schema

The quiz has **no server-side storage at all**. Everything is one localStorage key
(`flashcards_v2`), and the quiz server is stateless. So this means:

- `GET /api/progress` / `PUT /api/progress` on the quiz server, authenticated by the bearer token,
  keyed by `sub`. The storage shape is settled in §6 — a document, not a schema.
- A **migration path**: on first sign-in, upload whatever is already in localStorage. Existing
  players must not lose their gardens, and there is no way to ask anyone to re-earn one.
- The **conflict rule** (§6): optimistic concurrency on `version`, and a 409 rather than a silent
  overwrite.

The schema is the easy half. The migration and the conflict rule are the half that can lose somebody
a garden, which is why they are decided up front rather than discovered.

## 8. Phases

1. **platform-auth** — codes, tokens, JWKS, rate limiting, its own database. *(this)*
2. **vMCP verification** — implement `verify: true`, wire it to JWKS, display handles. *(this)*
3. **Quiz progress API** — a database, an authenticated read/write endpoint, a localStorage migration
   and a conflict rule. *(next)*
4. **Front end** — sign-up, sign-in, "remember this code" UI. *(deliberately not yet)*
