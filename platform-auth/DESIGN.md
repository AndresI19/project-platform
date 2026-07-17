# platform-auth — design

A username, a chosen password, a signed token, and an honest name for what that is.

> **History.** This service originally issued a **server-generated 7-character code** as the entire
> credential; it now takes a **user-chosen password**. Sections are written in the present tense of the
> password model, keeping the old rationale inline where it explains the current defences.

---

## 1. What this is, and what it is not

A user brings a **username** and a **password**. The username is public; the password is the entire
credential. There is no email, no second factor, and no recovery — forget the password and the
identity is gone.

**This is pseudonymous identity, not high-value security.** Anyone holding the username and password
*is* that user. The right mental model is a locker with a combination you chose, not a bank login.

That is a perfectly good trade for what it carries — quiz progress, a garden, and attribution of MCP
tool calls. It is a *terrible* trade for anything else, so the rule is absolute:

> **Nothing sensitive is ever stored behind this credential. No email, no real name, no PII, ever.**

The credential used to be a server-generated 7-character Crockford-base32 code — **32⁷ ≈ 34 billion**
uniform combinations, an entropy floor the server guaranteed. A user-chosen password moves that floor
onto the user, who picks worse than a CSPRNG. Two things follow: a **minimum length** is the only
entropy we can insist on, and the hash must be **slow and salted** (§2), no longer assuming a high-entropy input.

---

## 2. The code is NOT the user id

The one structural decision everything else follows from. If the credential doubles as the user id it
appears wherever a user id does — and vMCP's dashboard has a **User column on a publicly readable API**,
so every visitor would be shown other people's credentials. Rate limiting would be beside the point.

So three distinct things:

| | What | Where it may appear |
| --- | --- | --- |
| **password** | the secret the user chooses | Sent on sign-up and sign-in. Never logged, never in a token, never in any API response. |
| **username** | the public identity the user chooses | The user's own screen, dashboards, leaderboards, the User column. Safe to show anyone. |
| **sub** | a UUID — the stable internal identity | Inside JWTs; as a foreign key in every service's database. |

The token carries `sub` and `username`. **It never carries the password.**

(The username replaced an earlier server-invented `handle`; the reason a separate *public* identity
exists — the credential must never be the thing printed on a public dashboard — is unchanged.)

### The password is not stored, and the lookup key changed with it

The old code was stored as `HMAC-SHA256(pepper, code)`, **unique-indexed**, and login was a single read
*by that hash* — safe only because the code was high-entropy (34 billion uniform inputs can't be
dictionary-attacked) and, being deterministic, could be the index.

A chosen password breaks both halves: it is low-entropy (a fast hash would be dictionary-crackable from
a dump) and must be **salted per row** (so it is no longer deterministic and can't be the lookup key).
So the access path changes:

- **login finds the row by `username`** — unique and indexed — and *then* verifies the password;
- the stored value is `scrypt(pepper + password, per-row salt)`, self-describing (`scrypt$N$r$p$salt$hash`).

Three defences layer here, each covering what the next cannot:

- the **salt** (beside the hash) means one cracked password doesn't crack the rest, and equal passwords
  don't collide to equal hashes;
- **scrypt's slowness** makes offline guessing cost real time per candidate;
- the **pepper** (a sealed secret, never in the database) means a stolen dump — salts and all — can't
  begin without a secret it doesn't contain.

scrypt is Node's stdlib; argon2/bcrypt were declined only to avoid a native build dependency in the
image, not on the merits — the self-describing format lets the parameters or the algorithm change
later without a migration.

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
  "sub": "0b7f…-uuid",         // the identity. NOT the password.
  "username": "andres",        // safe to display
  "admin": false,              // computed by the issuer from a sealed list — see tokens.ts
  "aud": "platform",
  "iat": 1752460000,
  "exp": 1752546400,           // 24h
  "jti": "…"
}
```

**24-hour access tokens, no refresh tokens.** The browser already holds the password (or the user would
re-type it every visit), so re-minting is one `POST /auth/token`. A refresh token would be a second
long-lived credential guarding one we already store — complexity for nothing.

---

## 4. API

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/identities` | Mint a new identity from `{ username, password }`. Returns `{ username, token, expiresIn }`. The password is hashed on arrival and never returned. |
| `POST /auth/token` | `{ username, password }` → `{ token, username, expiresIn }`. Rate-limited hard. |
| `GET /auth/me` | Bearer → `{ sub, username, exp }`. Verifies, does not merely decode. |
| `GET /auth/usernames/:name` | Is a username well-formed and available? Usernames are public, so this leaks nothing the dashboard would not. |
| `GET /.well-known/jwks.json` | The public keys, with `kid`, so verifiers can rotate. |
| `GET /health` | Liveness. |

