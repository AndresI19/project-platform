/**
 * The shared content volume: serving the résumé off it, and the admin route that replaces it.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────────────────────
 * The résumé lives on a PersistentVolume rather than in this image, because it changes on a different
 * clock than the code that serves it (the same reason platform-version.json and the quiz's card decks
 * do). Replacing it used to need `pv-content.sh set-resume`, which needs kubectl, a throwaway writer
 * pod, AND a rollout of this deployment.
 *
 * ── Why the rollout was needed, and why it no longer is ─────────────────────────────────────────
 * The résumé used to arrive as a subPath single-file mount over /app/dist/client/resume.pdf. A subPath
 * mount is a bind mount resolved to the source file's INODE at container start. Replacing the file on
 * the volume gives it a new inode — `kubectl cp` untars, which unlinks and recreates — and the mount
 * goes on serving the old inode, which is unlinked but still referenced, forever. Measured, not
 * theorised: volume inode 2495958, the pod's subPath mount still reading 2496037, same bytes served
 * indefinitely. The DIRECTORY mount in the same pod saw the new inode immediately, because a directory
 * mount resolves names on every lookup.
 *
 * So the fix is not a cache flush — there was never a cache to flush. It is to read through the
 * directory mount, per request, exactly as versions.ts already reads platform-version.json and for
 * exactly the same stated reason. The subPath mount is gone from the values file; this module is what
 * replaces it.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────────────────────────
 * One module, because the guard, the allowlist and the write are three faces of one decision: what a
 * caller is allowed to put on this volume. Mirrors the quiz's progress.ts (guard + routes +
 * mountX(app, …) in one file).
 */

import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env.js';

// ---------------------------------------------------------------------------------------------
// What may be written
// ---------------------------------------------------------------------------------------------

/**
 * An ALLOWLIST, not a sanitiser — and the difference is the whole security argument here.
 *
 * A sanitiser accepts an arbitrary path and tries to prove it harmless, which is a game you lose to
 * the next encoding nobody thought of. This accepts an arbitrary string and asks whether it is one of
 * exactly two SHAPES. Everything else is refused without being reasoned about. `..` cannot match
 * `[a-z0-9]`, so traversal here is not defended against — it is unrepresentable.
 *
 * platform-version.json is deliberately absent. It is the record of what is deployed, written by the
 * version-writer hook on every release; a web server able to rewrite it could lie about the platform's
 * own version. Note that NOTHING ELSE stops it: /content is owned 1000:1000 and this process is uid
 * 1000, and POSIX takes rename/unlink permission from the DIRECTORY's write bit, not the target file's
 * owner. Once /content is writable, this list is the only control that exists. It has a test.
 */
const RESUME = 'resume.pdf';
const CARD = /^cards\/[a-z0-9][a-z0-9-]{0,63}\.yaml$/;

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
 * `contentDir` is a parameter rather than a module constant so the tests can point it at a real temp
 * directory instead of stubbing node:fs — the same convention, for the same reason, as SPEC_PATH in
 * versions.ts. The failure modes worth testing here are precisely the ones a stub would paper over.
 */
export function resolveTarget(name: string, contentDir: string): Target | null {
  const root = resolve(contentDir);
  const spec =
    name === RESUME
      ? { accepts: ['application/pdf'] as const, magic: '%PDF-' }
      : CARD.test(name)
        ? { accepts: ['application/yaml', 'text/yaml', 'application/x-yaml', 'text/plain'] as const }
        : null;
  if (!spec) return null;

  const abs = resolve(root, name);
  // Belt and braces, and deliberately unreachable: the patterns above cannot express a traversal, so
  // this can never fire today. That is exactly why it is here — it is what catches the day someone
  // widens CARD to allow a slash or a dot.
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return { abs, ...spec };
}

// ---------------------------------------------------------------------------------------------
// Who may write
// ---------------------------------------------------------------------------------------------

