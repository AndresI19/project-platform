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
 * Mount a built Vite client: a health probe, the static assets with a correct caching policy, and
 * an SPA fallback — plus a legible 503 when the client has not been built.
 *
 * This is the block both front ends had copied byte-for-byte. It is shared not to save the thirty
 * lines but because the caching rule inside it is subtle and getting it wrong is silent: hashed
 * assets are immutable for a year, and index.html must NOT be, or a deploy would never reach anyone
 * still holding a cached copy. That is the kind of rule that should exist once.
 *
 * Call this LAST. It registers a catch-all for the SPA fallback, so any API route mounted after it
 * would be shadowed by index.html.
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

  app.get(`${b}/*`, (_req, res) => res.sendFile(resolve(clientDir, 'index.html')));
}
