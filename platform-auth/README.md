# platform-auth

Identity for the platform: a username and a chosen password, exchanged for a signed JWT.

> **This is pseudonymous identity, not high-value security.** The username is public and the password
> is the entire credential — anyone holding both *is* that user. It is a locker with a combination you
> chose, not a bank login. Nothing sensitive is ever stored behind it: no email, no real name, no PII.
> See [DESIGN.md](DESIGN.md). *(Earlier this service issued a server-generated code instead of a
> password; DESIGN.md §1 keeps that history because it explains the current defences.)*

## How it works

```
  browser                        platform-auth                     open-vMCP / quiz API
     │                                 │                                    │
     │  POST /auth/identities          │                                    │
     │    { username, password }       │                                    │
     ├────────────────────────────────►│  hash password + mint sub          │
     │◄────────────────────────────────┤  { username, token }               │
     │                                 │   (password is never returned)     │
     │                                 │                                    │
     │  POST /auth/token               │                                    │
     │    { username, password }       │                                    │
     ├────────────────────────────────►│  find by username → verify → JWT   │
     │◄────────────────────────────────┤  { token }                         │
     │                                 │                                    │
     │  Authorization: Bearer …                                             │
     ├─────────────────────────────────────────────────────────────────────►│
     │                                 │◄── GET /.well-known/jwks.json ─────┤
     │                                 │    (public key; verifiers can       │
     │                                 │     CHECK a token, never MINT one)  │
```

## Three values, deliberately distinct

| | Example | Where it may appear |
| --- | --- | --- |
| **password** | chosen by the user | Sent on sign-up/sign-in. Never logged, never in a token, never returned. |
| **username** | `andres` | The user's screen, dashboards, the vMCP User column, leaderboards. Safe to show anyone. |
| **sub** | a UUID | Inside JWTs; the foreign key every other service stores. |

The password is **not** the user id. The public identity is the username; the password only proves it
is yours. See DESIGN.md §2.

The password is **not stored**, either: the database holds `scrypt(pepper + password, salt)`, salted
per row and self-describing. Login finds the row by username, then verifies — slow (scrypt), salted
(users are independent), and peppered (a stolen dump reveals nothing without a secret it does not
contain).

## API

| | |
| --- | --- |
| `POST /auth/identities` | Mint an identity from `{ username, password }`. Returns `{ username, token, expiresIn }`. |
| `POST /auth/token` | `{ username, password }` → `{ token, username, expiresIn }`. Rate-limited. |
| `GET /auth/me` | Bearer → `{ sub, username, exp }`. Verifies, does not merely decode. |
| `GET /auth/usernames/:name` | Whether a username is well-formed and available. |
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

`npm test` — 14 tests. They assert the properties that matter: a chosen password verifies and a
near-miss does not, the stored hash is salted and useless without the pepper, and the token never
carries the password.

## Sharp edges

- **The rate limiter is in-process**, and this service is single-replica. Scale it out and each
  replica enforces its own limit, silently multiplying the real ceiling by the replica count. That is
  the first thing to fix if it ever needs more than one pod.
- **Rate limiting protects the service, not the user.** A patient distributed attacker sampling the
  keyspace will eventually land on somebody's code. 34 billion combinations makes that a long way
  off, and the prize is a stranger's flashcard garden. Do not mistake it for safety.
- **A forgotten password is lost.** There is still no recovery, because recovery would need an email,
  and an email would be PII. The user chooses the secret now, but a forgotten one is gone.
- **A chosen password is a weaker floor than the old code.** The 7-char code was 34 billion uniform
  values the server guaranteed; a user picks worse. scrypt + salt + pepper defend the *dump*, and the
  8-char minimum is the only floor on *online* guessing. Do not mistake either for strong auth.
