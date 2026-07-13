import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The "Who are you?" dialog. It has three rules that matter, and all three are easy to break:
 *   1. it asks ONCE, however it was dismissed;
 *   2. answering is optional — skipping must send nothing at all;
 *   3. what a visitor types reaches me, and reaches me exactly once.
 *
 * Rule 3 has a side effect on the far end (a Discord message), which is precisely why it should be
 * pinned down by a test rather than by clicking around.
 */

const GREETED_KEY = 'portfolio-home:greeted';

let fetchMock: ReturnType<typeof vi.fn>;

async function mountPage(opts: { greeted?: boolean; search?: string } = {}): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  if (opts.greeted) localStorage.setItem(GREETED_KEY, '2026-01-01T00:00:00.000Z');
  window.history.replaceState({}, '', `/${opts.search ?? ''}`);

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/config')) return new Response(JSON.stringify({ vmcpApiBase: '' }), { status: 200 });
    if (url.includes('/api/servers')) return new Response('[]', { status: 200 });
    return new Response('{"ok":true}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);

  vi.resetModules();
  await import('./main.js');
  await new Promise((r) => setTimeout(r, 0));
}

const dialog = () => document.querySelector('dialog.hello') as HTMLDialogElement | null;
const greetings = () => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/hello'));

/** The body of the single greeting that was sent. */
function sentGreeting(): Record<string, unknown> {
  const [, init] = greetings()[0] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('asks once', () => {
  test('opens on a first visit', async () => {
    await mountPage();
    expect(dialog()?.open).toBe(true);
  });

  test('does not open again once the visitor has been asked', async () => {
    await mountPage({ greeted: true });
    expect(dialog()).toBeNull();
  });

  test('closing it — however — counts as having asked', async () => {
    await mountPage();
    dialog()!.close();
    expect(localStorage.getItem(GREETED_KEY)).not.toBeNull();
  });

  test('?greet re-opens it, and strips itself from the URL so a shared link never carries it', async () => {
    await mountPage({ greeted: true, search: '?greet' });
    expect(dialog()?.open).toBe(true);
    expect(window.location.search).toBe('');
  });

  test('resetGreeting() clears the flag for the next load', async () => {
    await mountPage({ greeted: true });
    (window as unknown as { resetGreeting: () => string }).resetGreeting();
    expect(localStorage.getItem(GREETED_KEY)).toBeNull();
  });
});

describe('answering is optional', () => {
  test('Skip closes the dialog and sends nothing', async () => {
    await mountPage();
    (document.querySelector('.hello-skip') as HTMLButtonElement).click();

    expect(dialog()!.open).toBe(false);
    expect(greetings(), 'skipping must not notify anyone').toHaveLength(0);
  });

  test('submitting both fields empty is just a slower Skip', async () => {
    await mountPage();
    (document.querySelector('.hello-card') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    expect(greetings()).toHaveLength(0);
    expect(dialog()!.open).toBe(false);
  });
});

describe('what a visitor types reaches me', () => {
  test('sends the name and the company, once', async () => {
    await mountPage();
    (document.querySelector('#hello-who') as HTMLInputElement).value = 'linkedin.com/in/someone';
    (document.querySelector('#hello-co') as HTMLInputElement).value = 'Acme Corp';
    (document.querySelector('.hello-card') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(greetings(), 'exactly one notification').toHaveLength(1);
    const body = sentGreeting();
    expect(body.who).toBe('linkedin.com/in/someone');
    expect(body.company).toBe('Acme Corp');
  });

  test('the company alone is a real answer — "someone from Acme is looking" is worth knowing', async () => {
    await mountPage();
    (document.querySelector('#hello-co') as HTMLInputElement).value = 'Acme Corp';
    (document.querySelector('.hello-card') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(greetings()).toHaveLength(1);
    expect(sentGreeting().company).toBe('Acme Corp');
    expect(sentGreeting().who).toBe('');
  });

  test('acknowledges the visitor by what they typed', async () => {
    await mountPage();
    (document.querySelector('#hello-who') as HTMLInputElement).value = 'Ada';
    (document.querySelector('.hello-card') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    expect(document.querySelector('.hello h2')?.textContent).toContain('Ada');
  });
});
