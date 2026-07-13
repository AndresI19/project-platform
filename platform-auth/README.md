# platform-auth

Identity for the platform: a memorable code, exchanged for a signed JWT.

> **This is pseudonymous identity, not security.** A 7-character code is the entire credential —
> anyone holding it *is* that user. It is a cloakroom ticket, not a login. Nothing sensitive is ever
> stored behind it: no email, no real name, no PII. See [DESIGN.md](DESIGN.md).

## How it works

```
  browser                     platform-auth                     open-vMCP / quiz API
     │                              │                                    │
     │  POST /auth/identities       │                                    │
     ├─────────────────────────────►│  mints code + handle + sub         │
     │◄─────────────────────────────┤  { code, handle, token }           │
     │   ↑ the ONLY time the code    │   (code is never returned again)   │
     │     is ever sent              │                                    │
     │                              │                                    │
     │  POST /auth/token { code }   │                                    │
     ├─────────────────────────────►│  HMAC lookup → mint RS256 JWT      │
     │◄─────────────────────────────┤  { token }                         │
     │                              │                                    │
     │  Authorization: Bearer …                                          │
     ├──────────────────────────────────────────────────────────────────►│
     │                              │◄── GET /.well-known/jwks.json ─────┤
     │                              │    (public key; verifiers can       │
     │                              │     CHECK a token, never MINT one)  │
```

## Three values, deliberately distinct

| | Example | Where it may appear |
| --- | --- | --- |
| **code** | `4KP7R2M` | The user's own screen, once. Never logged, never in a token, never returned again. |
| **sub** | a UUID | Inside JWTs; the foreign key every other service stores. |
| **handle** | `2NZXF` | Dashboards, the vMCP User column, leaderboards. Safe to show anyone. |

The code is **not** the user id. If it were, it would be printed in vMCP's publicly-readable User
column — the credential would be published by design. See DESIGN.md §2.

The code is **not stored**, either: the database holds `HMAC-SHA256(pepper, code)`. Deterministic, so
login is one indexed read; keyed, so a stolen dump reveals nothing without the pepper.

## API

| | |
| --- | --- |
| `POST /auth/identities` | Mint an identity. Returns `{ code, handle, token }`. |
| `POST /auth/token` | `{ code }` → `{ token, handle, expiresIn }`. Rate-limited. |
| `GET /auth/me` | Bearer → `{ sub, handle, exp }`. Verifies, does not merely decode. |
| `GET /.well-known/jwks.json` | The public keys. |
| `GET /health` | |

## Run it

```bash
npm install
npm run keygen > signing.pem          # once. Then seal it; never commit it.

export DATABASE_URL=postgres://…
export AUTH_SIGNING_KEY="$(cat signing.pem)"
export AUTH_CODE_PEPPER="$(openssl rand -base64 48)"

npm run db:migrate
npm run dev
```

`npm test` — 13 tests. They assert the properties that matter: the alphabet excludes look-alikes, the
stored lookup is useless without the pepper, and the token never carries the code.

## Sharp edges

- **The rate limiter is in-process**, and this service is single-replica. Scale it out and each
  replica enforces its own limit, silently multiplying the real ceiling by the replica count. That is
  the first thing to fix if it ever needs more than one pod.
- **Rate limiting protects the service, not the user.** A patient distributed attacker sampling the
  keyspace will eventually land on somebody's code. 34 billion combinations makes that a long way
  off, and the prize is a stranger's flashcard garden. Do not mistake it for safety.
- **A lost code is lost.** There is no recovery, because recovery would need an email, and an email
  would be PII. That is the trade this identity makes.
