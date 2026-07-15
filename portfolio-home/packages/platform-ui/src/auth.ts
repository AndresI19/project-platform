// Platform identity, for every front end.
//
// It lives HERE, in the shared package, and not in each app. The alternative is the home page and the
// quiz each growing their own copy of a token store, a gate and a sign-out button — and then drifting,
// which is the precise failure this package exists to prevent. It already happened once with the
// content column. Identity is a far worse thing to have two opinions about.
//
// Three states, and the third is not a degraded version of the others:
//
//   unchosen  — first visit. The gate asks.
//   guest     — no identity, no server, no row. Everything stays in the browser, and we SAY SO.
//   signed in — username + password, exchanged for a signed token.

const KEY = 'platform:identity';
const AUTH = '/auth';

export interface Identity {
  mode: 'guest' | 'user';
  username?: string;
  /**
   * The password lives in localStorage, and it is worth being straight about why.
   *
   * The token expires in 24 hours. Without the password stored, the user re-types it every single
   * day — a tax steep enough that people simply stop signing in. With it stored, re-minting is silent.
   *
   * The honest accounting: anything that can read localStorage can already read the TOKEN and act as
   * the user until it expires. Storing the password extends that from a day to indefinitely, and —
   * unlike the token — a password may be reused elsewhere, so this is a worse thing to leave lying
   * around than the old random code was. On a platform whose worst case is a lost flashcard garden it
   * is still the right trade, and it is the reason the sign-up copy tells people not to reuse a
   * password here. Nothing sensitive is ever stored behind this identity, which is what makes the
   * trade acceptable at all.
   */
  password?: string;
  token?: string;
  expiresAt?: number;
  /** Elevated. Read from the SIGNED token, never set by the client — see isAdmin(). */
  admin?: boolean;
  /** Quiz progress optimistic-concurrency version. Meaningless to other apps; harmless to carry. */
  version?: number;
}

let identity: Identity | null = read();
const listeners: Array<(id: Identity | null) => void> = [];

function read(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function setIdentity(id: Identity | null): void {
  identity = id;
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify(id));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session works, it just will not be remembered */
  }
  for (const fn of listeners) fn(identity);
}

export function onIdentity(fn: (id: Identity | null) => void): void {
  listeners.push(fn);
}

export const current = (): Identity | null => identity;
export const isGuest = (): boolean => identity?.mode === 'guest';
export const isSignedIn = (): boolean => identity?.mode === 'user' && Boolean(identity.token);

/**
 * Is this an admin?
 *
 * Read from the token that the AUTH SERVICE signed, from a list only that service can see. A client
 * cannot ask to be an admin and cannot edit the claim — and this function being client-side does not
 * weaken that, because it is used only to decide what to SHOW. Every privileged action is checked
 * again, server-side, against the same signed claim. Hiding a button is a courtesy; the lock is on
 * the door, not on the sign.
 */
export const isAdmin = (): boolean => identity?.mode === 'user' && identity.admin === true;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${AUTH}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${r.status}`);
  return json as T;
}

/** Read the claims out of a token we already hold. Decoding, NOT verifying — a client cannot verify
 *  anything meaningfully, and does not need to: it is deciding what to render, not what to permit. */
function claims(token: string): Record<string, unknown> {
  try {
    const seg = token.split('.')[1] ?? '';
    return JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function adopt(res: { username: string; token: string; expiresIn: number }, password: string): void {
  setIdentity({
    mode: 'user',
    username: res.username,
    password,
    token: res.token,
    expiresAt: Date.now() + res.expiresIn * 1000,
    admin: claims(res.token).admin === true,
    version: identity?.version,
  });
}

export async function checkUsername(username: string): Promise<{ valid: boolean; available: boolean }> {
  const r = await fetch(`${AUTH}/usernames/${encodeURIComponent(username)}`);
  return (await r.json()) as { valid: boolean; available: boolean };
}

/** Sign up with a chosen password. On success the identity is signed in immediately — there is no
 *  code to hand back and nothing to write down. */
export async function signUp(username: string, password: string): Promise<{ username: string }> {
  const res = await post<{ username: string; token: string; expiresIn: number }>('/identities', {
    username,
    password,
  });
  adopt(res, password);
  return { username: res.username };
}

export async function signIn(username: string, password: string): Promise<void> {
  const res = await post<{ username: string; token: string; expiresIn: number }>('/token', {
    username,
    password,
  });
  adopt(res, password);
}

export function continueAsGuest(): void {
  setIdentity({ mode: 'guest' });
}

/**
 * Sign out.
 *
 * Deliberately does NOT wipe the local document. Signing out means "stop syncing", not "destroy my
 * garden" — and a control that silently deleted a year of play would be a cruel thing to sit next to
 * one that does not. The gate reappears on the next load, which is the point: it is how you sign up
 * again, or hand the browser to somebody else.
 */
export function signOut(): void {
  setIdentity(null);
}

/** A live token, re-minted silently when it is close to expiry. The stored password is what allows this. */
export async function token(): Promise<string | null> {
  if (!identity || identity.mode !== 'user') return null;
  if (identity.token && (identity.expiresAt ?? 0) > Date.now() + 60_000) return identity.token;
  if (!identity.username || !identity.password) return null;
  try {
    await signIn(identity.username, identity.password);
    return identity.token ?? null;
  } catch {
    return null;
  }
}

/** fetch(), with a fresh bearer attached. Returns null rather than throwing when there is no identity. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response | null> {
  const t = await token();
  if (!t) return null;
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${t}`);
  return fetch(input, { ...init, headers });
}
