import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Express } from 'express';
import express from 'express';

export interface ServeClientOptions {
  /** Absolute path to the Vite build output (the directory holding index.html and assets/). */
  clientDir: string;
  /**
   * URL prefix the app is mounted under behind the reverse proxy, e.g. '/cloud-developer-quiz/'.
   * Must match Vite's `base`. Defaults to the root, which is what an app at '/' wants.
   */
  base?: string;
  /** Name used in the "not built yet" message and the listen log. */
  appName?: string;
}

/**
 * Mount a built Vite client: a health probe, static assets with a correct caching policy, an SPA
 * fallback, and a legible 503 when the client isn't built. Shared not to save thirty lines but because
 * the caching rule is subtle and silent to get wrong: hashed assets are immutable for a year,
 * index.html must NOT be, or a deploy never reaches anyone holding a cached copy.
 *
 * Call this LAST — it registers a catch-all for the SPA fallback, so any API route after it is shadowed.
 */
export function serveClient(app: Express, opts: ServeClientOptions): void {
  const { clientDir, base = '/', appName = 'app' } = opts;
  // '' at the root, else '/cloud-developer-quiz' — every route hangs beneath it.
  const b = base.replace(/\/$/, '');

  app.get(`${b}/api/health`, (_req, res) => res.json({ ok: true }));

  if (!existsSync(clientDir)) {
    // Answer *something* coherent rather than 404ing every route, so a missing build is diagnosed
    // in one request instead of looking like a routing bug.
    app.get(`${b}/*`, (_req, res) =>
      res.status(503).send(`${appName}: client not built yet. Run \`npm run build\` first.`),
    );
    return;
  }

  app.use(
    b || '/',
    express.static(clientDir, {
      setHeaders(res, path) {
        // Vite fingerprints every asset it emits, so those may be cached forever. Anything else —
        // index.html above all — must be revalidated, or clients would pin an old build.
        if (path.includes('/assets/') || /\.[0-9a-f]{8}\./.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // The SPA fallback — for NAVIGATION only. A request that looks like a file and reaches here means
  // express.static didn't find it, so answering index.html would be a 200-stamped lie with an ugly
  // failure: Vite fingerprints bundles, so a browser holding an older index.html asks for
  // `/assets/index-OLD.js`, gets HTML with a JS content-type, and dies on `Unexpected token '<'` —
  // reading as a browser problem (a fresh device is fine, clearing site data "fixes" it). A 404 is the
  // honest, recoverable answer. Same lie once hit a missing `/resume.pdf` (see portfolio-home's
  // CLAUDE.md). Client routes are extension-free, so this can't swallow one.
  app.get(`${b}/*`, (req, res) => {
    if (req.path.includes('/assets/') || /\.[a-z0-9]{2,5}$/i.test(req.path)) {
      res.status(404).end();
      return;
    }
    res.sendFile(resolve(clientDir, 'index.html'));
  });
}
