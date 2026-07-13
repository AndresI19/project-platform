# portfolio-home

The home page of [project-platform.me](https://andres.project-platform.me) — and the source of truth
for **`@platform/ui`**, the shared design system the platform's front ends build from.

Vanilla TypeScript, Vite, and a small Express server. No framework, no database. The entire page —
every project card, every list row, the bio, the contact chips — renders from one data file,
[`src/client/data.ts`](src/client/data.ts). To change the site you edit data, not markup.

---

## Quick start

```bash
git clone https://github.com/AndresI19/portfolio-home.git
cd portfolio-home
npm install
npm run dev              # http://localhost:3000
```

Nothing else is needed. `@platform/ui` lives **inside this repo**, so a fresh clone builds with no
extra checkouts, and `docker build .` works with no flags.

---

## Running the server

| | |
|---|---|
| `npm run dev` | Vite dev server with HMR. |
| `npm run build` | Builds the client into `dist/client`. |
| `npm start` | Express serves `dist/client` + the API routes. Needs a build first. |
| `npm run serve` | `build` then `start`, in one step. |
| `npm test` | Vitest. |
| `npm run typecheck` | `tsc --noEmit`. |

The server prints what it resolved at boot, so a misconfiguration is visible immediately rather than
at the first request:

```
portfolio-home listening on http://localhost:3000
  vMCP API   : (same-origin /vmcp/api)
  greetings  : logged to stdout (DISCORD_WEBHOOK_URL unset)
```

### In a container

```bash
docker build -t home .
docker run -p 3000:3000 home
docker run -p 3000:3000 -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/…" home
```

Behind the platform's reverse proxy it runs as the `home` service and is not published directly —
see `platform-orchestration` for the Compose stack.

---

## Environment variables

**All three are optional — the server runs with an empty environment.** They are validated once at
boot ([`src/server/env.ts`](src/server/env.ts)), so a value that is set and *wrong* fails immediately
with the variable named, instead of misbehaving quietly at request time.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the server listens on. Must be an integer, 1–65535. |
| `VMCP_API_BASE` | *(empty)* | Absolute origin of the vMCP data API the liveness badges read from. Empty means same-origin (`/vmcp/api`) — the local and Compose deployment. Set it when the front end and the API live on different hostnames. Must be an absolute URL; a bare hostname is rejected. |
| `DISCORD_WEBHOOK_URL` | *(empty)* | Where the optional "Who are you?" greeting is relayed. Empty means the greeting is logged to stdout instead — that is a supported mode, not a failure. |

Copy [`.env.example`](.env.example) to `.env` (gitignored) to set them locally.

> **`DISCORD_WEBHOOK_URL` is a credential.** Anyone holding that URL can post to your channel. It is
> never logged and never echoed into an error message — a malformed one is reported as `<redacted>` —
> and `.env*` is gitignored. If it ever leaks, regenerate the webhook in Discord: the URL is the only
> thing protecting it.

---

## The shared design system

`@platform/ui` lives at [`packages/platform-ui/`](packages/platform-ui). **This repo is its source of
truth.** It holds only what the platform's front ends must agree on:

| Export | What |
|---|---|
| `@platform/ui/tokens.css` | Design tokens — surfaces, text, lines, the navy accent, elevation. Light and dark. |
| `@platform/ui/base.css` | Reset, the page's background wash, the `.wrap` content column. |
| `@platform/ui/server` | `serveClient()` — health probe, static assets with the right cache policy, SPA fallback. |
| `@platform/ui/tsconfig.base.json` | The compiler options both apps extend. |

It exists because *"the two sites match"* used to be enforced by copy-paste — and that broke the first
time one site's accent changed and the other's did not. It is deliberately small: the apps share about
a hundred lines. They do **not** share components, state or routing, because they genuinely have none
of those in common.

### How other repos get it

This repo consumes it directly (`file:packages/platform-ui`). Other repos consume it from a published
mirror at [`AndresI19/platform-ui`](https://github.com/AndresI19/platform-ui) — for instance
[data-driven-quiz-server](https://github.com/AndresI19/data-driven-quiz-server) vendors that mirror as
a git submodule.

**The mirror is generated, never edited.** Publish a change from here:

```bash
npm run publish:ui     # git subtree push --prefix packages/platform-ui platform-ui main
```

Consumers then bump their submodule. Editing the mirror directly would recreate exactly the drift the
package exists to prevent.

---

## Layout

```
src/
  client/
    data.ts        the whole site's content — projects, experience, bio, contacts
    view.ts        pure builders: data -> HTML (no DOM, no fetch, no state)
    liveness.ts    polls the vMCP gateway and lights the live/offline badges
    greet.ts       the first-visit "Who are you?" dialog
    icons.ts       inline SVG marks
    diagrams.ts    the drawn graphics (the vMCP schematic, the `docker ps` mock)
    util.ts        esc / slug / fmtDate / tab — pure, tested
    main.ts        bootstrap: render, greet, start polling
  server/
    env.ts         the config surface, validated at boot
    index.ts       Express: the API routes + the built client
packages/
  platform-ui/     the shared design system — this repo is its source of truth
```

## API

| Route | |
|---|---|
| `GET /api/health` | `{"ok":true}` — what the platform's liveness probe reads. |
| `GET /api/config` | `{"vmcpApiBase":"…"}` — runtime config, so one image runs locally and in production. |
| `POST /api/hello` | The optional greeting. Rate-limited to 5/hour per IP; relays to Discord, or logs to stdout. |
