import { readFileSync } from 'node:fs';

/**
 * What every component reports as its version, as one object.
 *
 * Each service bakes a VERSION file into its image (`k8s/deploy.sh` stamps it from that repo's latest
 * git tag, `-snapshot` when the source differs from main) and serves it at `/version`. This module
 * asks all of them and returns one map, so the browser makes ONE request per page load, not five.
 *
 * The fan-out is on the SERVER, not the browser, and that is why this file exists:
 *   - `rs-mcp-server` and `platform-auth` have no public route — the browser can't reach their
 *     `/version` without new nginx routes that exist purely to expose build metadata.
 *   - In production the front end and API are on different hostnames, so browser fetches would be
 *     cross-origin and need a CORS entry each.
 * From inside the cluster they are just service DNS names — no routing, no CORS.
 *
 * NO polling, NO cache: the browser asks once per page load. A version cannot change without a new
 * image, and a new image means new Pods, so the only thing that invalidates this is a change the
 * visitor must already reload to see.
 */

/**
 * In-cluster addresses, keyed by the component name the client renders against. Service DNS, so
 * these resolve only from inside the cluster: run the home page locally and every one of them fails,
 * which is handled (a component that does not answer is reported as `null`, not as an error).
 *
 * `quiz` is prefixed because the quiz mounts every route beneath its BASE_PATH — the same reason its
 * health probe lives at `/cloud-developer-quiz/api/health` rather than `/api/health`.
 */
const TARGETS: Record<string, string> = {
  quiz: 'http://quiz/cloud-developer-quiz/version',
  vmcp: 'http://vmcp:8001/version',
  'rs-mcp-server': 'http://rs-mcp-server:8000/version',
  'platform-auth': 'http://platform-auth:8002/version',
};

/**
 * The version spec, written onto the shared PersistentVolume by platform-orchestration's
 * k8s/deploy.sh and read here per request.
 *
 * The PLATFORM's version cannot arrive the way every component's does. The other five are services:
 * each is an image carrying its own VERSION file. The orchestration repo ships no image — it *is* the
 * description of what gets deployed — so its version travels on the volume instead, for the same
 * reason the résumé and card decks do: it is content, and changes on a different clock than the code.
 */
/** The mount path is fixed by the manifest (home.yaml mounts the content volume at /content). It is a
    parameter with a default, not a bare constant, so tests can point it at a real fixture instead of
    stubbing node:fs — the failure modes here (missing file, truncated JSON) are exactly what a stub
    would paper over. */
const SPEC_PATH = '/content/platform-version.json';

/**
 * Read per REQUEST, not at startup — the point of keeping it on the volume.
 *
 * A deploy rewrites this file. Read at boot (as each component's own VERSION is, since that genuinely
 * cannot change under a running image), the page would keep reporting the platform version it started
 * with and need a pointless rollout to tell the truth. Per-request means a redeploy shows on the next
 * page load, no restart. It is a small local file hit once per page load, so caching would only
 * reintroduce the staleness the per-request read exists to avoid.
 */
export function platformVersion(specPath: string = SPEC_PATH): string | null {
  try {
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as { platform?: unknown };
    return typeof spec.platform === 'string' && spec.platform ? spec.platform : null;
  } catch {
    // No spec: a dev checkout, or a cluster deployed before the spec existed. Both are "unknown",
    // which is null — not "snapshot", which would be a claim about the source tree we cannot make.
    return null;
  }
}

/** A component that cannot be reached, or answers with nonsense, is `null` — never a thrown error.
    A version display is decoration; it must not be able to take the page down with it. The timeout
    is short for the same reason: one hung pod cannot be allowed to stall the whole response. */
async function probe(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const body = (await r.json()) as { version?: unknown };
    return typeof body.version === 'string' && body.version ? body.version : null;
  } catch {
    return null;
  }
}

/** The platform's version, and every component's. */
export interface PlatformVersions {
  /** The orchestration repo's version — the topology, not any one service. `null` if unknown. */
  platform: string | null;
  /** The five deployed services, each reporting the version baked into its own image. */
  components: Record<string, string | null>;
}

/**
 * Everything, in one object.
 *
 * `platform` is a sibling of `components`, not a member of it, because it is not one: it has no
 * image, no Pod and no Service, and it is the thing that decides what the components ARE. Flattening
 * it in among them would leave a consumer unable to tell which keys are services.
 *
 * `own` is this server's version, which it already holds — asking itself over HTTP would be a round
 * trip to learn something it read from its own image at startup.
 */
export async function collectVersions(own: string, specPath?: string): Promise<PlatformVersions> {
  const probed = await Promise.all(
    Object.entries(TARGETS).map(async ([name, url]) => [name, await probe(url)] as const),
  );
  return {
    platform: platformVersion(specPath),
    components: { home: own, ...Object.fromEntries(probed) },
  };
}
