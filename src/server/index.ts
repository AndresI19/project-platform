import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // project root
const CLIENT_DIR = resolve(ROOT, 'dist/client'); // vite build output (includes /assets)

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Static: the built client. Long cache for hashed assets, same policy as the quiz server.
if (existsSync(CLIENT_DIR)) {
  app.use(
    express.static(CLIENT_DIR, {
      setHeaders(res, path) {
        if (path.includes('/assets/') || /\.[0-9a-f]{8}\./.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('*', (_req, res) => res.sendFile(resolve(CLIENT_DIR, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res.status(503).send('Client not built yet. Run `npm run build` first (or `npm run dev`).'),
  );
}

app.listen(PORT, () => {
  console.log(`portfolio-home serving on http://localhost:${PORT}`);
});
