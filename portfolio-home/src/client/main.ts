// Shared platform layers first, this app's stylesheet last — so anything here can override them.
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import '@platform/ui/gate.css';
import './styles.css';

import { mountAccountFab, mountGate } from '@platform/ui/gate';
import { architectureToggle } from './architecture.js';
import { loadConfig, refreshLiveness } from './liveness.js';
import { pageHtml } from './view.js';

// Injected at build time from package.json — see vite.config.ts.
declare const __APP_VERSION__: string;

/**
 * Put the page on the screen and start it running.
 *
 * Everything above this is a module that does one job: `view` builds HTML from data, `liveness` asks
 * the gateway what is up, `greet` handles the first-visit dialog, `util`/`icons`/`diagrams` are
 * plumbing and assets. This file is the only place that knows the order they go in.
 */
export function mount(): void {
  document.getElementById('app')!.innerHTML = pageHtml(__APP_VERSION__);
  // After pageHtml, because it binds to the button that markup just created.
  architectureToggle();

  // Identity, shared with every other front end — the gate, the account FAB and sign-out all live in
  // @platform/ui so the three apps cannot grow three different opinions about what signing out means.
  //
  // The home page has no gated routes, so a blocking sign-in wall on arrival would be pure friction —
  // and a modal that greets a visitor with "pick an account" scares more people off than it converts.
  // So a first visitor is defaulted to guest (silently, inside mountAccountFab) and the account FAB
  // wears a one-time red nudge inviting them to create a real account — which is what benefits the
  // quiz. Choosing to create one opens the full gate straight on its username page.
  mountAccountFab({
    nudgeGuest: true,
    onUpgrade: () => mountGate({ greetUrl: '/api/hello', onDone: () => {}, initial: 'new' }),
  });

  // The config tells the probes which origin to ask, so it has to land before the first poll.
  void loadConfig().then(() => {
    void refreshLiveness();
    setInterval(refreshLiveness, 60_000); // poll liveliness every minute
  });
}

mount();
