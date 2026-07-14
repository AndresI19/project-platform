import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// There is no __APP_VERSION__ define any more. The version badge used to be baked in here from
// package.json at BUILD time, which meant it described the source tree and only ever changed when
// somebody remembered to run `npm version` — it could not tell you what was actually deployed.
// The page now reads /api/versions at runtime, so the number it shows is the one the running image
// reports (see src/client/versions.ts).

// The home page lives at the proxy root (`/`), so no `base` is needed — unlike the
// sub-mounted quiz (/cloud-developer-quiz/) and vMCP (/vmcp/) apps.
export default defineConfig({
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
