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
npm run lint        # biome check src   — CI runs this; it fails the build
npm test            # vitest run  (7 files, ~142 cases)
```

**Static gates: `lint` and `typecheck`, and CI enforces both.** `npm run lint` is Biome (formatting +
import sorting) over `src` only — `test/` is not covered. `npx biome check --write src` applies the safe
fixes. Run it before opening a PR: formatting alone will fail the `home` job.

## Layout

- `src/client/` — `data.ts` (**all site content lives here**: projects, experience, bio, links),
  `view.ts` (pure data→HTML), `liveness.ts` (polls the vMCP gateway to light up status badges),
  `architecture.ts` (the four diagram builders) + `architecture-toggle.ts` (the pull-down/slider
  controller), `diagrams.ts` (the inline-SVG assets), `main.ts` (entry). The first-visit dialog now
  lives in the shared `@platform/ui` gate, not a local module.
- `src/server/` — `index.ts` (Express), `env.ts` (**all** `process.env` reading happens here, and it
  is validated at boot).
- `packages/platform-ui/` — the shared design system. Tokens, base CSS, `tsconfig.base.json`, and
  `serveClient()`.
- `public/` — `resume.pdf` and images.

## Routes

`GET /api/config` → `{ vmcpApiBase }` · `POST /api/hello` (the greeting) · `GET /version` →
`{ version, platform }` · `GET /api/versions` → `{ platform, components: {…} }` ·
`GET /resume.pdf` · `PUT /api/content/*` (admin) · then `serveClient()`.

Two different things, hence two fields. `version` is **this image's own**, baked in and fixed for the
life of the container. `platform` is the **orchestration repo's**, read from `platform-version.json`
on the shared volume (mounted read-only at `/content`): the platform ships no image, so its version
cannot ride in one. It is read **per request** — a deploy rewrites that file, and reading it at
startup would mean a rollout just to report the truth. In `/api/versions`, `platform` is a sibling of
`components`, not a member: it has no image, no Pod and no Service.

`/api/versions` fans out to the other components over in-cluster service DNS (`src/server/versions.ts`).
That fan-out is **on the server on purpose**: `rs-mcp-server` and `platform-auth` have no public route
for `/version`, and in production the API is a different origin, so a browser-side fetch would be a
CORS problem as well as a routing one. The client asks once per page load and never polls — a version
cannot change without a new image, and that means new pods.

`serveClient()` (in `@platform/ui`) adds `GET /api/health`, the static handler, and a `/*` SPA
fallback. **It must stay last** — it ends in a catch-all that shadows anything registered after it.

`GET /resume.pdf` and `PUT /api/content/*` live in `src/server/content.ts`. The résumé is read **per
request** from the volume's directory mount at `/content`, for the same reason `platform-version.json`
is: it is content, it changes on a different clock than the image, and reading it per request means a
swap needs no rollout. `PUT /api/content/*` writes that volume, admin-only, against an **allowlist**
(`resume.pdf`, `cards/<name>.yaml`) — not a path sanitiser. See "The content volume" below.

## Gotchas

- **`serveClient()` must be the last route registered.** Anything after it is shadowed by
  `index.html`. This is the single easiest way to break the server.
- **`publicDir` is explicitly overridden in `vite.config.ts`.** Vite's `root` is `src/client`, so
  without pointing `publicDir` back at the project-root `public/`, `resume.pdf` is never copied into
  the build and `/resume.pdf` silently falls through the SPA catch-all and returns `index.html`. This
  records a real past bug — don't "clean it up".
- **The server is bundled for the image, but not for `npm start`.** Locally, `npm start` runs
  `tsx src/server/index.ts` straight from source. The **image** does not: the Dockerfile esbuilds
  `src/server` into one self-contained `dist/server/index.mjs` with every dependency inlined, and the
  runtime stage ships `dist/` alone — no `node_modules`, no npm. So a new runtime dependency has to
  survive **bundling** (`--platform=node --format=esm`), not merely be installed; build the image
  before believing it works.
- **The version is served, not baked.** There is no `__APP_VERSION__` define any more. It used to be
  injected by Vite from `package.json` at *build* time, which described the source tree and only
  changed when someone ran `npm version` — it could not say what was actually deployed. The image now
  carries a `VERSION` file (stamped by `k8s/deploy.sh` from the repo's latest git tag, suffixed
  `-snapshot` when the source differs from `main`), the server reads it once at startup, and the page
  fetches it. Don't reintroduce a build-time version constant.
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
| `AUTH_JWKS_URI` | platform-auth's JWKS. **Unset is a supported mode, and it is the switch**: with no value, `PUT /api/content/*` is not registered at all. |
| `AUTH_ISSUER` | issuer the token must claim. **Required once `AUTH_JWKS_URI` is set** — half-set fails at boot, because a JWKS with no issuer verifies signatures while accepting anyone's token. |
| `AUTH_AUDIENCE` | audience the token must claim. Default `platform`. |
| `CONTENT_DIR` | the content volume's directory mount. Default `/content`. Existence is not checked — a dev checkout has none, and that is supported. |
| `UPLOAD_MAX_BYTES` | largest upload accepted. Default 5 MiB. |

## The content volume

In the cluster, the résumé lives on the `platform-content` PersistentVolume, mounted **as a directory**
at `/content` (read-write), and is served by `GET /resume.pdf` reading it **per request**. `public/resume.pdf`
is the seed default: the `seed-resume` initContainer `cp -n`s it onto the volume, and the server falls
back to the image's copy when the volume has none (which is what makes `npm run dev` work).

- **It used to be a `subPath` single-file mount over `/app/dist/client/resume.pdf`. Do not put that
  back.** A subPath mount is a bind mount pinned to the source file's **inode** at container start.
  Replacing the file on the volume creates a new inode (`kubectl cp` untars = unlink + create), and the
  mount serves the old, unlinked inode for the life of the pod. That is why swapping the résumé used to
  require `rollout restart`. Directory mounts resolve names per lookup and have no such problem.
- **`GET /resume.pdf` must stay registered above `serveClient()`.** Not just because of the catch-all:
  Vite still copies `public/resume.pdf` into `dist/client/`, so without the route `express.static`
  serves the **image's stale copy** — a 200 that is indistinguishable from the bug above.
- **`PUT /api/content/*` is bounded by an allowlist, not by the filesystem.** `/content` is owned
  1000:1000 and this process is uid 1000, so once the mount is writable nothing below the allowlist
  stops a write — including to `platform-version.json`, which the deploy pipeline owns and the
  allowlist deliberately excludes.
- Writing `cards/*.yaml` does **not** take effect until the quiz restarts (it builds decks at boot), and
  a malformed deck fails that boot. The response says so.

## Editing @platform/ui

`packages/platform-ui/` is consumed by `data-driven-quiz-server`, which vendors this whole repo as a
**git submodule** pinned to a commit. A change here does not reach the quiz until that submodule
pointer is bumped. It ships raw TS/CSS with **no build step** — both consumers resolve the `exports`
map straight to source via `"moduleResolution": "bundler"`.
