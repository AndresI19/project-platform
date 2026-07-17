// Versions: ask the server what every component is running and write the answers into the badges. The
// one part of the page that talks to the network EXACTLY ONCE — deliberately not polled, unlike
// liveness: a version is baked into an image, so a new one means new pods and a page already stale in
// every other respect. A timer would burn requests to re-learn a constant. One fetch, not five: the
// server does the fan-out (see server/versions.ts — the others have no public /version route, and in
// production are a different origin).

/**
 * The shape /api/versions answers with. `platform` is a sibling of `components`, not one of them: the
 * orchestration repo has no image, Pod or Service, so the server keeps the two apart. See
 * server/versions.ts.
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

  // Flattened for lookup, so the markup needn't care which of the two a name came from. `platform`
  // can't collide — there is no `platform` image, so it's never a component name.
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
