// The identity gate and the account FAB. Shared, so every front end asks the same question the same
// way and a sign-out means the same thing everywhere.

import {
  continueAsGuest,
  current,
  isAdmin,
  isSignedIn,
  onIdentity,
  signIn,
  signOut,
  signUp,
  type Identity,
} from './auth.js';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function needsGate(): boolean {
  return current() === null;
}

/* ── The gate ─────────────────────────────────────────────────────────────────────────────────── */

function chooseView(): string {
  return `
    <h2>Before you start</h2>
    <p class="pg-sub">Your progress has to live somewhere. Pick where.</p>
    <div class="pg-doors">
      <button class="pg-door primary" data-act="new">
        <span class="pg-door-t">Create an account</span>
        <span class="pg-door-d">Choose a username. You get a 7-character code to remember. Your
          progress follows you to any browser.</span>
      </button>
      <button class="pg-door" data-act="signin">
        <span class="pg-door-t">I have a code</span>
        <span class="pg-door-d">Sign back in with your username and code.</span>
      </button>
      <button class="pg-door" data-act="guest">
        <span class="pg-door-t">Continue as a guest</span>
        <!-- The consequence is IN the offer, not in fine print under it. Someone choosing this
             deserves to know what happens before they click, not after they lose a garden. -->
        <span class="pg-door-d warn">Nothing is sent anywhere. Everything stays in <em>this
          browser</em> — clear your site data, or open the site somewhere else, and it is gone.</span>
      </button>
    </div>`;
}

const newView = (): string => `
  <h2>Pick a username</h2>
  <p class="pg-sub">It is public — it appears on the dashboard and the leaderboard. It is not a secret.</p>
  <label class="pg-label" for="pg-user">Username</label>
  <input id="pg-user" class="pg-input" autocomplete="off" autocapitalize="off" spellcheck="false"
         placeholder="3–20 characters: a–z, 0–9, _ and -">
  <p class="pg-err" data-err hidden></p>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="back">Back</button>
    <button class="pg-btn primary" data-act="create">Create</button>
  </div>`;

const signInView = (): string => `
  <h2>Sign in</h2>
  <label class="pg-label" for="pg-user">Username</label>
  <input id="pg-user" class="pg-input" autocomplete="username" autocapitalize="off" spellcheck="false">
  <label class="pg-label" for="pg-code">Code</label>
  <input id="pg-code" class="pg-input mono" autocomplete="one-time-code" autocapitalize="characters"
         spellcheck="false" placeholder="4KP7R2M" maxlength="9">
  <p class="pg-err" data-err hidden></p>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="back">Back</button>
    <button class="pg-btn primary" data-act="go">Sign in</button>
  </div>`;

// The code. The button says "I have written it down" rather than "OK", because "OK" is what people
// click without reading. The code is also recoverable from the account menu while you stay signed in.
const codeView = (username: string, code: string): string => `
  <h2>Write this down</h2>
  <p class="pg-sub">You are <strong>${esc(username)}</strong>. This is your code.</p>
  <div class="pg-code" data-code>${esc(code)}</div>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="copy">Copy</button>
    <button class="pg-btn primary" data-act="greet">I have written it down</button>
  </div>`;

/**
 * The greeting — now an OPTIONAL second page of the gate rather than a dialog that ambushed you on
 * arrival. It asks who you are; it is entirely skippable; and it says exactly where the answer goes.
 *
 * What it collects is NOT persisted in the platform's database. It is relayed to a private Discord
 * channel and nothing else. That is stated on the page, in plain words, because a form that asks for
 * a LinkedIn URL and says nothing about what happens to it has not earned the answer.
 */
const greetView = (): string => `
  <h2>Who stopped by?</h2>
  <p class="pg-sub">Entirely optional. Skip it and everything works exactly the same.</p>
  <label class="pg-label" for="pg-who">LinkedIn, email, or a name</label>
  <input id="pg-who" class="pg-input" placeholder="linkedin.com/in/… · you@company.com · your name">
  <label class="pg-label" for="pg-co">Company</label>
  <input id="pg-co" class="pg-input" placeholder="where you work — or who you are recruiting for">
  <p class="pg-note">
    <strong>None of this is stored on the platform.</strong> It is not written to any database, it is
    not attached to your account, and it is not kept on the cluster. It is relayed to a private
    Discord channel so I know someone dropped by, and that is the end of it.
  </p>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="done">Skip</button>
    <button class="pg-btn primary" data-act="send">Send</button>
  </div>`;

