// Shared platform layers first, this app's stylesheet last — so anything here can override them.
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import '@platform/ui/gate.css';
import './styles.css';

import { mountAccountFab, mountGate, needsGate } from '@platform/ui/gate';
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
  // The greeting used to be a dialog that ambushed you on arrival (greet.ts, now retired). It is an
  // OPTIONAL second page of the gate instead: asked once, after the account exists, and entirely
  // skippable. Same relay endpoint, same fire-and-forget, but now it says where the answer goes.
  if (needsGate()) {
    mountGate({ greetUrl: '/api/hello', onDone: () => mountAccountFab() });
  } else {
    mountAccountFab();
  }

  // The config tells the probes which origin to ask, so it has to land before the first poll.
  void loadConfig().then(() => {
    void refreshLiveness();
    setInterval(refreshLiveness, 60_000); // poll liveliness every minute
  });
}

mount();
