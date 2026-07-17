import { type JWK, type KeyLike, SignJWT, calculateJwkThumbprint, exportJWK, importPKCS8 } from 'jose';
import { env } from './env.js';

/**
 * RS256, with a public JWKS endpoint — not a shared HS256 secret. With a symmetric secret, every
 * service that can VERIFY a token can also FORGE one, so every verifier would hold a key that mints
 * identities and compromising any one compromises every user. With RS256 this service alone holds the
 * private key; everyone else fetches the public half and can only check a token is genuine.
 */

let cached: { key: KeyLike; kid: string; jwk: JWK } | null = null;

async function signingKey(): Promise<{ key: KeyLike; kid: string; jwk: JWK }> {
  if (cached) return cached;

  const key = await importPKCS8(env.signingKeyPem, 'RS256');

  // The `kid` is the key's own thumbprint, not a chosen name: derived from the key material, so two
  // keys can't collide on an id and a rotated key is self-identifying to a verifier holding both.
  const pub = await exportJWK(key);
  const kid = await calculateJwkThumbprint(pub, 'sha256');

  cached = {
    key,
    kid,
    jwk: { ...pub, kid, alg: 'RS256', use: 'sig' },
  };
  return cached;
}

/** The public half, for /.well-known/jwks.json. Never includes `d` — exportJWK on a private key
 *  would, so this exports from the key object rather than passing the private JWK through. */
export async function jwks(): Promise<{ keys: JWK[] }> {
  const { jwk } = await signingKey();
  // Belt and braces: strip every private field, in case a future refactor changes how `jwk` is
  // derived. Publishing `d` would hand out the ability to mint tokens as anyone.
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = jwk;
  return { keys: [pub] };
}

export interface Claims {
  sub: string;
  username: string;
}

/**
 * Mint an access token. It carries `sub` (opaque identity) and `username` (safe to display), NEVER the
 * credential — a JWT is base64, not encryption, so every claim is readable by anyone holding the token.
 */
export async function mint({ sub, username }: Claims): Promise<{ token: string; expiresIn: number }> {
  const { key, kid } = await signingKey();
  const ttl = env.tokenTtlSeconds;

  /**
   * THE ROLE COMES FROM THE ISSUER, NOT THE CALLER. Computed here at minting time from a list only this
   * service can read, then SIGNED — a client can't ask to be admin, edit the claim, or forge one,
   * having no key. The alternative (each verifier checking the admin list itself) would put the list
   * everywhere, so it wouldn't be secret; putting it in the token lets the gateway enforce a policy it
   * isn't allowed to read.
   */
  const admin = env.isAdmin(username);

  const token = await new SignJWT({ username, admin })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(env.issuer)
    .setAudience(env.audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setJti(crypto.randomUUID())
    .sign(key);

  return { token, expiresIn: ttl };
}
