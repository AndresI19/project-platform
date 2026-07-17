import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  mintResumeUid,
  mountContent,
  resolveTarget,
  resumePath,
  resumeUid,
  serveResume,
  writeAtomic,
} from '../src/server/content.js';
import type { Env } from '../src/server/env.js';

/**
 * Real keys, real files, real Express — no stubs anywhere in here, and that is deliberate.
 *
 * Every failure worth testing on this path is one a stub would assert out of existence. A mocked
 * verifier proves our mock rejects what we told it to reject; it says nothing about whether
 * `algorithms: ['RS256']` actually stops an alg-confusion token. A stubbed node:fs proves our fake
 * throws EACCES on command; it says nothing about whether rename() replaces an inode. So these mint
 * genuine RS256 tokens against a genuine local key set, and write genuine bytes into genuine temp
 * directories — the same convention, for the same stated reason, as versions.test.ts.
 *
 * supertest is here because the cases that matter most are about MIDDLEWARE COMPOSITION — the raw
 * parser's limit, the interaction with the global json() parser, the guard running before the write.
 * None of those exist if you call a handler function directly.
 */

const ISSUER = 'https://auth.test/issue';
const AUDIENCE = 'platform';

// Inferred from jose itself rather than named: v6 dropped the KeyLike alias, and pinning our own name
// to its key type would just be a thing to update next major.
type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let priv: Pair['privateKey'];
let pub: Pair['publicKey'];
let jwksKeys: { keys: JWK[] };
let dir: string;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  priv = pair.privateKey;
  pub = pair.publicKey;
  jwksKeys = { keys: [{ ...(await exportJWK(pub)), alg: 'RS256', kid: 'test' }] };
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'content-'));
});
afterEach(() => {
  // 0500 is left behind by the not-writable test; restore before rm or the cleanup fails.
  try {
    chmodSync(dir, 0o755);
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});

function env(over: Partial<Env> = {}): Env {
  return {
    port: 3000,
    vmcpApiBase: '',
    discordWebhookUrl: '',
    helloRateMax: 5,
    helloRateWindowSeconds: 3600,
    authJwksUri: 'http://auth.test/.well-known/jwks.json',
    authIssuer: ISSUER,
    authAudience: AUDIENCE,
    contentDir: dir,
    uploadMaxBytes: 1024 * 1024,
    ...over,
  };
}

/** A real token, signed by the real key the real JWKS publishes. */
async function token(claims: Record<string, unknown> = { admin: true }, expires = '5m'): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('00000000-0000-0000-0000-000000000001')
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(priv);
}

/**
 * An app shaped like index.ts's: the global limiter, then the 2kb json parser, then the routes.
 *
 * Built here rather than imported so index.ts's app.listen never fires — but shaped the same on
 * purpose, because what these tests are mostly checking is middleware COMPOSITION, and a bare
 * express() would be testing an app that does not exist. The limiter is part of that shape: every
 * route in the real server sits behind it.
 */
function baseApp(): Express {
  const a = express();
  a.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      // index.ts skips reads because behind Cloudflare's shared edge IPs a per-IP limiter cannot
      // separate clients. Mirrored so the shape matches; far above anything these tests issue.
      skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
      validate: { trustProxy: false },
    }),
  );
  return a;
}

function app(over: Partial<Env> = {}): Express {
  const a = baseApp();
  a.use(express.json({ limit: '2kb' })); // mirrors index.ts — the interaction is part of the test
  mountContent(a, { env: env(over), jwks: createLocalJWKSet(jwksKeys) });
  return a;
}

const PDF = Buffer.from('%PDF-1.7\n(the résumé)\n%%EOF\n');

// ---------------------------------------------------------------------------------------------

