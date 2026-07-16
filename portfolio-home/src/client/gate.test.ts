import { beforeEach, describe, expect, test, vi } from 'vitest';

// The gate reads identity from ./auth; replace it so the test drives sign-in without a network or
// storage, and starts with nobody signed in.
vi.mock('../../packages/platform-ui/src/auth.js', () => ({
  continueAsGuest: vi.fn(),
  current: vi.fn(() => null),
  isAdmin: vi.fn(() => false),
  isSignedIn: vi.fn(() => false),
  onIdentity: vi.fn(),
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(),
  signUp: vi.fn(async () => {}),
}));

import { signUp } from '../../packages/platform-ui/src/auth.js';
import { mountGate } from '../../packages/platform-ui/src/gate.js';

const signUpMock = signUp as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

/** Enter arriving from inside the gate: dispatched on an element in the gate so it bubbles the same
 *  document → window path a real keypress takes. */
function pressEnter(target: EventTarget): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('gate Enter handling', () => {
  test('Enter on the create form submits it and never reaches a host window listener', async () => {
    // Stand-in for the quiz's window-level "Enter → start()", the listener that used to hijack Enter.
    const hostStart = vi.fn();
    window.addEventListener('keydown', hostStart);

    mountGate({ onDone: () => {} });
    document.querySelector<HTMLElement>('[data-act="new"]')!.click(); // open the create view
    document.querySelector<HTMLInputElement>('#pg-user')!.value = 'neo';
    const pass = document.querySelector<HTMLInputElement>('#pg-pass')!;
    pass.value = 'trinity99';

    pressEnter(pass);
    await Promise.resolve(); // flush the async submit handler

    expect(signUpMock).toHaveBeenCalledWith('neo', 'trinity99'); // Enter proceeded with creation…
    expect(hostStart).not.toHaveBeenCalled(); // …and stopPropagation kept it from the host app

    window.removeEventListener('keydown', hostStart);
  });

  test('Enter is swallowed on the chooser even though it has no primary action', () => {
    const hostStart = vi.fn();
    window.addEventListener('keydown', hostStart);

    mountGate({ onDone: () => {} }); // chooser view has doors, no `.pg-btn.primary`
    pressEnter(document.body);

    expect(hostStart).not.toHaveBeenCalled(); // still swallowed, so it cannot leak to the quiz

    window.removeEventListener('keydown', hostStart);
  });
});
