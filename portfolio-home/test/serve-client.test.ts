import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { type Server, get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { serveClient } from '../packages/platform-ui/src/server.js';

// A real server on an ephemeral port, because what is under test is what an HTTP client RECEIVES — a
// status and a content-type — not what a function returns. Mocking express would assert the mock.
//
// Requests go through node:http rather than `fetch`. This suite runs in happy-dom (the client tests
// need a DOM), and happy-dom's fetch is a BROWSER fetch: it enforces CORS and blocks every request to
// 127.0.0.1 as cross-origin. Switching this file to the node environment is not the way out either —
// the shared test/setup.ts touches `window` and runs for every file. node:http is untouched by both.
let server: Server;
let port: number;

const req = (path: string): Promise<{ status: number; type: string; cacheControl: string }> =>
  new Promise((ok, fail) => {
    httpGet({ host: '127.0.0.1', port, path }, (res) => {
      res.resume(); // drain, or the socket stays open and the suite hangs on close
      ok({
        status: res.statusCode ?? 0,
        type: String(res.headers['content-type'] ?? ''),
        cacheControl: String(res.headers['cache-control'] ?? ''),
      });
    }).on('error', fail);
  });

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-client-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(dir, 'assets', 'index-AAAA1111.js'), 'export const live = 1;');
  writeFileSync(join(dir, 'resume.pdf'), '%PDF-1.4 fake');

  const app = express();
  serveClient(app, { clientDir: dir, appName: 'test-app' });
  server = await new Promise<Server>((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  port = (server.address() as { port: number }).port;
});

afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe('serveClient', () => {
  test('serves a client route from index.html', async () => {
    const r = await req('/garden');
    expect(r.status).toBe(200);
    expect(r.type).toContain('text/html');
  });

  test('serves an asset that exists, and marks it immutable', async () => {
    const r = await req('/assets/index-AAAA1111.js');
    expect(r.status).toBe(200);
    expect(r.cacheControl).toContain('immutable');
  });

  // The regression. A retired bundle hash — what a browser holding a previous index.html asks for
  // after a deploy — must 404. Answering index.html hands the browser HTML where it expects a module:
  // "Unexpected token '<'", a blank page, and a bug that reads as the user's browser being broken.
  test('a RETIRED asset hash 404s instead of returning index.html', async () => {
    const r = await req('/assets/index-DEAD0000.js');
    expect(r.status).toBe(404);
    expect(r.type).not.toContain('text/html');
  });

  // Same lie, the case that already bit once: a missing file must not read as a working page.
  test('a missing file with an extension 404s rather than answering index.html', async () => {
    const r = await req('/nonexistent.pdf');
    expect(r.status).toBe(404);
  });

  test('an existing static file is still served', async () => {
    const r = await req('/resume.pdf');
    expect(r.status).toBe(200);
  });
});