### Rate limiting is the only online defence

`POST /auth/token` is where credentials are attacked online. Per-IP limiting, plus a global ceiling,
plus an `auth_attempts` audit table. On a **missing** username the endpoint still runs one scrypt
verification against a dummy hash before denying — otherwise a miss would return faster than a wrong
password and leak which usernames exist.

What rate limiting *cannot* do: it protects the **service**, not any user, and does nothing about
*offline* guessing from a stolen dump — that's what scrypt and the pepper (§2) are for. A distributed
attacker guessing common passwords online will eventually hit *somebody's*, nearer now than under the
old 34-billion code. The prize is still a stranger's flashcard garden. Stated so nobody mistakes rate
limiting for safety.

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

Sharing a **server** is resource consolidation: one pod, one backup, one thing to operate. Sharing a
**schema** is coupling, and is not done here — each service has its own database and role; none can
read or migrate another's tables. They exchange `sub`, and that is the entire contract. Two services
reading one schema is the distributed-monolith trap: a migration in one silently breaks the other and
neither deploys independently — coupled at the worst layer while believing you saved a pod.

`vmcp-db` stays where it is. Folding its live data into `platform-db` is a migration, not a freebie,
and it buys nothing today.

---

## 6. Quiz progress: a document, not a schema

The quiz's data is **not relational, and never was**. It is one nested JSON document per player —
a garden of cells, a list of sessions each carrying its own notes map, a mid-quiz snapshot holding an
entire question queue, and per-card statistics. It was designed as a localStorage blob and it reads
like one.

The temptation is to "do it properly": tables for sessions, cards, garden cells, foreign keys, joins —
a great deal of modelling to reproduce a document that already exists, then a great deal of assembly to
hand it back to a client that wants it as one object again.

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

`coins`, `correct` and `answered` exist so a leaderboard is possible without reading every blob — a
**projection of `data`**, extracted server-side on write; the client sends only the document. If the
client could send them independently it could claim a `coins` column of 10,000 over a 10-coin document,
forging the leaderboard. Deriving them makes the two disagreeing structurally unrepresentable.

### `version` exists because last-write-wins destroys gardens

One identity, two browsers: play on your phone, open your laptop, and the laptop's stale document
overwrites an evening's progress — silently, nothing to roll back to. So the client sends the `version`
it read, and a mismatch is a **409**, not a clobber. What the client does with it (merge, prompt,
refetch) is a UI decision; what the *server* must not do is throw data away without saying so. Settled
now, because the alternative is settling it after someone loses a garden.

---

## 7. Tying existing data to a user

### vMCP — nearly free

It already has a `users` table keyed on `external_id`, populated from a token claim, and a
`claimMappings` config that maps a claim path to a user id. The work is:

1. Implement real verification (the `verify: true` path is currently **dead code** — setting the flag
   changes nothing, which is a trap in waiting).
2. Point `jwksUri` at this service and map `sub` → `userId`.
3. Show `username` in the dashboard, never the password.

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

1. **platform-auth** — passwords, tokens, JWKS, rate limiting, its own database. *(this)*
2. **vMCP verification** — implement `verify: true`, wire it to JWKS, display usernames. *(this)*
3. **Quiz progress API** — a database, an authenticated read/write endpoint, a localStorage migration
   and a conflict rule. *(next)*
4. **Front end** — sign-up, sign-in, "remember this code" UI. *(deliberately not yet)*
