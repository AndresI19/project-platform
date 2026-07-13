// Liveness: ask the gateway what it has registered, then light up the badges. The one part of the
// page that talks to the network on a timer.
import { ENTRIES, isGroup, type Project } from './data.js';
import { slug } from './util.js';

/** Every project on the page, groups flattened — the unit that probes and links resolve against. */
const ALL: Project[] = ENTRIES.flatMap((e) => (isGroup(e) ? e.members : [e]));

/** Where the gateway's data API lives. Empty = same-origin under /vmcp (local); in production the
    front end and the API are different hostnames, so the server hands us the origin at runtime. */
let vmcpApiBase = '';
export async function loadConfig(): Promise<void> {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) vmcpApiBase = ((await r.json()) as { vmcpApiBase?: string }).vmcpApiBase ?? '';
  } catch {
    /* same-origin default stands */
  }
}
/** `/api/servers` → `/vmcp/api/servers` locally, or `https://api.…/api/servers` in production. */
export const vmcpApi = (path: string): string => (vmcpApiBase ? `${vmcpApiBase}${path}` : `/vmcp${path}`);

/** The vMCP registry, fetched once per refresh and shared by the probes and the link resolver. */
type Server = { id: string; slug: string; enabled: boolean };
async function vmcpRegistry(): Promise<Server[]> {
  try {
    const r = await fetch(vmcpApi('/api/servers'), { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Server[]) : [];
  } catch {
    return [];
  }
}

/** Point `[data-resolve="vmcp"]` links at the server's detail page. The UUID is assigned by the
    gateway's database, so it is looked up by slug rather than hard-coded — a reseed that mints a
    new UUID fixes itself on the next poll. Links whose slug is absent keep their fallback href. */
function resolveVmcpLinks(servers: Server[]): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-resolve="vmcp"]').forEach((a) => {
    const hit = servers.find((s) => s.slug === a.dataset.slug);
    if (hit) a.href = `/vmcp/servers/${hit.id}`;
  });
}

/** Probe one project's liveliness through the reverse proxy. */
async function probe(p: Project, servers: Server[]): Promise<boolean> {
  if (!p.live) return false;
  if (p.live.type === 'vmcp') {
    return servers.some((s) => s.slug === p.live!.slug && s.enabled);
  }
  try {
    return (await fetch(p.live.url, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/** Poll every project with a probe and paint its indicator(s). A project appearing in both the
    featured banner and the list shares one data-live id, so a single update covers both. */
export async function refreshLiveness(): Promise<void> {
  const servers = await vmcpRegistry();
  resolveVmcpLinks(servers);
  await Promise.all(
    ALL.filter((p) => p.live).map(async (p) => {
      const up = await probe(p, servers);
      document.querySelectorAll<HTMLElement>(`.live[data-live="${slug(p.name)}"]`).forEach((el) => {
        el.classList.remove('checking');
        el.classList.toggle('up', up);
        el.classList.toggle('down', !up);
        const lt = el.querySelector('.lt');
        if (lt) lt.textContent = up ? 'live' : 'offline';
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// First-visit greeting. Asks who is looking, and forwards the answer to me as a push
// notification. Answering is entirely optional and the copy says so plainly: the page is
// identical either way, and skipping is a first-class button, not a hidden ✕.
// ---------------------------------------------------------------------------

