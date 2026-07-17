// Platform identity, for every front end. It lives HERE, in the shared package, not in each app — the
// alternative is the home page and quiz each growing their own token store, gate and sign-out, then
// drifting, the failure this package exists to prevent. Three states, the third not a degraded one:
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
   * The password lives in localStorage. The token expires in 24h; without the password stored the user
   * re-types it daily, a tax steep enough that people stop signing in. With it, re-minting is silent.
   * The honest cost: anything that can read localStorage already reads the TOKEN, but storing the
   * password extends that from a day to indefinitely and — unlike the token — a password may be reused
   * elsewhere. On a platform whose worst case is a lost flashcard garden it's still the right trade,
   * and the reason the sign-up copy says not to reuse a password here.
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
 * Is this an admin? Read from the token the AUTH SERVICE signed, from a list only it can see. A client
 * can't ask to be admin or edit the claim, and this being client-side doesn't weaken that — it only
 * decides what to SHOW; every privileged action is re-checked server-side. The lock is on the door,
 * not the sign.
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
 * Sign out. Deliberately does NOT wipe the local document: signing out means "stop syncing", not
 * "destroy my garden". The gate reappears on the next load — how you sign up again or hand the browser
 * to someone else.
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
