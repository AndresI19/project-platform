# CLAUDE.md — portfolio-home

Guidance for Claude Code when working in this repo.

## What this is

The personal home page and project index at `andres.project-platform.me/`. Vanilla TypeScript — **no
UI framework** — with Vite for the client and Express for the server.

It is also **the source of truth for `@platform/ui`** (`packages/platform-ui/`), the shared design
system used by the sibling quiz app. That package is a load-bearing dependency of another repo; see
"Editing @platform/ui" below before you touch it.

**Platform context:** this app is mounted at `/` behind the platform's nginx router. See
`../platform-orchestration/ARCHITECTURE.md`.

## Commands

```bash
npm install         # must run before typecheck — tsconfig extends a file inside @platform/ui
npm run dev         # vite dev server
npm run build       # vite build → dist/client
npm start           # cross-env NODE_ENV=production tsx src/server/index.ts
npm run serve       # build && start
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (4 files, ~49 cases)
```

**There is no linter.** `typecheck` is the only static gate.

## Layout

- `src/client/` — `data.ts` (**all site content lives here**: projects, experience, bio, links),
  `view.ts` (pure data→HTML), `liveness.ts` (polls the vMCP gateway to light up status badges),
  `greet.ts` (the first-visit dialog), `main.ts` (entry).
- `src/server/` — `index.ts` (Express), `env.ts` (**all** `process.env` reading happens here, and it
  is validated at boot).
- `packages/platform-ui/` — the shared design system. Tokens, base CSS, `tsconfig.base.json`, and
  `serveClient()`.
- `public/` — `resume.pdf` and images.

## Routes

`GET /api/config` → `{ vmcpApiBase }` · `POST /api/hello` (the greeting) · then `serveClient()`.

`serveClient()` (in `@platform/ui`) adds `GET /api/health`, the static handler, and a `/*` SPA
fallback. **It must stay last** — it ends in a catch-all that shadows anything registered after it.

## Gotchas

- **`serveClient()` must be the last route registered.** Anything after it is shadowed by
  `index.html`. This is the single easiest way to break the server.
- **`publicDir` is explicitly overridden in `vite.config.ts`.** Vite's `root` is `src/client`, so
  without pointing `publicDir` back at the project-root `public/`, `resume.pdf` is never copied into
  the build and `/resume.pdf` silently falls through the SPA catch-all and returns `index.html`. This
  records a real past bug — don't "clean it up".
- **The server is never compiled.** `npm start` runs `tsx src/server/index.ts`, which is why the
  runtime Docker image keeps dev dependencies and copies `src/` + `tsconfig.json`. Dropping dev deps
  from the image breaks `npm start`.
- **`__APP_VERSION__` is a Vite `define`.** Anything importing `main.ts`/`view.ts` outside Vite must
  stub it (Vitest does, in `test/setup.ts`).
- **This app has no Vite `base`** because it sits at the proxy root — unlike the quiz
  (`/cloud-developer-quiz/`) and the dashboard (`/vmcp/`).
- The rate limiter on `/api/hello` (5/hour) is an **in-memory `Map` keyed on `req.ip`**, which comes
  from `X-Forwarded-For` because `trust proxy` is on. It is per-process: it resets on restart and
  does not work across replicas.

## Environment

All optional, all validated at boot in `src/server/env.ts`:

| Var | Effect |
| --- | --- |
| `PORT` | default 3000 |
| `VMCP_API_BASE` | where the client's liveness badges poll. Empty = same-origin. Served via `/api/config`. |
| `DISCORD_WEBHOOK_URL` | where `POST /api/hello` pushes the greeting. **Unset is a supported mode** — the server logs the greeting to stdout instead of dropping it. |

In the cluster, `resume.pdf` is **mounted from a PersistentVolume** over
`/app/dist/client/resume.pdf`, so it can be replaced without an image rebuild. The copy in `public/`
is the seed default.

## Editing @platform/ui

`packages/platform-ui/` is consumed by `data-driven-quiz-server`, which vendors this whole repo as a
**git submodule** pinned to a commit. A change here does not reach the quiz until that submodule
pointer is bumped. It ships raw TS/CSS with **no build step** — both consumers resolve the `exports`
map straight to source via `"moduleResolution": "bundler"`.
