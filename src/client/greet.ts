// The first-visit greeting. Self-contained: its own storage key, its own dialog, its own relay.
import { esc } from './util.js';

// ---------------------------------------------------------------------------
// First-visit greeting. Asks who is looking, and forwards the answer to me as a push
// notification. Answering is entirely optional and the copy says so plainly: the page is
// identical either way, and skipping is a first-class button, not a hidden ✕.
// ---------------------------------------------------------------------------

/** Set once the dialog has been shown, however it was dismissed — so it only ever asks once. */
const GREETED_KEY = 'portfolio-home:greeted';

/** localStorage throws outright in some privacy modes; a visitor who blocks it just gets asked again. */
function greeted(): boolean {
  try {
    return localStorage.getItem(GREETED_KEY) !== null;
  } catch {
    return false;
  }
}
function markGreeted(): void {
  try {
    localStorage.setItem(GREETED_KEY, new Date().toISOString());
  } catch {
    /* nothing to do — the dialog simply shows again next visit */
  }
}

/** Fire-and-forget: a failed notification must never block or nag the visitor. */
async function sendGreeting(who: string, company: string): Promise<void> {
  try {
    await fetch('/api/hello', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who, company, referrer: document.referrer || null }),
    });
  } catch {
    /* ignore */
  }
}

/** Forget the visit, so the dialog asks again. Exposed on `window` for the console (see below). */
function forgetGreeting(): void {
  try {
    localStorage.removeItem(GREETED_KEY);
  } catch {
    /* nothing stored to forget */
  }
}

export function greet(): void {
  // Two ways to get the dialog back without clearing site data, because testing it otherwise means
  // wiping the whole origin's storage:
  //   1. load the page as  /?greet   — forces it once, for a quick look
  //   2. run  resetGreeting()  in the console, then reload
  // The query param is stripped from the URL afterwards, so a copied link never carries it.
  const forced = new URLSearchParams(location.search).has('greet');
  if (forced) {
    forgetGreeting();
    history.replaceState(null, '', location.pathname);
  }

  if (greeted()) return;

  const dlg = document.createElement('dialog');
  dlg.className = 'hello';
  dlg.innerHTML = `
    <form class="hello-card" novalidate>
      <h2 id="hello-h">Who are you?</h2>
      <p class="hello-sub">A LinkedIn, an email, or a name — so I know who is curious about my page.</p>
      <label class="hello-lab" for="hello-who">LinkedIn, email, or name</label>
      <input class="hello-in" id="hello-who" type="text" name="who" maxlength="200" autocomplete="name"
             placeholder="linkedin.com/in/… · you@company.com · your name"
             aria-describedby="hello-opt">
      <label class="hello-lab" for="hello-co">Company</label>
      <input class="hello-in" id="hello-co" type="text" name="company" maxlength="120"
             autocomplete="organization"
             placeholder="where you work — or who you're recruiting for"
             aria-describedby="hello-opt">
      <p class="hello-opt" id="hello-opt">
        <strong>Both fields are completely optional.</strong> Skip and the page works exactly the
        same — nothing here is gated, and nothing else about you is collected.
      </p>
      <div class="hello-actions">
        <button type="button" class="hello-skip" data-act="skip">Skip</button>
        <button type="submit" class="btn primary">Send</button>
      </div>
    </form>`;
  dlg.setAttribute('aria-labelledby', 'hello-h');
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form')!;
  const input = dlg.querySelector<HTMLInputElement>('#hello-who')!;
  const company = dlg.querySelector<HTMLInputElement>('#hello-co')!;

  // Asked is asked — Esc, backdrop, Skip and Send all count, so nobody is prompted twice.
  dlg.addEventListener('close', markGreeted);

  dlg.querySelector<HTMLButtonElement>('[data-act="skip"]')!.addEventListener('click', () => dlg.close());
  // A click on the backdrop lands on the <dialog> itself; one on the card does not.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const who = input.value.trim();
    const co = company.value.trim();
    if (!who && !co) {
      dlg.close(); // "Send" with both boxes empty is just a slower Skip.
      return;
    }
    void sendGreeting(who, co);
    // Acknowledge before closing, so the visitor sees that the thing they typed went somewhere.
    // Company alone is a valid answer, so the thank-you falls back to it when there is no name.
    const label = who || co;
    form.innerHTML = `<h2>Thanks, ${esc(label.slice(0, 60))} 👋</h2>
      <p class="hello-sub">Enjoy the site.</p>`;
    setTimeout(() => dlg.close(), 1400);
  });

  dlg.showModal();
}

// The console escape hatch for re-testing the greeting: `resetGreeting()` then reload.
(window as unknown as { resetGreeting: () => string }).resetGreeting = () => {
  forgetGreeting();
  return 'Greeting reset — reload the page to see the dialog again.';
};
