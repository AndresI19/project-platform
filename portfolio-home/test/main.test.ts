import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BIO, BIO_CODA, CONTACTS, ENTRIES, EXPERIENCE, NAME, TITLE, isGroup } from '../src/client/data.js';

/**
 * The home page has never had a test. These are characterization tests: they describe the HTML the
 * page produces today, so the planned tidy-up of main.ts (shared row/card builders) can be judged by
 * a single question — does the page still render the same thing?
 *
 * They deliberately assert against `data.ts` rather than against hard-coded strings. Adding a project
 * should not break the suite; rendering one *wrong* should.
 */

interface MountOptions {
  /** What GET /api/config answers with. */
  vmcpApiBase?: string;
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Boot the page fresh. main.ts renders as a side effect of import, so each mount needs a new copy. */
async function mountPage(opts: MountOptions = {}): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/config')) {
      return new Response(JSON.stringify({ vmcpApiBase: opts.vmcpApiBase ?? '' }), { status: 200 });
    }
    if (url.includes('/api/servers')) {
      return new Response(JSON.stringify([{ id: 'uuid-rs', slug: 'rs-mcp', enabled: true }]), {
        status: 200,
      });
    }
    // The aggregated versions: the platform's own (the orchestration repo — no image, read from the
    // volume) alongside the five deployed components. `vmcp` is deliberately a -snapshot and
    // `platform-auth` deliberately null (a component that did not answer) — both are states the page
    // has to render correctly, and neither shows up if the fixture is all happy-path releases.
    if (url.endsWith('/api/versions')) {
      return new Response(
        JSON.stringify({
          platform: '0.1.0',
          components: {
            home: '0.1.4',
            quiz: '0.1.4',
            vmcp: '0.1.4-snapshot',
            'rs-mcp-server': '0.0.32',
            'platform-auth': null,
          },
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);

  vi.resetModules();
  await import('../src/client/main.js');
  // let the config fetch + the first liveness poll settle
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

const $ = (sel: string) => document.querySelector(sel);
const $$ = (sel: string) => [...document.querySelectorAll(sel)];

beforeEach(() => {
  vi.useRealTimers();
});

describe('masthead', () => {
  test('renders the identity, both bio lines, and every contact', async () => {
    await mountPage();

    expect($('.masthead h1')?.textContent).toBe(NAME);
    expect($('.mast-title')?.textContent).toBe(TITLE);

    const bios = $$('.mast-bio').map((p) => p.textContent);
    expect(bios).toEqual([BIO, BIO_CODA]);
    // The coda is a separate line on purpose — it is the turn from "who I am" to "here is the thing".
    expect($('.mast-bio.coda')?.textContent).toBe(BIO_CODA);

    expect($$('.contact .cx')).toHaveLength(CONTACTS.length);
  });
});

describe('featured banner', () => {
  test('shows exactly the featured entries', async () => {
    await mountPage();
    const featured = ENTRIES.filter((e) => e.featured);
    expect($$('.feat-banner .feat')).toHaveLength(featured.length);
  });

  test('the kubectl terminal lists the core-tier pods', async () => {
    await mountPage();
    // A curated core subset, not the full pod list — see diagrams.ts for why (tile height). The
    // command carries `-l tier=core`, so showing four pods is honest rather than a stale omission.
    const names = $$('.term .ps td.n').map((td) => td.textContent);
    expect(names).toEqual(['nginx', 'home', 'vmcp', 'platform-auth']);
    expect($$('.term .ps td.up')).toHaveLength(names.length);
  });

  test('the quiz card shows the question above the garden, in separate frames', async () => {
    await mountPage();
    const imgs = $$('.media.stack img').map((i) => (i as HTMLImageElement).getAttribute('src'));
    // Order matters: led by the garden alone, the card reads as a game and the word "quiz" is lost.
    expect(imgs).toEqual(['/quiz-sharding.png', '/home-page-garden-v2.gif']);
  });

  test('the grouped entry renders its logo and one panel per member', async () => {
    await mountPage();
    const group = ENTRIES.find(isGroup)!;
    const card = $('.media.logo')!.closest('.feat')!;
    expect(card.querySelectorAll('.member')).toHaveLength(group.members.length);
    expect(card.querySelector('.grouped')?.textContent).toBe(`${group.members.length} repos`);
  });
});

describe('all-projects list', () => {
  test('lists every entry, grouped ones as a single row', async () => {
    await mountPage();
    expect($$('.projects > li')).toHaveLength(ENTRIES.length);
  });

  test('marks the featured entries with a badge', async () => {
    await mountPage();
    const featured = ENTRIES.filter((e) => e.featured);
    expect($$('.projects .tag.featured')).toHaveLength(featured.length);
  });

  test('carries the work-in-progress and archived badges from the data', async () => {
    await mountPage();
    const wip = ENTRIES.filter((e) => !isGroup(e) && e.tag?.icon === 'wip');
    const archived = ENTRIES.filter((e) => !isGroup(e) && e.tag?.icon === 'archived');
    expect($$('.projects .tag.wip')).toHaveLength(wip.length);
    expect($$('.projects .tag.archived')).toHaveLength(archived.length);
  });
});

describe('member panels are shared between the banner and the list', () => {
  // This is the invariant that memberPanels() exists to guarantee. The two used to be copy-pasted,
  // so they could silently disagree about what a member looks like.
  test('the same members, in the same order, in both places', async () => {
    await mountPage();
    const namesIn = (root: Element) =>
      [...root.querySelectorAll('.member .member-name')].map((n) => n.textContent);

    const bannerCard = $('.feat-banner .feat .members')!.closest('.feat')!;
    const listRow = $('.projects .group-row')!;

    const group = ENTRIES.find(isGroup)!;
    const expected = group.members.map((m) => m.name);
    expect(namesIn(bannerCard)).toEqual(expected);
    expect(namesIn(listRow)).toEqual(expected);
  });

  test('but style their links differently — buttons in the card, chips in the row', async () => {
    await mountPage();
    const bannerCard = $('.feat-banner .feat .members')!.closest('.feat')!;
    const listRow = $('.projects .group-row')!;

    expect(bannerCard.querySelector('.member-actions .btn.sm')).not.toBeNull();
    expect(listRow.querySelector('.member-actions .chip')).not.toBeNull();
  });
});

describe('professional experience', () => {
  test('renders each role with its doc links as FAB bubbles', async () => {
    await mountPage();
    expect($$('.exp')).toHaveLength(EXPERIENCE.length);
    const links = EXPERIENCE.flatMap((e) => e.links);
    expect($$('.exp-links .exp-fab')).toHaveLength(links.length);
  });
});

describe('version badges', () => {
  test('the footer tag shows the PLATFORM version, not this app’s', async () => {
    await mountPage();
    // A tag in the corner of the whole site says what the whole site is. The orchestration repo
    // ships no image, so this number comes off the shared volume, not out of a container.
    expect($('.vertag')?.textContent).toBe('0.1.0');
  });

  test('the orchestration card is badged with the platform version', async () => {
    await mountPage();
    expect($$('[data-ver="platform"]').map((el) => el.textContent)).toContain('0.1.0');
  });

  test('each deployed component shows its own version', async () => {
    await mountPage();
    const ver = (component: string): string | undefined =>
      $$(`[data-ver="${component}"]`)[0]?.textContent ?? undefined;
    expect(ver('quiz')).toBe('0.1.4');
    expect(ver('rs-mcp-server')).toBe('0.0.32');
    // home still reports its OWN image's version — the platform version did not overwrite it.
    expect(ver('home')).toBe('0.1.4');
  });

  test('a build that does not match main is marked as a snapshot', async () => {
    await mountPage();
    const vmcp = $$('[data-ver="vmcp"]')[0];
    expect(vmcp?.textContent).toBe('0.1.4-snapshot');
    expect(vmcp?.classList.contains('snapshot')).toBe(true);
  });

  test('a component that does not answer shows no badge at all, rather than an empty one', async () => {
    await mountPage();
    // platform-auth answered null. The badge must stay hidden and empty — an unknown version and a
    // version of "" are different claims, and only one of them is honest.
    const auth = $$('[data-ver="platform-auth"]')[0] as HTMLElement | undefined;
    expect(auth?.textContent).toBe('');
    expect(auth?.hidden).toBe(true);
  });

  test('versions are fetched exactly once — they are not polled', async () => {
    await mountPage();
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/versions'));
    expect(calls).toHaveLength(1);
  });
});

describe('liveness probes', () => {
  test('read the gateway registry same-origin when no API base is configured', async () => {
    await mountPage({ vmcpApiBase: '' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/vmcp/api/servers');
  });

  test('read it from the API host when one is configured', async () => {
    await mountPage({ vmcpApiBase: 'https://api-andres.example' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('https://api-andres.example/api/servers');
  });

  test("the vMCP card's own health probe stays same-origin, even when the API is split off", async () => {
    // Two different questions, deliberately answered from two different places: "what does the
    // gateway have registered?" is data, and moves to the API host; "is the dashboard reachable at
    // /vmcp/ on THIS host?" is a probe of the front end, and would be meaningless anywhere else.
    await mountPage({ vmcpApiBase: 'https://api-andres.example' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/vmcp/api/servers');
  });

  test('mark a project live when the gateway reports its server enabled', async () => {
    await mountPage();
    const badge = $('.live[data-live="rs-mcp-server"]');
    expect(badge?.classList.contains('up')).toBe(true);
    expect(badge?.querySelector('.lt')?.textContent).toBe('live');
  });
});