export interface GateOptions {
  /** Called once the player has chosen. Apps use this to sync, re-route, or simply re-render. */
  onDone: (id: Identity | null) => void;
  /** Where the optional greeting is relayed. Absent → the greeting page is skipped entirely, which
   *  keeps account creation to two pages (pick a name, write the code down). */
  greetUrl?: string;
}

export function mountGate({ onDone, greetUrl }: GateOptions): void {
  const host = document.createElement('div');
  host.className = 'pg-host';
  document.body.appendChild(host);

  const close = (): void => {
    host.remove();
    onDone(current());
  };
  const shell = (inner: string): void => {
    host.innerHTML = `<div class="pg-backdrop"><div class="pg">${inner}</div></div>`;
  };
  const err = (m: string): void => {
    const p = host.querySelector<HTMLElement>('[data-err]');
    if (p) {
      p.textContent = m;
      p.hidden = false;
    }
  };

  shell(chooseView());

  host.addEventListener('click', (e) => {
    // A click on the backdrop — anywhere outside the box — dismisses the gate and leaves you a guest.
    if ((e.target as HTMLElement).classList.contains('pg-backdrop')) {
      if (!current()) continueAsGuest();
      return close();
    }
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'back') return shell(chooseView());
    if (act === 'signin') return shell(signInView());
    if (act === 'new') return shell(newView());
    if (act === 'guest') {
      continueAsGuest();
      return close();
    }
    if (act === 'copy') {
      void navigator.clipboard?.writeText(host.querySelector('[data-code]')?.textContent ?? '');
      return;
    }
    if (act === 'greet') {
      // Straight to the greeting if the app offers one; otherwise this IS the end.
      return greetUrl ? shell(greetView()) : close();
    }
    if (act === 'done') return close();

    if (act === 'create') {
      const name = host.querySelector<HTMLInputElement>('#pg-user')!.value;
      void (async () => {
        try {
          const { username, code } = await signUp(name);
          shell(codeView(username, code));
        } catch (e2) {
          err(e2 instanceof Error ? e2.message : 'could not create the account');
        }
      })();
      return;
    }

    if (act === 'go') {
      const name = host.querySelector<HTMLInputElement>('#pg-user')!.value;
      const code = host.querySelector<HTMLInputElement>('#pg-code')!.value;
      void (async () => {
        try {
          await signIn(name, code);
          close();
        } catch (e2) {
          err(e2 instanceof Error ? e2.message : 'could not sign in');
        }
      })();
      return;
    }

    if (act === 'send') {
      const who = host.querySelector<HTMLInputElement>('#pg-who')!.value.trim();
      const company = host.querySelector<HTMLInputElement>('#pg-co')!.value.trim();
      // Fire-and-forget, and closing does not wait on it. A greeting that fails is not the visitor's
      // problem, and it must never stand between them and the thing they came for.
      if (who || company) {
        void fetch(greetUrl!, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ who, company, referrer: document.referrer }),
        }).catch(() => {});
      }
      close();
    }
  });
}

/* ── The account FAB ──────────────────────────────────────────────────────────────────────────── */

export interface FabOptions {
  /** If there is no identity yet, silently establish a GUEST one (no blocking gate) and mark the FAB
   *  with a one-time red nudge inviting the visitor to make a real account. The home page uses this:
   *  it has no gated routes, so a sign-in wall on arrival would be friction with nothing behind it. */
  nudgeGuest?: boolean;
  /** What the guest panel's "Create an account" does. Given → called (the home page opens the full
   *  gate here). Absent → the legacy sign-out-and-reload, which brings the blocking gate back. */
  onUpgrade?: () => void;
}

// Whether the guest has acknowledged the nudge. Persisted, so the red alert does not reappear on
// every reload once they have opened the FAB (or signed in).
const NUDGE_SEEN = 'platform:fab-nudge-seen';
const nudgeSeen = (): boolean => {
  try {
    return localStorage.getItem(NUDGE_SEEN) === '1';
  } catch {
    return false;
  }
};
const markNudgeSeen = (): void => {
  try {
    localStorage.setItem(NUDGE_SEEN, '1');
  } catch {
    /* private mode: it will simply nudge again next time */
  }
};

/**
 * Top-right. Shows who you are, lets you see the code again, and lets you sign out.
 *
 * The code is hidden behind a reveal rather than printed. Not because revealing it is dangerous —
 * anyone at this keyboard already has the session — but because people screen-share, and a
 * credential sitting permanently in the corner of a demo is a credential that leaves the room.
 *
 * With `nudgeGuest`, this also replaces the arrival gate: a first visitor is defaulted to guest and
 * the FAB wears a red alert until they open it (seeing the disclaimer) or sign in.
 */
