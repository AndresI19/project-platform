import { SignJWT, exportJWK, importPKCS8, calculateJwkThumbprint, type JWK, type KeyLike } from "jose";
import { env } from "./env.js";

/**
 * RS256, with a public JWKS endpoint — not a shared HS256 secret.
 *
 * The distinction is the whole point. With a symmetric secret, every service that can VERIFY a token
 * can also FORGE one, so the gateway, the quiz API and anything else added later would each hold a
 * key that mints identities. Compromise any one of them and you have compromised every user on the
 * platform.
 *
 * With RS256 this service alone holds the private key. Everyone else fetches the public half and can
 * do exactly one thing with it: check that a token is genuine.
 */

let cached: { key: KeyLike; kid: string; jwk: JWK } | null = null;

async function signingKey(): Promise<{ key: KeyLike; kid: string; jwk: JWK }> {
  if (cached) return cached;

  const key = await importPKCS8(env.signingKeyPem, "RS256");

  // The `kid` is the key's own thumbprint rather than a name we chose. That means it is derived from
  // the key material itself, so two keys can never collide on an id and a rotated key is
  // self-identifying — a verifier holding both can always tell which one signed a given token.
  const pub = await exportJWK(key);
  const kid = await calculateJwkThumbprint(pub, "sha256");

  cached = {
    key,
    kid,
    jwk: { ...pub, kid, alg: "RS256", use: "sig" },
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
 * Mint an access token.
 *
 * It carries `sub` (the opaque identity) and `username` (safe to display). It NEVER carries the code —
 * a JWT is base64, not encryption, so every claim in it is readable by anyone who holds the token.
 * Putting the credential inside the thing the credential buys you would defeat the entire scheme.
 */
export async function mint({ sub, username }: Claims): Promise<{ token: string; expiresIn: number }> {
  const { key, kid } = await signingKey();
  const ttl = env.tokenTtlSeconds;

  /**
   * THE ROLE COMES FROM THE ISSUER, NOT FROM THE CALLER.
   *
   * It is computed here, at minting time, from a list only this service can read — and then it is
   * SIGNED. A client cannot ask to be an admin, cannot edit the claim, and cannot forge a token that
   * says it is one, because it does not hold the key.
   *
   * The alternative — a service checking "is this username in the admin list?" for itself — would
   * mean every verifier needed the list, which is to say the list would be everywhere, which is to
   * say it would not be a secret. Putting it in the token means the gateway can enforce a policy it
   * is not allowed to read.
   */
  const admin = env.isAdmin(username);

  const token = await new SignJWT({ username, admin })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(env.issuer)
    .setAudience(env.audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setJti(crypto.randomUUID())
    .sign(key);

  return { token, expiresIn: ttl };
}
