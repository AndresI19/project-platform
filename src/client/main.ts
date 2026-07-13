// Shared platform layers first, this app's stylesheet last — so anything here can override them.
import '@platform/ui/tokens.css';
import '@platform/ui/base.css';
import './styles.css';

import { greet } from './greet.js';
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
  greet();

  // The config tells the probes which origin to ask, so it has to land before the first poll.
  void loadConfig().then(() => {
    void refreshLiveness();
    setInterval(refreshLiveness, 60_000); // poll liveliness every minute
  });
}

mount();
