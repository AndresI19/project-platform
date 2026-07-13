import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// The version badge reads package.json rather than a hand-kept string, so `npm version` is the only
// place a release number is ever typed — the page cannot drift out of sync with the package.
const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

// The home page lives at the proxy root (`/`), so no `base` is needed — unlike the
// sub-mounted quiz (/cloud-developer-quiz/) and vMCP (/vmcp/) apps.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  root: resolve(__dirname, 'src/client'),
  // `root` moves Vite's default publicDir to src/client/public, which does not exist — so the
  // résumé PDF was never copied into the build and /resume.pdf fell through to the SPA catch-all,
  // answering with index.html. Point publicDir back at the real public/ at the project root.
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    sourcemap: true,
  },
  // Same PORT env the Express server reads, so dev and prod share one URL. Default 3000.
  server: { host: true, port: Number(process.env.PORT) || 3000 },
});