/**
 * Bearer required, and the token must carry a signed `admin` claim.
 *
 * Copied from data-driven-quiz-server's requireAuth and open-vMCP's requireAdminForWrites rather than
 * imported: they live in other repos and there is no shared server package. A third copy is the signal
 * to make one.
 *
 * The `admin` claim is computed and SIGNED by platform-auth, from the AUTH_ADMINS secret that this
 * service cannot read (platform-auth/src/tokens.ts). home therefore enforces a policy it is not
 * allowed to know, which is the point: nothing here can grant itself the role, and nothing in this
 * repo's config can widen it.
 *
 * `jwks` is a parameter with a default purely so the tests can verify REAL RS256 tokens against a real
 * local key set instead of stubbing jose. The failures worth testing — alg confusion, a wrong issuer,
 * an expired token — are the exact ones a stubbed verifier asserts out of existence.
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

// ---------------------------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------------------------

/**
 * Write, then rename. A reader sees either the whole old file or the whole new one, never a torn PDF.
 *
 * The temp file MUST live in the target's own directory. /tmp is the chart's emptyDir — a different
 * filesystem — and rename(2) across filesystems fails EXDEV. That is the classic version of this bug:
 * it passes every local test, where both paths are one disk, and fails only in the cluster.
 *
 * Atomic replace is available here only BECAUSE the subPath mount is gone. While the résumé was a
 * bind-mounted file, rename gave it a new inode and the mount kept serving the old one — the safe way
 * to write and the way that worked were opposites. Removing the mount reconciled them.
 *
 * The temp name is dot-prefixed and .part-suffixed so a crashed write leaves something matching
 * neither CARD above nor the *.yaml glob the quiz loads. It is inert, and `pv-content.sh ls` will show
 * it — which is the right amount of visible.
 */
