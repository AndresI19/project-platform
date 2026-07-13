# @platform/ui

The shared layer behind the project-platform front ends — [portfolio-home](../portfolio-home) and
[data-driven-quiz-server](https://github.com/AndresI19/data-driven-quiz-server).

It holds only what the two apps must agree on. Everything else stays in the app that uses it.

| Export | What it is |
|---|---|
| `@platform/ui/tokens.css` | Design tokens — surfaces, text, lines, the navy accent, elevation. Light and dark. |
| `@platform/ui/base.css` | Reset, the page's background wash, and the `.wrap` content column. |
| `@platform/ui/server` | `serveClient(app, opts)` — health probe, static assets with the right cache policy, SPA fallback. |
| `@platform/ui/tsconfig.base.json` | The compiler options both apps extend. |

## Why it exists

The home page's stylesheet used to open with a comment saying its tokens were *"copied verbatim from
the quiz so the two sites match."* That invariant was enforced by copy-paste, and it broke the first
time one site's accent changed and the other's did not. This package makes that failure impossible:
the accent is defined once, and both sites move together.

It is deliberately small. The apps share roughly a hundred lines — tokens, a page background, and a
static-file middleware. They do **not** share their components, their state, or their routing,
because they genuinely do not have those in common, and a shared package that reaches further than
the shared reality is just a slower way to write two different things.

## Using it

The apps depend on it by path, as siblings in the workspace:

```json
"dependencies": { "@platform/ui": "file:../platform-ui" }
```

In the client entrypoint, import the shared layers before the app's own stylesheet, so the app can
override anything it needs to:

```ts
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import './styles.css';
```

In the server, mount the client last — `serveClient` registers a catch-all for the SPA fallback, so
any route added after it would be shadowed by `index.html`:

```ts
import { serveClient } from '@platform/ui/server';

app.get('/api/whatever', handler);          // app routes first
serveClient(app, { clientDir: CLIENT_DIR, base: '/', appName: 'portfolio-home' });
```

There is no build step. The package ships TypeScript and CSS source, which Vite bundles and `tsx`
transpiles directly — both apps set `"moduleResolution": "bundler"`, which resolves the `exports`
map above straight to source.

## Containers

Each app's Docker build context is its own directory, so this package is passed in as a **named
build context** rather than being copied from a parent directory:

```yaml
build:
  context: ../portfolio-home
  additional_contexts:
    platform-ui: ../platform-ui
```

and, in the app's Dockerfile, before `npm ci`:

```dockerfile
COPY --from=platform-ui . /platform-ui
```

`file:../platform-ui` in `package.json` then resolves to `/platform-ui` inside the image, matching
the layout on a developer's machine. This keeps each app's build context small and lets the apps
stay separate repositories.

## Adding a token

Add it here only if **both** apps need it. A token one app consumes is not a design system, it is a
global variable — put it in that app's stylesheet instead. The quiz's correct/incorrect greens and
reds, and the home page's per-section hues, are all correctly app-local for exactly this reason.

<!-- published from portfolio-home/packages/platform-ui via `npm run publish:ui` -->
