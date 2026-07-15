// Shared platform layers first, this app's stylesheet last — so anything here can override them.
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import '@platform/ui/gate.css';
import './styles.css';

import { mountAccountFab, mountGate } from '@platform/ui/gate';
import { architectureToggle } from './architecture.js';
import { loadConfig, refreshLiveness } from './liveness.js';
import { paintVersions } from './versions.js';
import { pageHtml } from './view.js';

/**
 * Put the page on the screen and start it running.
 *
 * Everything above this is a module that does one job: `view` builds HTML from data, `liveness` asks
 * the gateway what is up, `greet` handles the first-visit dialog, `util`/`icons`/`diagrams` are
 * plumbing and assets. This file is the only place that knows the order they go in.
 */
export function mount(): void {
  document.getElementById('app')!.innerHTML = pageHtml();
  // After pageHtml, because it binds to the button that markup just created.
  architectureToggle();

  // Wheel over the featured banner scrolls it horizontally — the same gesture the quiz's shop rows
  // use. A vertical wheel on a horizontal-scroll strip is otherwise dead, or worse, scrolls the page
  // out from under the thing you are trying to pan. Only when there is actually overflow to pan.
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

  // What every component is actually running. Fetched ONCE — no timer, unlike liveness below: a
  // version cannot change without a new image, and a new image means new pods, so the only thing that
  // can change it is a deploy the visitor has to reload the page to see anyway.
  void paintVersions();

  // Identity, shared with every other front end — the gate, the account FAB and sign-out all live in
  // @platform/ui so the three apps cannot grow three different opinions about what signing out means.
  //
  // The home page has no gated routes, so a blocking sign-in wall on arrival would be pure friction —
  // and a modal that greets a visitor with "pick an account" scares more people off than it converts.
  // So a first visitor is defaulted to guest (silently, inside mountAccountFab) and the account FAB
  // wears a one-time red nudge inviting them to create a real account — which is what benefits the
  // quiz. The FAB opens straight onto the gate's three-option chooser (create / I have a code /
  // continue as guest); creating an account ends on the optional "who stopped by?" greeting, which is
  // relayed to a private Discord webhook (POST /api/hello) — home-page only, since that is where the
  // webhook lives.
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
