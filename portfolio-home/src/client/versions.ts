// Versions: ask the server what every component of the platform is actually running, and write the
// answers into the badges. The one part of the page that talks to the network EXACTLY ONCE.
//
// Deliberately not polled, unlike liveness. Liveness is a fact about the world that changes on its
// own — a pod can fall over while you are reading — so it is worth re-asking. A version cannot: it is
// baked into an image, and a new image means new pods, which means the page a visitor is looking at
// is already stale in every other respect too. Refreshing the page refreshes the versions, and that
// is the whole contract; a timer here would burn requests to re-learn a constant.
//
// One fetch, not five: the server does the fan-out (see server/versions.ts — the other components
// have no public /version route, and in production they are on a different origin).

/**
 * The shape /api/versions answers with. `platform` is a sibling of `components`, not one of them: the
 * orchestration repo has no image, no Pod and no Service — it is the description of what the
 * components are — so the server keeps the two apart rather than leaving a consumer to guess which
 * keys are services. See server/versions.ts.
 */
interface Payload {
  platform: string | null;
  components: Record<string, string | null>;
}

/** Fill every `[data-ver]` element with its version. Called once, on load. */
export async function paintVersions(): Promise<void> {
  let payload: Payload;
  try {
    const r = await fetch('/api/versions', { cache: 'no-store' });
    if (!r.ok) return;
    payload = (await r.json()) as Payload;
  } catch {
    // No versions is a fine outcome: the placeholders stay as they are. A build-metadata display must
    // never be able to break the page it decorates.
    return;
  }

  // Flattened for lookup, so the markup does not have to care which of the two a name came from: a
  // badge is a badge. `platform` is reserved for the orchestration version and cannot collide — it is
  // not, and cannot become, the name of a component (there is no `platform` image).
  const versions: Record<string, string | null> = {
    platform: payload.platform ?? null,
    ...(payload.components ?? {}),
  };

  document.querySelectorAll<HTMLElement>('[data-ver]').forEach((el) => {
    const version = versions[el.dataset.ver ?? ''];
    // null = the component did not answer. Leave the placeholder rather than print "null" or an empty
    // badge — an unknown version and no version are different things, and neither is a lie worth telling.
    if (!version) return;
    el.textContent = version;
    el.hidden = false;
    // A snapshot is a build that does not match main. Marking it lets the CSS say so, so a
    // pre-release deploy is visible at a glance instead of hiding behind a plausible number.
    el.classList.toggle('snapshot', version.endsWith('-snapshot'));
  });
}
