/**
 * The shared content volume: serving the résumé off it, and the admin route that replaces it.
 *
 * The résumé lives on a PersistentVolume, not in this image, because it changes on a different clock
 * than the code (like platform-version.json and the quiz's card decks). It used to arrive as a subPath
 * single-file mount over /app/dist/client/resume.pdf — a bind mount pinned to the source file's INODE
 * at container start. Replacing the file gives it a new inode (`kubectl cp` untars = unlink + create),
 * and the mount serves the old, unlinked inode for the pod's life; a DIRECTORY mount resolves names per
 * lookup and saw the new inode immediately. So the fix is not a cache flush — there was none — but to
 * read through the directory mount per request, exactly as versions.ts reads platform-version.json. The
 * subPath mount is gone from the values file; this module replaces it.
 *
 * One module, because guard, allowlist and write are three faces of one decision — what a caller may
 * put on this volume. Mirrors the quiz's progress.ts.
 */

import { randomUUID } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { access, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env.js';

// --- What may be written ---

/**
 * An ALLOWLIST, not a sanitiser. A sanitiser accepts an arbitrary path and tries to prove it harmless
 * — a game you lose to the next encoding. This matches exactly two SHAPES and refuses everything else:
 * `..` cannot match `[a-z0-9]`, so traversal is unrepresentable, not defended against.
 *
 * platform-version.json is deliberately absent: the deploy pipeline owns it, and a web server able to
 * rewrite it could lie about the platform's version. Nothing else stops that — /content is owned
 * 1000:1000, this process is uid 1000, and POSIX takes rename/unlink permission from the DIRECTORY's
 * write bit, not the file's owner — so once /content is writable this list is the only control. Tested.
 */
const RESUME = 'resume.pdf';
const CARD = /^cards\/[a-z0-9][a-z0-9-]{0,63}\.yaml$/;

/**
 * The résumé's cache-busting UID, written beside it on the volume.
 *
 * A swap is live on the next request from THIS server (no cache, read per request), but Cloudflare
 * edge-caches /resume.pdf under its own Browser-Cache-TTL (max-age=14400), overriding the origin's
 * no-cache, so a replaced PDF shows stale for hours and we cannot flush that edge. The fix is to change
 * the URL: the page links extensionless /resume, the server 302s to /resume-<uid>.pdf (a url the edge
 * has never seen), and that versioned url is cached hard — correct, since it names one exact version.
 * Every writer of the résumé mints a fresh UID: `pv-content.sh set-resume` and the admin PUT below.
 */
const RESUME_UID = 'resume-uid';

export interface Target {
  /** Absolute path to write, already proven to be inside the content directory. */
  abs: string;
  /** Content-Types this target accepts. The first is the one named in the error. */
  accepts: readonly string[];
  /** Leading bytes the payload must have, when the type has a cheap signature worth checking. */
  magic?: string;
}

/**
 * Resolve a request path to a writable target, or null if it is not one.
 *
 * `contentDir` is a parameter, not a constant, so tests point it at a real temp dir instead of stubbing
 * node:fs (as SPEC_PATH does in versions.ts) — a stub would paper over the failure modes worth testing.
 */
export function resolveTarget(name: string, contentDir: string): Target | null {
  const root = resolve(contentDir);
  const abs = resolve(root, name);
  // Deliberately unreachable today (the patterns below can't express a traversal) — here to catch the
  // day someone widens CARD to allow a slash or a dot.
  if (abs !== root && !abs.startsWith(root + sep)) return null;

  if (name === RESUME) return { abs, accepts: ['application/pdf'], magic: '%PDF-' };
  if (CARD.test(name)) {
    return { abs, accepts: ['application/yaml', 'text/yaml', 'application/x-yaml', 'text/plain'] };
  }
  return null;
}

// --- Who may write ---

/**
 * Bearer required, and the token must carry a signed `admin` claim.
 *
 * Copied from the quiz's requireAuth and open-vMCP's requireAdminForWrites, not imported (other repos,
 * no shared server package); a third copy is the signal to make one. The `admin` claim is computed and
 * SIGNED by platform-auth from the AUTH_ADMINS secret this service cannot read (platform-auth/src/
 * tokens.ts) — so home enforces a policy it cannot grant itself or widen from this repo's config.
 *
 * `jwks` is a parameter with a default so tests verify REAL RS256 tokens against a real local key set
 * instead of stubbing jose — alg confusion, wrong issuer, expiry are exactly what a stub asserts away.
 */
export function requireAdmin(env: Env, jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(env.authJwksUri))) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1];
    if (!bearer) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'sign in as an admin' });
      return;
    }
    try {
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer: env.authIssuer,
        audience: env.authAudience,
        // Pinned. Left open, a forged header could ask for `alg: none`, or for HS256 using the
        // published public key as the HMAC secret — either way the token chooses its own rules.
        algorithms: ['RS256'],
      });
      // `=== true`, never truthy. A token carrying admin:"false" or admin:1 is not an admin, and a
      // truthy test would read the first as one.
      if (payload.admin !== true) {
        res.status(403).json({ error: 'forbidden: this action needs an admin' });
        return;
      }
      next();
    } catch {
      // 401 vs 403 is a real distinction, matching open-vMCP: unverifiable is "I don't know who you
      // are", a verified non-admin is "I know exactly who you are, and no".
      res.status(401).json({ error: 'invalid token' });
    }
  };
}

