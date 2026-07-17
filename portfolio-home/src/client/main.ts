// Shared platform layers first, this app's stylesheet last — so anything here can override them.
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import '@platform/ui/gate.css';
import './styles.css';

import { mountAccountFab, mountGate } from '@platform/ui/gate';
import { architectureToggle } from './architecture-toggle.js';
import { featRail } from './feat-rail.js';
import { loadConfig, refreshLiveness } from './liveness.js';
import { paintVersions } from './versions.js';
import { pageHtml } from './view.js';

/**
 * Put the page on the screen and start it running. Each import above does one job; this file is the
 * only place that knows the order they go in.
 */
export function mount(): void {
  document.getElementById('app')!.innerHTML = pageHtml();
  // After pageHtml, because it binds to the button that markup just created.
  architectureToggle();
  // Same reason, and it must run after the cards exist: it measures them.
  featRail();

  // Wheel over the featured banner scrolls it horizontally (as the quiz's shop rows do). A vertical
  // wheel on a horizontal strip is otherwise dead, or scrolls the page out from under you. Only when
  // there's overflow to pan.
  document.querySelectorAll<HTMLElement>('.feat-banner').forEach((row) => {
    row.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY === 0 || row.scrollWidth <= row.clientWidth) return;
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      },
      { passive: false },
    );
  });

  // What every component is running. Fetched ONCE — no timer, unlike liveness: a version can't change
  // without a new image (hence new pods), a deploy the visitor must reload to see anyway.
  void paintVersions();

  // Identity, shared with every other front end — gate, account FAB and sign-out all live in
  // @platform/ui so the three apps can't grow three opinions about what signing out means. Home has no
  // gated routes, so a blocking sign-in wall would be pure friction: a first visitor is defaulted to
  // guest (silently, in mountAccountFab) and the FAB wears a one-time red nudge to create a real
  // account. The FAB opens the gate's three-option chooser (create / I have a code / guest); creating
  // one ends on the optional "who stopped by?" greeting, relayed to a private Discord webhook
  // (POST /api/hello) — home-page only, since that's where the webhook lives.
  mountAccountFab({
    nudgeGuest: true,
    onUpgrade: () => mountGate({ greetUrl: '/api/hello', onDone: () => {} }),
  });

  // The config tells the probes which origin to ask, so it has to land before the first poll.
  void loadConfig().then(() => {
    void refreshLiveness();
    setInterval(refreshLiveness, 60_000); // poll liveliness every minute
  });
}

mount();