describe('resolveTarget — the allowlist', () => {
  test('accepts the résumé', () => {
    expect(resolveTarget('resume.pdf', dir)?.abs).toBe(join(dir, 'resume.pdf'));
  });

  test('accepts a card deck', () => {
    expect(resolveTarget('cards/aws-s3.yaml', dir)?.abs).toBe(join(dir, 'cards/aws-s3.yaml'));
  });

  test('REFUSES platform-version.json', () => {
    // The most important case in this file. Nothing at the filesystem layer stops this write: the
    // volume is owned 1000:1000, home runs as uid 1000, and POSIX takes rename permission from the
    // DIRECTORY's write bit — not from who owns the target. Once /content is writable, this allowlist
    // is the only thing between a web server and the record of what is deployed. This test IS the
    // control.
    expect(resolveTarget('platform-version.json', dir)).toBeNull();
  });

  test.each([
    ['../../etc/passwd', 'traversal'],
    ['../platform-version.json', 'traversal, decoded — Express hands us %2e%2e%2f already decoded'],
    ['cards/../platform-version.json', 'traversal via a legal-looking prefix'],
    ['/etc/passwd', 'absolute'],
    ['cards/x.yml', 'the other yaml extension'],
    ['cards/sub/x.yaml', 'nested'],
    ['cards/.yaml', 'no stem'],
    ['cards/-x.yaml', 'stem must start alphanumeric'],
    ['resume.PDF', 'case'],
    ['Resume.pdf', 'case'],
    ['', 'empty'],
    ['resume.pdf\u0000.png', 'a NUL, escaped: a raw one makes git treat this file as binary'],
    ['cards/x.yaml/../../y', 'escape after a legal shape'],
  ])('refuses %s (%s)', (name) => {
    expect(resolveTarget(name, dir)).toBeNull();
  });

  test('containment survives a contentDir given with a trailing slash', () => {
    expect(resolveTarget('resume.pdf', `${dir}/`)?.abs).toBe(join(dir, 'resume.pdf'));
  });
});

describe('writeAtomic', () => {
  test('writes the bytes, mode 0644', async () => {
    const f = join(dir, 'resume.pdf');
    await writeAtomic(f, PDF, dir);
    expect(readFileSync(f)).toEqual(PDF);
    expect(statSync(f).mode & 0o777).toBe(0o644);
  });

  test('an overwrite REPLACES the inode', async () => {
    // The property the whole design rests on, asserted rather than assumed. rename() publishes a new
    // inode — which is exactly why the subPath mount had to go: a bind-mounted file would have kept
    // serving the old one. Atomicity and observability were opposites until that mount was removed.
    const f = join(dir, 'resume.pdf');
    await writeAtomic(f, PDF, dir);
    const before = statSync(f).ino;
    await writeAtomic(f, Buffer.concat([PDF, Buffer.from('more')]), dir);
    expect(statSync(f).ino).not.toBe(before);
  });

  test('creates cards/ on a fresh volume', async () => {
    await writeAtomic(join(dir, 'cards/a-b.yaml'), Buffer.from('cards: []'), dir);
    expect(readFileSync(join(dir, 'cards/a-b.yaml'), 'utf8')).toBe('cards: []');
  });

  test('leaves no .part file behind on success', async () => {
    await writeAtomic(join(dir, 'resume.pdf'), PDF, dir);
    expect(readdirSync(dir)).toEqual(['resume.pdf']);
  });

  test('cleans up its temp file when the write fails', async () => {
    // The finally path. A read-only directory is the realistic version of this (a values regression
    // that left readOnly:true), and it must not litter the volume with .part files.
    const sub = join(dir, 'ro');
    mkdirSync(sub);
    chmodSync(sub, 0o500);
    await expect(writeAtomic(join(sub, 'resume.pdf'), PDF, sub)).rejects.toThrow();
    chmodSync(sub, 0o755);
    expect(readdirSync(sub)).toEqual([]);
  });

  test('REFUSES to invent the volume when it is not mounted', async () => {
    // A regression test for a real bug this suite caught. writeAtomic used to mkdir(recursive) the
    // target's directory, which meant that with the volume absent it would CREATE /content on the
    // container's own filesystem and write there — reporting ok:true for an upload that silently
    // vanished with the pod. In the cluster that was masked only by readOnlyRootFilesystem, i.e. by an
    // unrelated flag staying set. A missing mount must be ENOENT and stay ENOENT.
    const gone = join(dir, 'not-mounted');
    await expect(writeAtomic(join(gone, 'resume.pdf'), PDF, gone)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(readdirSync(dir)).toEqual([]);
  });

  test('the temp name matches neither the card pattern nor the quiz’s *.yaml glob', () => {
    // Asserted on the NAME rather than by racing a reader against a writer: rename(2)'s atomicity is a
    // POSIX guarantee, not something a flaky test should pretend to prove. What is worth pinning is
    // that a crashed write leaves something inert — the quiz globs cards/*.yaml at boot, and a
    // half-written deck matching that glob would take the quiz down.
    expect(resolveTarget('cards/.a-b.yaml.abc123.part', dir)).toBeNull();
    expect('.a-b.yaml.abc123.part'.startsWith('.')).toBe(true);
  });
});

describe('serveResume', () => {
  function resumeApp(contentDir: string, seed: string): Express {
    const a = baseApp();
    a.get('/resume.pdf', serveResume(contentDir, seed));
    return a;
  }

  test('serves the volume’s copy when it is there', async () => {
    writeFileSync(join(dir, 'resume.pdf'), PDF);
    const seed = join(dir, 'seed.pdf');
    writeFileSync(seed, Buffer.from('%PDF-seed'));
    const r = await request(resumeApp(dir, seed)).get('/resume.pdf');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.from(r.body)).toEqual(PDF);
  });

  test('falls back to the image’s seed when the volume has none', async () => {
    // The dev checkout, and the moment before seed-resume has run.
    const seed = join(dir, 'seed.pdf');
    writeFileSync(seed, PDF);
    const r = await request(resumeApp(join(dir, 'empty'), seed)).get('/resume.pdf');
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body)).toEqual(PDF);
  });

  test('READS PER REQUEST — an overwrite is visible with no restart', async () => {
    // The regression test for the entire feature. If someone reintroduces a cache, this fails, and the
    // rollout-to-swap-a-résumé bug is back. Direct analogue of versions.test.ts reading the platform
    // version off the volume per request.
    const f = join(dir, 'resume.pdf');
    writeFileSync(f, PDF);
    const a = resumeApp(dir, join(dir, 'seed.pdf'));

    expect(Buffer.from((await request(a).get('/resume.pdf')).body)).toEqual(PDF);
    const next = Buffer.from('%PDF-1.7\n(a different résumé)\n%%EOF\n');
    writeFileSync(f, next);
    expect(Buffer.from((await request(a).get('/resume.pdf')).body)).toEqual(next);
  });

  test('404s when neither the volume nor the seed has one', async () => {
    const r = await request(resumeApp(join(dir, 'nope'), join(dir, 'also-nope'))).get('/resume.pdf');
    expect(r.status).toBe(404);
  });
});

