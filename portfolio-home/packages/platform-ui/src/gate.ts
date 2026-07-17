// The identity gate and the account FAB. Shared, so every front end asks the same question the same
// way and a sign-out means the same thing everywhere.

import {
  continueAsGuest,
  current,
  isAdmin,
  onIdentity,
  signIn,
  signOut,
  signUp,
  type Identity,
} from './auth.js';

// Hoisted, not rebuilt per match. Inline in the replacer, this five-key object was reallocated once
// per escaped CHARACTER — a fresh throwaway object for every character escaped on every render.
const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!);

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
        <span class="pg-door-d">Choose a username and a pin. Your progress follows you to any
          browser.</span>
      </button>
      <button class="pg-door" data-act="signin">
        <span class="pg-door-t">I have an account</span>
        <span class="pg-door-d">Sign back in with your username and pin.</span>
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

// Username is public; the pin is the secret. Asked for together because the pin is something the user
// brings (no second page handing anything back). The pin is stored in localStorage to keep sign-in
// silent (auth.ts), so reusing a real password here is a bad idea — the copy says so.
const newView = (): string => `
  <h2>Create an account</h2>
  <p class="pg-sub">The username is public — it appears on the dashboard and the leaderboard. The
    pin is yours.</p>
  <label class="pg-label" for="pg-user">Username</label>
  <input id="pg-user" class="pg-input" autocomplete="username" autocapitalize="off" spellcheck="false"
         placeholder="3–20 characters: a–z, 0–9, _ and -">
  <label class="pg-label" for="pg-pass">Create a pin</label>
  <input id="pg-pass" class="pg-input" type="password" autocomplete="new-password"
         placeholder="at least 4 characters">
  <p class="pg-note">A short pin is fine — but don't make it a password you use anywhere else. This
    identity holds only quiz progress, and it is not built to guard a real secret.</p>
  <p class="pg-err" data-err hidden></p>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="back">Back</button>
    <button class="pg-btn primary" data-act="create">Create</button>
  </div>`;

const signInView = (): string => `
  <h2>Sign in</h2>
  <label class="pg-label" for="pg-user">Username</label>
  <input id="pg-user" class="pg-input" autocomplete="username" autocapitalize="off" spellcheck="false">
  <label class="pg-label" for="pg-pass">Pin</label>
  <input id="pg-pass" class="pg-input" type="password" autocomplete="current-password">
  <p class="pg-err" data-err hidden></p>
  <div class="pg-actions">
    <button class="pg-btn ghost" data-act="back">Back</button>
    <button class="pg-btn primary" data-act="go">Sign in</button>
  </div>`;

/**
 * The greeting — an OPTIONAL second page of the gate, entirely skippable, that says where the answer
 * goes. What it collects is NOT persisted: it's relayed to a private Discord channel and nothing else,
 * stated on the page because a form asking for a LinkedIn URL silently hasn't earned the answer.
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

  // Escape dismisses the gate and leaves you a guest, like clicking outside. The listener is on
  // document (caught anywhere), so close() must remove it explicitly; the click listener dies with host.
  let onKey: (e: KeyboardEvent) => void = () => {};
  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    host.remove();
    onDone(current());
  };
  onKey = (e) => {
    if (e.key === 'Escape') {
      if (!current()) continueAsGuest();
      close();
      return;
    }
    if (e.key === 'Enter') {
      // The gate owns the screen, so Enter resolves HERE and never bubbles to the host app's window
      // keydown (the quiz reads bare Enter as "start", launching a quiz out from under this dialog).
      // Trigger the view's primary action (Create / Sign in / Send) via the click handler. The chooser
      // has no default, so Enter does nothing there, but is still swallowed so it can't leak.
      e.stopPropagation();
      const primary = host.querySelector<HTMLElement>('.pg-btn.primary[data-act]');
      if (primary) {
        e.preventDefault();
        primary.click();
      }
    }
  };
  document.addEventListener('keydown', onKey);
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
    if (act === 'done') return close();

    if (act === 'create') {
      const name = host.querySelector<HTMLInputElement>('#pg-user')!.value;
      const password = host.querySelector<HTMLInputElement>('#pg-pass')!.value;
      void (async () => {
        try {
          await signUp(name, password);
          // Signed in already — a chosen password means there is nothing to hand back and nothing to
          // write down. Straight to the optional greeting if the app offers one; otherwise this ends.
          if (greetUrl) shell(greetView());
          else close();
        } catch (e2) {
          err(e2 instanceof Error ? e2.message : 'could not create the account');
        }
      })();
      return;
    }

    if (act === 'go') {
      const name = host.querySelector<HTMLInputElement>('#pg-user')!.value;
      const password = host.querySelector<HTMLInputElement>('#pg-pass')!.value;
      void (async () => {
        try {
          await signIn(name, password);
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
   *  with a one-time red nudge to make a real account. The home page uses this — no gated routes, so a
   *  sign-in wall would be friction with nothing behind it. */
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
 * Top-right. Shows who you are and lets you sign out. It no longer reveals the credential — a pin is
 * something the user chose and knows, so printing it would only put a reusable secret on screen during
 * a screen-share. With `nudgeGuest`, this also replaces the arrival gate: a first visitor defaults to
 * guest and the FAB wears a red alert until they open it (seeing the disclaimer) or sign in.
 */
export function mountAccountFab(opts: FabOptions = {}): void {
  // No blocking gate on arrival: a first visitor becomes a guest right here, so the page is usable
  // immediately and the nudge below — not a modal — is what invites them to upgrade.
  if (opts.nudgeGuest && !current()) continueAsGuest();

  const host = document.createElement('div');
  host.className = 'pg-fab-host';
  document.body.appendChild(host);

  let open = false;

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
         <p class="pg-fab-note">Your pin is the only way back into this account — there is no
           reset. You chose it, so keep it somewhere safe.</p>
         <button class="pg-btn ghost full" data-act="signout">Sign out</button>`;

    host.innerHTML = `
      <button class="pg-fab${alerting ? ' has-alert' : ''}" data-act="toggle" aria-expanded="${open}">
        <span class="pg-fab-dot ${id.mode}"></span>${label}${badge}
        ${alerting ? '<span class="pg-fab-alert" aria-hidden="true"></span>' : ''}
      </button>
      ${open ? `<div class="pg-fab-panel">${panel}</div>` : ''}`;
  };

  host.addEventListener('click', (e) => {
    // Stop the click reaching the document-level close handler. Without this, open and close are the
    // SAME click: the toggle rebuilds host.innerHTML, detaching the clicked button, so the document
    // handler sees `host.contains(e.target)` false, reads "outside", and shuts the panel it just
    // opened — a FAB you can never open, and a sign-out you can never reach.
    e.stopPropagation();
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'toggle') {
      markNudgeSeen(); // clicking the FAB IS acknowledging the disclaimer — clear the red alert
      // A guest's FAB opens the account dialog DIRECTLY (the three-option chooser). A signed-in user
      // gets the account panel (username / sign out) as a dropdown instead.
      if (current()?.mode === 'guest' && opts.onUpgrade) {
        opts.onUpgrade();
        return render();
      }
      open = !open;
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
}
