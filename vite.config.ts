import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The home page lives at the proxy root (`/`), so no `base` is needed — unlike the
// sub-mounted quiz (/cloud-developer-quiz/) and vMCP (/vmcp/) apps.
export default defineConfig({
  root: resolve(__dirname, 'src/client'),
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    sourcemap: true,
  },
  // Same PORT env the Express server reads, so dev and prod share one URL. Default 3000.
  server: { host: true, port: Number(process.env.PORT) || 3000 },
});