describe('resumeUid / resumePath / mintResumeUid', () => {
  test('reads a five-digit UID off the volume, trailing newline and all', () => {
    writeFileSync(join(dir, 'resume-uid'), '48213\n');
    expect(resumeUid(dir)).toBe('48213');
  });

  test('a missing file (dev checkout, or before the first write) is null, not a guess', () => {
    expect(resumeUid(join(dir, 'empty'))).toBeNull();
  });

  test('a malformed or half-written UID reads as unknown, never a partial redirect target', () => {
    for (const bad of ['', '4821', '482130', 'abcde', '48 13']) {
      writeFileSync(join(dir, 'resume-uid'), bad);
      expect(resumeUid(dir)).toBeNull();
    }
  });

  test('resumePath builds the versioned, immutable path', () => {
    expect(resumePath('48213')).toBe('/resume-48213.pdf');
  });

  test('mintResumeUid always returns five digits and never repeats the previous value', () => {
    let prev = '00000';
    for (let i = 0; i < 2000; i++) {
      const uid = mintResumeUid(prev);
      expect(uid).toMatch(/^\d{5}$/);
      expect(uid).not.toBe(prev);
      prev = uid;
    }
  });
});

describe('the versioned-résumé routes', () => {
  // Shaped like index.ts: /resume and /resume.pdf redirect to the current UID, /resume-<uid>.pdf
  // serves it immutable (or redirects a stale UID forward), and with no UID everything serves the file.
  function resumeRoutesApp(contentDir: string, seed: string): Express {
    const a = baseApp();
    const current = () => resumeUid(contentDir);
    const serveVersioned = serveResume(contentDir, seed, 'public, max-age=31536000, immutable');
    const serveCurrent = serveResume(contentDir, seed);
    const toCurrent = (req: express.Request, res: express.Response): void => {
      const uid = current();
      if (uid) {
        res.set('Cache-Control', 'no-store');
        res.redirect(302, resumePath(uid));
        return;
      }
      serveCurrent(req, res);
    };
    a.get('/resume', toCurrent);
    a.get('/resume.pdf', toCurrent);
    a.get('/resume-:uid.pdf', (req, res) => {
      if (req.params.uid === current()) return serveVersioned(req, res);
      toCurrent(req, res);
    });
    return a;
  }

  function seeded(): { app: Express; uid: string } {
    writeFileSync(join(dir, 'resume.pdf'), PDF);
    writeFileSync(join(dir, 'resume-uid'), '48213');
    return { app: resumeRoutesApp(dir, join(dir, 'seed.pdf')), uid: '48213' };
  }

  test('/resume 302s to the current versioned path, uncacheable', async () => {
    const { app } = seeded();
    const r = await request(app).get('/resume').redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/resume-48213.pdf');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('the current versioned path serves the PDF, cached immutable for a year', async () => {
    const { app } = seeded();
    const r = await request(app).get('/resume-48213.pdf');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
    expect(r.headers['cache-control']).toMatch(/immutable/);
    expect(Buffer.from(r.body)).toEqual(PDF);
  });

  test('a stale UID (an old link after a new résumé) 302s forward to the current one', async () => {
    const { app } = seeded();
    const r = await request(app).get('/resume-00001.pdf').redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/resume-48213.pdf');
  });

  test('bare /resume.pdf redirects old links forward rather than 404ing', async () => {
    const { app } = seeded();
    const r = await request(app).get('/resume.pdf').redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/resume-48213.pdf');
  });

  test('with no UID file, /resume serves the résumé directly — #37 behaviour is preserved', async () => {
    writeFileSync(join(dir, 'resume.pdf'), PDF);
    const r = await request(resumeRoutesApp(dir, join(dir, 'seed.pdf'))).get('/resume');
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body)).toEqual(PDF);
  });
});

