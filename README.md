# portfolio-home

A personal home page and project index, built with **Vanilla TypeScript + Vite** and served by a
tiny serve-only **Express** server. It is the `/` root behind the platform's nginx reverse proxy;
the two live front-ends it links to (the Cloud Developer Quiz and the open-vMCP dashboard) are
mounted at `/cloud-developer-quiz/` and `/vmcp/` by that same proxy.

## Edit the content

Everything on the page renders from **`src/client/data.ts`** — name, title, bio, contact links, and
the project list. Two placeholders to fill in:

- `BIO` — the one-line bio (marked `EDIT ME`).
- `LINKS.linkedin` — your real LinkedIn URL (marked `EDIT ME`).

Front-end links use root-relative paths (`/cloud-developer-quiz/`, `/vmcp/`) so they resolve through
the proxy.

## Run

```bash
npm install
npm run dev      # Vite dev server (PORT env, default 3000)
# or a production check:
npm run serve    # build + serve dist/ with Express
npm run typecheck
```

## Docker

```bash
docker build -t portfolio-home .
docker run -p 3000:3000 portfolio-home
```

Behind the proxy it runs as the `home` service; only nginx is published externally. See the
`platform-orchestration` repo for the compose stack.