export function mountAccountFab(opts: FabOptions = {}): void {
  // No blocking gate on arrival: a first visitor becomes a guest right here, so the page is usable
  // immediately and the nudge below — not a modal — is what invites them to upgrade.
  if (opts.nudgeGuest && !current()) continueAsGuest();

  const host = document.createElement('div');
  host.className = 'pg-fab-host';
  document.body.appendChild(host);

  let open = false;
  let revealed = false;

  const render = (): void => {
    const id = current();
    if (!id) {
      host.innerHTML = '';
      return;
    }

    const label = id.mode === 'guest' ? 'Guest' : esc(id.username ?? '');
    const badge = isAdmin() ? '<span class="pg-badge">admin</span>' : '';
    // The nudge: a guest who has not opened the FAB yet wears a red alert, until they open it (which
    // shows them the disclaimer) or sign in. Home-page only, via nudgeGuest.
    const alerting = Boolean(opts.nudgeGuest) && id.mode === 'guest' && !nudgeSeen();

    const panel = id.mode === 'guest'
      ? `<p class="pg-fab-warn">You are browsing as a guest. Nothing is saved to an account — quiz
           progress would stay in this browser only, and clearing site data ends it.</p>
         <button class="pg-btn primary full" data-act="upgrade">Create an account</button>`
      : `<div class="pg-fab-row"><span>Username</span><code>${esc(id.username ?? '')}</code></div>
         <div class="pg-fab-row">
           <span>Code</span>
           ${
             revealed
               ? `<code class="pg-fab-code">${esc(id.code ?? '—')}</code>`
               : `<button class="pg-link" data-act="reveal">Show</button>`
           }
         </div>
         <p class="pg-fab-note">The code is the only way back into this account. There is no reset.</p>
         <button class="pg-btn ghost full" data-act="signout">Sign out</button>`;

    host.innerHTML = `
      <button class="pg-fab${alerting ? ' has-alert' : ''}" data-act="toggle" aria-expanded="${open}">
        <span class="pg-fab-dot ${id.mode}"></span>${label}${badge}
        ${alerting ? '<span class="pg-fab-alert" aria-hidden="true"></span>' : ''}
      </button>
      ${open ? `<div class="pg-fab-panel">${panel}</div>` : ''}`;
  };

  host.addEventListener('click', (e) => {
    // Stop the click reaching the document-level close handler below. Without this, opening the
    // panel and closing it are the SAME click: the toggle handler rebuilds host.innerHTML, which
    // detaches the very button that was clicked, so by the time the document handler runs
    // `host.contains(e.target)` is false — the click reads as "outside" and shuts the panel it just
    // opened. The result is a FAB you can never open, and therefore a sign-out you can never reach.
    e.stopPropagation();
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'toggle') {
      markNudgeSeen(); // clicking the FAB IS acknowledging the disclaimer — clear the red alert
      // A guest's FAB opens the account dialog DIRECTLY — the three-option chooser, no intermediate
      // "Create an account" bubble in between. A signed-in user gets the account panel (username /
      // code / sign out) as a dropdown instead.
      if (current()?.mode === 'guest' && opts.onUpgrade) {
        opts.onUpgrade();
        return render();
      }
      open = !open;
      revealed = false; // never leave a code on screen across an open/close
      return render();
    }
    if (act === 'reveal') {
      revealed = true;
      return render();
    }
    if (act === 'upgrade') {
      // Open the full gate rather than signing out. onUpgrade is what the home page passes; the
      // identity listener below re-renders the FAB when the gate completes.
      markNudgeSeen();
      open = false;
      if (opts.onUpgrade) {
        opts.onUpgrade();
        return render();
      }
      signOut();
      location.reload();
      return;
    }
    if (act === 'signout') {
      // Sign out clears the identity but NOT the local document — see auth.ts. The gate then
      // reappears on the next load, which is how you sign up again or hand the browser to someone.
      signOut();
      location.reload();
    }
  });

  document.addEventListener('click', (e) => {
    if (open && !host.contains(e.target as Node)) {
      open = false;
      render();
    }
  });

  // Re-render on any identity change — a sign-in from the gate, a sign-out from anywhere — so the FAB
  // and its nudge never show a stale state.
  onIdentity(() => render());
  render();
  void isSignedIn;
}