// --- The write ---

/**
 * Write, then rename — a reader sees the whole old file or the whole new one, never a torn PDF.
 *
 * The temp file MUST live in the target's own directory: /tmp is the chart's emptyDir, a different
 * filesystem, and rename(2) across filesystems fails EXDEV — passes every local test (one disk), fails
 * only in the cluster. Atomic replace works here only BECAUSE the subPath mount is gone; while the
 * résumé was bind-mounted, rename gave it a new inode and the mount kept serving the old one.
 *
 * The temp name is dot-prefixed and .part-suffixed so a crashed write leaves something matching neither
 * CARD nor the quiz's *.yaml glob — inert, and visible to `pv-content.sh ls`.
 */
export async function writeAtomic(abs: string, data: Buffer, root: string): Promise<void> {
  // The volume must already BE there. Without this, mkdir(recursive) below would CREATE /content on the
  // container's own filesystem when the volume is unmounted, reporting ok:true while writing to a
  // directory that vanishes with the pod (masked today only by readOnlyRootFilesystem — correctness
  // resting on an unrelated flag). A missing mount is ENOENT and stays ENOENT.
  await access(root, constants.F_OK);

  const dir = dirname(abs);
  // Only ever create directories BENEATH the volume (cards/ on a fresh one) — never the root itself.
  if (dir !== resolve(root)) await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(abs)}.${randomUUID()}.part`);
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(tmp, 'wx', 0o644); // wx: exclusive create — never clobber a temp we did not make
    await fh.writeFile(data);
    // Durable BEFORE the rename publishes the name. Without this, a crash can leave the new name
    // pointing at blocks that were never written — a zero-length résumé that looks committed.
    await fh.sync();
    // Explicit, because open()'s mode argument is subject to the umask. This volume holds public
    // content that other pods and pv-content.sh read; a umask must not get a vote.
    await fh.chmod(0o644);
    await fh.close();
    fh = undefined;
    await rename(tmp, abs);
    // fsync the DIRECTORY too, so the rename itself survives a crash — the file's own sync says
    // nothing about the directory entry that now points at it.
    const dh = await open(dir, 'r');
    try {
      await dh.sync();
    } finally {
      await dh.close();
    }
  } finally {
    if (fh) await fh.close().catch(() => {});
    // A no-op after a successful rename (the name is gone); the cleanup path on every failure before it.
    await unlink(tmp).catch(() => {});
  }
}

/** Is the content volume writable? Answered once at boot, for the log line — never to gate a request
 *  (that would be a TOCTOU check, and the write itself already reports the truth). */
export async function contentWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * A volume problem is 503, not 500 and never 4xx: the request was fine, the server just can't do it
 * now — which tells the reader to look at the values file, not their curl. Anything not listed here is
 * a bug in this code and is allowed to 500 rather than be dressed up as a config problem.
 */
function volumeFault(err: NodeJS.ErrnoException): { status: number; error: string; code: string } | null {
  switch (err.code) {
    case 'ENOENT': // nothing mounted — a dev checkout, or a values regression
      return { status: 503, error: 'content volume is not mounted', code: 'ENOENT' };
    case 'EACCES':
      return { status: 503, error: 'content volume is not writable', code: 'EACCES' };
    case 'EPERM':
      return { status: 503, error: 'content volume is not writable', code: 'EPERM' };
    case 'EROFS': // the mount is still readOnly:true — a half-applied deploy
      return { status: 503, error: 'content volume is not writable', code: 'EROFS' };
    default:
      return null;
  }
}

// --- Serving ---

/**
 * The résumé, read per request. No cache — the point of the change. Same reasoning as platformVersion()
 * in versions.ts: a cache would invisibly reintroduce the staleness the per-request read removes, and
 * be defeated by `pv-content.sh`, which writes the volume directly and calls no invalidation hook.
 *
 * `seed` is the copy Vite bakes in from public/resume.pdf — it answers before the volume is seeded and
 * when there is none (npm run dev), the same file express.static would serve, reached deliberately.
 * Both are parameters, not constants, so tests use real files.
 */
export function serveResume(contentDir: string, seed: string, cacheControl = 'no-cache') {
  return (_req: Request, res: Response): void => {
    // no-cache = revalidate every time (NOT "do not store"). serve-static's default here is already
    // equivalent; stating it survives a default change. The versioned /resume-<uid>.pdf route overrides
    // with `immutable` — that url names one unchanging version, so a year's cache is correct.
    const opts = { headers: { 'Cache-Control': cacheControl } };
    res.sendFile(join(contentDir, RESUME), opts, (err) => {
      // headersSent means the stream died mid-flight — the response is already committed and there is
      // nothing useful left to say.
      if (!err || res.headersSent) return;
      res.sendFile(seed, opts, (seedErr) => {
        if (seedErr && !res.headersSent) res.status(404).end();
      });
    });
  };
}

/**
 * The current résumé UID off the volume, or null when the file is absent (dev checkout, or pre-first-
 * write) or malformed. `contentDir` is a parameter as in serveResume, for tests. Callers treat null as
 * "no versioned url yet" and serve the bare path, so a missing UID degrades rather than 404ing.
 */
export function resumeUid(contentDir: string): string | null {
  try {
    const raw = readFileSync(join(contentDir, RESUME_UID), 'utf8').trim();
    // Exactly five digits, or nothing. A half-written file — it arrives by `kubectl cp` or an atomic
    // rename — must read as "unknown" rather than as a partial UID we would 302 a visitor to.
    return /^\d{5}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The versioned, immutable path the bare /resume routes redirect to. */
export const resumePath = (uid: string): string => `/resume-${uid}.pdf`;

/**
 * A fresh five-digit UID differing from `prev` — an identical one would leave the url and the edge
 * cache unchanged, so it re-rolls until it differs. 100k space, only `prev` excluded, so it returns
 * first try ~99.999% of the time; the loop is correctness, not a hot path.
 */
export function mintResumeUid(prev: string | null = null): string {
  // do/while, so a UID is minted first and re-rolled only on the rare `=== prev` collision — the plain
  // `while` needed a redundant `uid === null` seed clause just to force the first pass.
  let uid: string;
  do {
    uid = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  } while (uid === prev);
  return uid;
}

// --- Mounting ---

export interface MountOpts {
  env: Env;
  /** Injectable for tests; defaults to a remote key set built from env.authJwksUri. */
  jwks?: JWTVerifyGetKey;
}

/**
 * Register the admin write route — ONLY when a verifier exists. Like the quiz's mountProgress with no
 * DATABASE_URL, the routes simply do not exist rather than being registered-and-disabled: an
 * unregistered route makes "open by accident" unrepresentable, where a disabled one rests on one `if`
 * staying correct forever. It matters more here — the worst case is an unauthenticated write to a
 * shared volume. The resulting 404 is honest (in a dev checkout the endpoint really isn't there); the
 * cost is silence, which the boot log in index.ts pays.
 */
export function mountContent(app: Express, opts: MountOpts): void {
  const { env } = opts;
  if (!env.authJwksUri) return;

  // Built ONCE, at mount. createRemoteJWKSet holds the key cache and the re-fetch cooldown; one per
  // request would hammer platform-auth and defeat both.
  const guard = requireAdmin(env, opts.jwks);

  app.put(
    '/api/content/*',
    // Scoped to THIS route, not the app. The global express.json({limit:'2kb'}) in index.ts is sized
    // for the one short string /api/hello accepts, and nothing about an upload should widen it.
    express.raw({ type: () => true, limit: env.uploadMaxBytes }),
    guard,
    async (req: Request, res: Response): Promise<void> => {
      const name = String((req.params as Record<string, string>)[0] ?? '');
      const target = resolveTarget(name, env.contentDir);
      if (!target) {
        // 403, not 404: the caller is authenticated and we are declining. Echoing the writable set
        // turns a guessing game into one round trip.
        res.status(403).json({
          error: `not a writable path: ${name}`,
          writable: ['resume.pdf', 'cards/<name>.yaml'],
        });
        return;
      }
      // Narrowed ONCE into a local; req.body is never read again. Not a Buffer means the global
      // express.json already consumed the stream — the caller sent Content-Type: application/json,
      // which this endpoint rejects with a clean 415. Reading req.body.length later would be a real
      // type-confusion hazard: on another path req.body could be an array or string, and `.length`
      // would silently mean elements or UTF-16 units, not bytes. The local makes the Buffer guarantee
      // survive to its uses.
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(415).json({ error: `send the bytes with Content-Type: ${target.accepts[0]}` });
        return;
      }
      const ct = (req.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!target.accepts.includes(ct)) {
        res
          .status(415)
          .json({ error: `${name} accepts ${target.accepts.join(', ')}, got ${ct || '(none)'}` });
        return;
      }
      if (
        target.magic &&
        !body.subarray(0, target.magic.length).toString('latin1').startsWith(target.magic)
      ) {
        res.status(415).json({ error: `${name} must be a real PDF` });
        return;
      }

      try {
        await writeAtomic(target.abs, body, env.contentDir);
      } catch (err) {
        const fault = volumeFault(err as NodeJS.ErrnoException);
        if (!fault) throw err;
        // Newlines stripped at the sink (see the note below the success log for why the exact regex
        // form is load-bearing): `name` passed the allowlist so can't hold a newline, but hold the
        // property where the value is used. `fault.code` is volumeFault's own switch constant, not
        // err.code off the caught error — that error's fields are caller data from a filesystem call.
        console.error(`[content] write ${name.replace(/\n|\r/g, '')} failed: ${fault.code}`);
        res.status(fault.status).json({ error: fault.error });
        return;
      }

      // A new résumé gets a new cache-busting UID (same mint as the deploy script). After the write,
      // not before: a UID pointing at a résumé that failed to land would 302 visitors to a 404. The
      // window between the two atomic writes can only leave the OLD UID against the NEW résumé, which
      // still serves — never a dangling pointer.
      if (name === RESUME) {
        const next = mintResumeUid(resumeUid(env.contentDir));
        await writeAtomic(join(env.contentDir, RESUME_UID), Buffer.from(next), env.contentDir);
      }

      // Size is READ BACK off the volume, not taken from body.length — worth the extra stat(2). This
      // number is the receipt for a write, so it should describe the file that now exists, and cannot
      // disagree with the volume the way body.length could on a partial write.
      const written = await stat(target.abs);

      // Newlines stripped at the sink: `name` passed the allowlist so can't hold a newline, but a \r\n
      // in a log can forge a second entry, so hold the property where the value is used.
      //
      // The EXACT form is load-bearing for CodeQL's log-injection sanitiser, which recognises the strip
      // only when the regex yields the constant "\n"/"\r" AND the replacement is empty string:
      //   /[\r\n]/g -> ' '   flows through — a character class is not a constant term
      //   /\n|\r/g  -> ' '   flows through — the replacement is not empty
      //   /\n|\r/g  -> ''    recognised — the alert clears
      // All three behave identically at runtime (established from the SARIF dataflow). Don't "simplify"
      // to a character class or a space: it silently re-opens the finding.
      console.log(`[content] wrote ${name.replace(/\n|\r/g, '')}`);
      res.json({
        ok: true,
        bytes: written.size,
        // The résumé is live on the next request (no cache). Cards are NOT — the quiz builds decks
        // once at startup, so a deck written here changes nothing until that pod restarts.
        ...(name === RESUME ? {} : { note: 'cards take effect on the quiz’s next restart' }),
      });
    },
  );
}
