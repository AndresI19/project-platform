# @platform/ui

The shared layer behind the project-platform front ends.

It holds only what those apps must **agree on**. Everything else stays in the app that uses it.

| Export | What it is |
|---|---|
| `@platform/ui/tokens.css` | Design tokens — surfaces, text, lines, the navy accent, elevation. Light and dark. |
| `@platform/ui/base.css` | Reset, the page's background wash, and the `.wrap` content column. |
| `@platform/ui/server` | `serveClient(app, opts)` — health probe, static assets with the right cache policy, SPA fallback. |
| `@platform/ui/tsconfig.base.json` | The compiler options both apps extend. |

## Where this lives

This package lives in **[portfolio-home](https://github.com/AndresI19/portfolio-home)**, at
`packages/platform-ui` — the only copy, edited and consumed from here.

There is deliberately no published mirror: a mirror is one more artefact that can fall out of step,
which is the exact failure this package exists to prevent.

## Why it exists

The home page's stylesheet used to open with a comment saying its tokens were *"copied verbatim from
the quiz so the two sites match."* Copy-paste enforced that, and it broke the first time one site's
accent changed and the other's did not. Define the tokens once and both sites move together.

It is deliberately small: the apps share roughly a hundred lines — tokens, a page background, a
static-file middleware — and **no** components, state, or routing, because they have none of those in
common. A shared package reaching further than the shared reality is just a slower way to write two
different things.

## Consuming it

**From the source repo** (portfolio-home), directly:

```json
"dependencies": { "@platform/ui": "file:packages/platform-ui" }
```

**From any other repo**, by vendoring portfolio-home as a submodule — this is what
[data-driven-quiz-server](https://github.com/AndresI19/data-driven-quiz-server) does:

```bash
git submodule add https://github.com/AndresI19/portfolio-home.git vendor/portfolio-home
```

```json
"dependencies": { "@platform/ui": "file:vendor/portfolio-home/packages/platform-ui" }
```

Use `.dockerignore` to keep only `vendor/portfolio-home/packages/` in the build context, so the
consumer does not ship the whole home page to get ~100 lines of CSS.

Either way the package sits **inside** the consuming repo, so `npm ci` resolves it from a fresh clone
and `docker build .` works with no extra flags. Clone consumers with `--recurse-submodules`.

## Using it

In the client entrypoint, import the shared layers before the app's own stylesheet, so the app can
override anything it needs to:

```ts
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import './styles.css';
```

In the server, mount the client **last** — `serveClient` ends in a catch-all for the SPA fallback, so
any route added after it would be shadowed by `index.html`:

```ts
import { serveClient } from '@platform/ui/server';

app.get('/api/whatever', handler);            // app routes first
serveClient(app, { clientDir: CLIENT_DIR, base: '/', appName: 'portfolio-home' });
```

There is no build step. The package ships TypeScript and CSS source, which Vite bundles and `tsx`
transpiles directly — both apps set `"moduleResolution": "bundler"`, which resolves the `exports` map
above straight to source.

## Adding a token

Add it here only if **both** apps need it. A token one app consumes is not a design system, it is a
global variable — put it in that app's stylesheet instead. The quiz's correct/incorrect greens and
reds, and the home page's per-section hues, are all correctly app-local for exactly this reason.