export async function writeAtomic(abs: string, data: Buffer, root: string): Promise<void> {
  // The volume must already BE there, and this is what insists on it.
  //
  // Without it, mkdir(recursive) below would cheerfully CREATE /content on the container's own
  // filesystem whenever the volume is not mounted, and the upload would report ok:true while writing
  // to a directory that vanishes with the pod. In the cluster that is masked today only by
  // readOnlyRootFilesystem — i.e. correctness resting on an unrelated flag staying set. A missing
  // mount is ENOENT, and it stays ENOENT: this code does not get to invent the volume.
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
 * A volume problem is 503, not 500 and never 4xx.
 *
 * The request was fine and the server simply cannot do it right now — and the distinction is what
 * tells whoever is reading whether to look at their curl or at the values file. Anything not listed
 * here is a bug in this code and is allowed to 500 rather than be dressed up as a config problem.
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

// ---------------------------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------------------------

/**
 * The résumé, read per request. No cache — that is the entire point of the change.
 *
 * Same reasoning as platformVersion() in versions.ts: a cache here would reintroduce precisely the
 * staleness the per-request read exists to remove, and it would do it invisibly. It would also be
 * defeated by the writer that is not this process — `pv-content.sh` still writes this volume directly
 * and would never call an invalidation hook.
 *
 * `seed` is the copy Vite bakes into the image from public/resume.pdf. It answers before the volume is
 * seeded and when there is no volume at all (npm run dev). It is not a fallback bolted on: it is the
 * same file express.static would have served, now reached deliberately rather than by accident of a
 * mount. Both are parameters, not constants, so tests use real files.
 */
export function serveResume(contentDir: string, seed: string) {
  return (_req: Request, res: Response): void => {
    // no-cache = revalidate every time (it does NOT mean "do not store"). serve-static's default for
    // this path is already equivalent; saying it means the rule survives someone changing that default.
    const opts = { headers: { 'Cache-Control': 'no-cache' } };
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

// ---------------------------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------------------------

export interface MountOpts {
  env: Env;
  /** Injectable for tests; defaults to a remote key set built from env.authJwksUri. */
  jwks?: JWTVerifyGetKey;
}

/**
 * Register the admin write route — but ONLY when a verifier exists.
 *
 * Same shape as the quiz's mountProgress, which returns early with no DATABASE_URL: the routes simply
 * do not exist. Not registered-and-disabled, and the difference matters more here than it does there.
 * A disabled route puts the safety of the whole feature on one `if` inside a handler staying correct
 * forever; an unregistered one makes "open by accident" unrepresentable. The quiz's worst case is
 * unsynced progress. This one's is an unauthenticated write to a shared volume.
 *
 * The 404 a caller then gets is also honest: in a dev checkout, the endpoint genuinely is not there.
 * The cost is silence, and the boot log in index.ts pays it.
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
      // Narrowed ONCE into a local, and then only the local is used — never req.body again.
      //
      // Not a Buffer means the global express.json already consumed the stream — i.e. the caller sent
      // Content-Type: application/json, which this endpoint does not accept. Naming that explicitly
      // turns a confusing interaction between two parsers into a clean, tested 415.
      //
      // Reading `req.body.length` later would also be a genuine type-confusion hazard rather than a
      // pedantic one: req.body is whatever a parser put there, so on another path it could be an array
      // or a string, and `.length` would then silently mean "number of elements" or "number of UTF-16
      // code units" instead of bytes — the same name, three meanings, no error. The guard is what makes
      // it a Buffer; the local is what makes that guarantee survive to the places that use it.
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
        // Newlines stripped INLINE, the same idiom index.ts uses on the greeting it relays. Belt and
        // braces — nothing is logged until `name` has passed the allowlist, and neither shape it
        // admits can hold a newline — but a log is read by people and parsed by machines, and a
        // value carrying \r\n can forge a second entry. Hold the property where the value is used
        // rather than re-deriving it from a regex further up that a later edit may widen.
        // The regex and its empty replacement are both deliberate — see the note at the sink below.
        // `fault.code` is a literal from volumeFault's own switch, not err.code off the caught error:
        // the error came from a filesystem call on a caller-supplied path, so its fields are the
        // caller's data. The switch has already decided which of four codes this is, so echoing its
        // own constant says exactly the same thing while owning the string.
        console.error(`[content] write ${name.replace(/\n|\r/g, '')} failed: ${fault.code}`);
        res.status(fault.status).json({ error: fault.error });
        return;
      }

      // The size is READ BACK off the volume rather than taken from the request body's length, and it
      // is worth the extra stat(2). This repo's deploy script states the principle outright — "read it
      // back rather than trusting the command that set it; every silent failure this platform has had
      // was a step that reported success without being checked" — and it applies exactly here: this
      // number is the receipt for a write, so it should describe the file that now exists rather than
      // the buffer we hoped we wrote. It also cannot disagree with the volume, which `body.length`
      // could if the write were ever partial.
      const written = await stat(target.abs);

      // Newlines stripped where the value is USED, not argued about. Belt and braces: nothing is
      // logged until `name` has passed the allowlist, and neither shape it admits can hold a newline
      // — but a log is read by people and parsed by machines, and a value carrying \r\n can forge a
      // second entry. Better a property held at the sink than one re-derived from a regex further up
      // that a later edit may widen.
      //
      // The EXACT form is load-bearing, and only for a reader outside this file: CodeQL's log-injection
      // sanitiser recognises a global replace only when BOTH hold — the regex yields the constant "\n"
      // or "\r", and the replacement is the empty string. So:
      //
      //   /[\r\n]/g -> ' '   taint flows straight through; a character class is not a constant term
      //   /\n|\r/g  -> ' '   still flows; the replacement is not empty
      //   /\n|\r/g  -> ''    recognised — the alert clears
      //
      // All three behave identically at runtime. Established by reading the SARIF dataflow, which showed
      // the first two being STEPPED THROUGH rather than stopped at, not by guessing. Don't "simplify"
      // this to a character class or a nicer-looking space: it silently re-opens a scanner finding.
      console.log(`[content] wrote ${name.replace(/\n|\r/g, '')}`);
      res.json({
        ok: true,
        bytes: written.size,
        // The résumé is live on the very next request: nothing to notify, nothing to invalidate,
        // because there is no cache. Cards are NOT — the quiz builds its decks once at startup, so a
        // deck written here changes nothing until that pod restarts. Saying so is the difference
        // between a response and a lie.
        ...(name === RESUME ? {} : { note: 'cards take effect on the quiz’s next restart' }),
      });
    },
  );
}
