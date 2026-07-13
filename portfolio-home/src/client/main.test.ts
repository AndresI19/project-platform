import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BIO, BIO_CODA, CONTACTS, ENTRIES, EXPERIENCE, NAME, TITLE, isGroup } from './data.js';

/**
 * The home page has never had a test. These are characterization tests: they describe the HTML the
 * page produces today, so the planned tidy-up of main.ts (shared row/card builders) can be judged by
 * a single question — does the page still render the same thing?
 *
 * They deliberately assert against `data.ts` rather than against hard-coded strings. Adding a project
 * should not break the suite; rendering one *wrong* should.
 */

const GREETED_KEY = 'portfolio-home:greeted';

interface MountOptions {
  greeted?: boolean;
  /** e.g. '?greet' — the escape hatch that re-opens the dialog. */
  search?: string;
  /** What GET /api/config answers with. */
  vmcpApiBase?: string;
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Boot the page fresh. main.ts renders as a side effect of import, so each mount needs a new copy. */
async function mountPage(opts: MountOptions = {}): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  if (opts.greeted) localStorage.setItem(GREETED_KEY, '2026-01-01T00:00:00.000Z');
  window.history.replaceState({}, '', `/${opts.search ?? ''}`);

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/config')) {
      return new Response(JSON.stringify({ vmcpApiBase: opts.vmcpApiBase ?? '' }), { status: 200 });
    }
    if (url.includes('/api/servers')) {
      return new Response(JSON.stringify([{ id: 'uuid-rs', slug: 'rs-mcp', enabled: true }]), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);

  vi.resetModules();
  await import('./main.js');
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
    expect(imgs).toEqual(['/quiz-sharding.png', '/home-page-garden.gif']);
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
    const namesIn = (root: Element) => [...root.querySelectorAll('.member .member-name')].map((n) => n.textContent);

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

describe('version badge', () => {
  test('shows the version injected at build time', async () => {
    await mountPage();
    expect($('.vertag')?.textContent).toBe('0.0.0-test');
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
