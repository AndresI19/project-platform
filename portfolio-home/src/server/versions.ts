import { readFileSync } from 'node:fs';

/**
 * What every component reports as its version, as one object.
 *
 * Each service bakes a VERSION file into its image (k8s/deploy.sh stamps it from that repo's git tag,
 * `-snapshot` off main) and serves it at `/version`. This module asks all of them and returns one map,
 * so the browser makes ONE request per page load, not five.
 *
 * The fan-out is on the SERVER, not the browser — which is why this file exists: rs-mcp-server and
 * platform-auth have no public route, and in production the front end and API are different hostnames,
 * so browser fetches would need new nginx routes AND a CORS entry each. In-cluster they are just
 * service DNS. No polling, no cache: a version can't change without a new image (hence new Pods), so
 * the only thing that invalidates this is a change the visitor must already reload to see.
 */

/**
 * In-cluster addresses, keyed by the component name the client renders. Service DNS, so they resolve
 * only inside the cluster — run locally and each fails, which is handled (an unanswered component is
 * `null`, not an error). `quiz` is prefixed because it mounts every route beneath its BASE_PATH.
 */
const TARGETS: Record<string, string> = {
  quiz: 'http://quiz/cloud-developer-quiz/version',
  vmcp: 'http://vmcp:8001/version',
  'rs-mcp-server': 'http://rs-mcp-server:8000/version',
  'platform-auth': 'http://platform-auth:8002/version',
};

/**
 * The version spec, written onto the shared PersistentVolume by k8s/deploy.sh and read here per
 * request. The PLATFORM's version can't arrive the way a component's does: the orchestration repo
 * ships no image — it IS the description of what gets deployed — so its version travels on the volume,
 * like the résumé, as content that changes on a different clock than the code. The mount path is fixed
 * by the manifest; it's a parameter with a default, not a constant, so tests use a real fixture
 * instead of stubbing node:fs (which would paper over missing-file / truncated-JSON failures).
 */
const SPEC_PATH = '/content/platform-version.json';

/** A present, non-empty string, or null. A version read off the wire or a file is only ever one of
 *  those two things: something real to show, or "unknown" — which is null, never '' and never a
 *  non-string. Both readers below coerce through here so they agree on what "no version" means. */
const nonEmptyString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Read per REQUEST, not at startup — the point of keeping it on the volume. A deploy rewrites this
 * file; read at boot, the page would report the platform version it started with and need a pointless
 * rollout to tell the truth. Per-request, a redeploy shows on the next page load. Caching a file hit
 * once per page load would only reintroduce the staleness the per-request read avoids.
 */
export function platformVersion(specPath: string = SPEC_PATH): string | null {
  try {
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as { platform?: unknown };
    return nonEmptyString(spec.platform);
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
    return nonEmptyString(body.version);
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
 * Everything, in one object. `platform` is a sibling of `components`, not a member: it has no image,
 * Pod or Service, and it decides what the components ARE — flattening it in would leave a consumer
 * unable to tell which keys are services. `own` is this server's own version, already in hand; asking
 * itself over HTTP would be a round trip for what it read from its image at startup.
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