describe('PUT /api/content/* — the guard', () => {
  test('an admin writes the résumé', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, bytes: PDF.length });
    expect(readFileSync(join(dir, 'resume.pdf'))).toEqual(PDF);
  });

  test('a card write says out loud that it needs a quiz restart', async () => {
    // The quiz builds its decks once at startup, so this write changes nothing until that pod cycles.
    // Reporting ok:true and nothing else would be a lying success.
    const r = await request(app())
      .put('/api/content/cards/a-thing.yaml')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/yaml')
      .send('cards: []');
    expect(r.status).toBe(200);
    expect(r.body.note).toMatch(/restart/i);
  });

  test('a NON-admin is refused 403 and the file on disk is untouched', async () => {
    // Asserting the BYTES, not just the status — that is what proves the guard runs before the write
    // rather than after it.
    writeFileSync(join(dir, 'resume.pdf'), PDF);
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token({ admin: false })}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-evil'));
    expect(r.status).toBe(403);
    expect(readFileSync(join(dir, 'resume.pdf'))).toEqual(PDF);
  });

  test.each([
    ['a string', 'true'],
    ['a number', 1],
    ['absent', undefined],
  ])('admin claim that is %s is not an admin', async (_label, admin) => {
    // Locks in `=== true`. A truthy test would read the string "true" — and, worse, "false" — as admin.
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token(admin === undefined ? {} : { admin })}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(403);
  });

  test('no Authorization header → 401 + WWW-Authenticate', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBe('Bearer');
  });

  test('a garbage bearer → 401', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', 'Bearer not.a.token')
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });

  test('an expired token → 401', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token({ admin: true }, '-1s')}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });

  test('a token signed by a different key → 401', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${forged}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });

  test('alg confusion: HS256 signed with the PUBLIC key as the HMAC secret → 401', async () => {
    // The single case `algorithms: ['RS256']` exists for, and it is invisible in every other test
    // here. The JWKS is public by design, so without the pin an attacker signs with the key everyone
    // can read and the server verifies it happily.
    const jwk = (await exportJWK(pub)) as { n?: string };
    const secret = new TextEncoder().encode(jwk.n ?? 'public');
    const forged = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'HS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(secret);
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${forged}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });

  test('the wrong issuer → 401', async () => {
    const t = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://evil.test/issue')
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(priv);
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${t}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });

  test('the wrong audience → 401', async () => {
    const t = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience('somebody-else')
      .setExpirationTime('5m')
      .sign(priv);
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${t}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(401);
  });
});

