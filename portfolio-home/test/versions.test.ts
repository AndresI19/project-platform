import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { collectVersions, platformVersion } from '../src/server/versions.js';

/**
 * These write a REAL spec file and point the reader at it, rather than stubbing node:fs.
 *
 * The interesting cases here are all filesystem ones — the file is absent (a dev checkout), or it is
 * half-written (it arrives on the volume by `kubectl cp`) — and a stubbed readFileSync would be
 * asserting that our own mock throws where we told it to, which proves nothing. A real file in a real
 * temp dir exercises the code that actually runs in the cluster.
 */
let dir: string;
let spec: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'version-spec-'));
  spec = join(dir, 'platform-version.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** The spec as platform-orchestration's k8s/deploy.sh writes it onto the shared volume. */
function writeSpec(platform: string): void {
  writeFileSync(
    spec,
    JSON.stringify({
      platform,
      deployedAt: '2026-07-14T12:00:00Z',
      components: { home: { version: '0.1.4', image: 'platform-home:0.1.4-abc1234' } },
    }),
  );
}

describe('platformVersion', () => {
  test('reads the platform version out of the spec on the volume', () => {
    writeSpec('0.1.0');
    expect(platformVersion(spec)).toBe('0.1.0');
  });

  test('a platform that differs from main is reported as a snapshot', () => {
    writeSpec('0.1.0-snapshot');
    expect(platformVersion(spec)).toBe('0.1.0-snapshot');
  });

  test('no spec on the volume is null, not a guess', () => {
    // A dev checkout, or a cluster deployed before the spec existed. "Unknown" is the honest answer;
    // "snapshot" would be a claim about a source tree this process cannot see.
    expect(platformVersion(join(dir, 'nothing-here.json'))).toBeNull();
  });

  test('a truncated spec is null rather than a thrown error', () => {
    // It lands on the volume via `kubectl cp`. A half-written file must not take down the endpoint —
    // and must certainly not take down the page that calls it.
    writeFileSync(spec, '{ "platform": ');
    expect(platformVersion(spec)).toBeNull();
  });

  test('a spec with no platform key is null', () => {
    writeFileSync(spec, JSON.stringify({ deployedAt: 'whenever' }));
    expect(platformVersion(spec)).toBeNull();
  });
});

describe('collectVersions', () => {
  test('keeps the platform beside the components, never among them', async () => {
    writeSpec('0.1.0');
    // Every component probe fails: this test is about the SHAPE, and a failing probe is a null, which
    // is itself part of the contract.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('unreachable');
      }),
    );

    const out = await collectVersions('0.1.4', spec);

    expect(out.platform).toBe('0.1.0');
    // The platform is NOT a component — it has no image, no Pod and no Service, and nothing
    // downstream should be able to mistake it for one.
    expect(out.components).not.toHaveProperty('platform');
    // home's own version comes from its image and is never asked for over HTTP.
    expect(out.components.home).toBe('0.1.4');
    expect(out.components.quiz).toBeNull();
  });

  test('a component that answers is reported; one that does not is null', async () => {
    writeSpec('0.1.0');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('quiz')
          ? new Response(JSON.stringify({ version: '0.1.4' }), { status: 200 })
          : new Response('nope', { status: 503 }),
      ),
    );

    const out = await collectVersions('0.1.4', spec);

    expect(out.components.quiz).toBe('0.1.4');
    expect(out.components.vmcp).toBeNull();
  });

  test('an unreachable platform spec does not stop the components being reported', async () => {
    // The volume mount is the one part of this that a manifest change could take away. If it does,
    // the page should lose the platform version and keep everything else — not fail whole.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: '0.1.4' }), { status: 200 })),
    );

    const out = await collectVersions('0.1.4', join(dir, 'absent.json'));

    expect(out.platform).toBeNull();
    expect(out.components.quiz).toBe('0.1.4');
  });
});