describe('PUT /api/content/* — the payload', () => {
  test('an admin still cannot write platform-version.json', async () => {
    writeFileSync(join(dir, 'platform-version.json'), '{"platform":"1.2.3"}');
    const r = await request(app())
      .put('/api/content/platform-version.json')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{"platform":"9.9.9"}'));
    expect(r.status).toBe(403);
    expect(r.body.writable).toEqual(['resume.pdf', 'cards/<name>.yaml']);
    expect(readFileSync(join(dir, 'platform-version.json'), 'utf8')).toBe('{"platform":"1.2.3"}');
  });

  test('Content-Type: application/json → 415, not a mystery', async () => {
    // Pins the interaction between the two parsers. The global express.json (index.ts) consumes a JSON
    // body first, so req.body arrives as a parsed object rather than a Buffer. Naming that turns a
    // confusing composition into a tested status.
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/json')
      .send({ not: 'bytes' });
    expect(r.status).toBe(415);
  });

  test('a résumé that is not a PDF → 415', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('<html>hello</html>'));
    expect(r.status).toBe(415);
  });

  test('the wrong Content-Type for the target → 415', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(r.status).toBe(415);
  });

  test('a body over uploadMaxBytes → 413', async () => {
    const a = app({ uploadMaxBytes: 512 });
    const r = await request(a)
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.concat([PDF, Buffer.alloc(1024, 0x41)]));
    expect(r.status).toBe(413);
  });

  test('a missing content volume is 503, not 500 — the server is fine, the mount is not', async () => {
    const r = await request(app({ contentDir: '/no/such/volume' }))
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not mounted/);
  });

  test('a successful résumé write lands the file AND mints a fresh cache-busting UID', async () => {
    const r = await request(app())
      .put('/api/content/resume.pdf')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, bytes: PDF.length });
    expect(readFileSync(join(dir, 'resume.pdf'))).toEqual(PDF);
    // The UID now exists and is well-formed — the versioned url the redirect points at.
    expect(readFileSync(join(dir, 'resume-uid'), 'utf8')).toMatch(/^\d{5}$/);
  });

  test('a second résumé write ROTATES the UID — the url must change or the edge cache never busts', async () => {
    const a = app();
    const put = async () =>
      request(a)
        .put('/api/content/resume.pdf')
        .set('Authorization', `Bearer ${await token()}`)
        .set('Content-Type', 'application/pdf')
        .send(PDF);
    await put();
    const first = readFileSync(join(dir, 'resume-uid'), 'utf8');
    await put();
    const second = readFileSync(join(dir, 'resume-uid'), 'utf8');
    expect(second).toMatch(/^\d{5}$/);
    expect(second).not.toBe(first);
  });

  test('writing a card does NOT touch the résumé UID', async () => {
    writeFileSync(join(dir, 'resume-uid'), '48213');
    const r = await request(app())
      .put('/api/content/cards/a-thing.yaml')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/yaml')
      .send('q: 1');
    expect(r.status).toBe(200);
    expect(readFileSync(join(dir, 'resume-uid'), 'utf8')).toBe('48213');
  });
});

describe('mountContent — unconfigured', () => {
  test('registers NOTHING without AUTH_JWKS_URI', async () => {
    // Not registered-and-disabled. An upload route that exists but cannot verify anyone is the worst
    // failure this feature has, and making its existence conditional on the verifier means "open by
    // accident" cannot be expressed — rather than being one inverted `if` away.
    const a = express();
    a.use(express.json({ limit: '2kb' }));
    mountContent(a, { env: env({ authJwksUri: '' }), jwks: createLocalJWKSet(jwksKeys) });
    const r = await request(a)
      .put('/api/content/resume.pdf')
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(r.status).toBe(404);
  });
});
