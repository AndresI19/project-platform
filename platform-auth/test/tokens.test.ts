import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// The signing key has to exist before env.ts is imported — it validates at module load, on purpose,
// so a misconfigured deploy dies at boot instead of on somebody's first sign-in.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.AUTH_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.AUTH_CODE_PEPPER = "p".repeat(32);
process.env.DATABASE_URL = "postgres://unused";

const { mint } = await import("../src/tokens.js");
const { jwks } = await import("../src/tokens.js");
const { createLocalJWKSet, jwtVerify, decodeJwt } = await import("jose");

describe("tokens", () => {
  let token: string;
  beforeAll(async () => {
    ({ token } = await mint({ sub: "0b7f0000-0000-4000-8000-000000000000", username: "andres" }));
  });

  it("verifies against the published public key", async () => {
    const set = createLocalJWKSet(await jwks());
    const { payload } = await jwtVerify(token, set, {
      issuer: "https://api-andres.project-platform.me/auth",
      audience: "platform",
    });
    expect(payload.sub).toBe("0b7f0000-0000-4000-8000-000000000000");
    expect(payload.username).toBe("andres");
  });

  it("NEVER carries the code", () => {
    // A JWT is base64, not encryption: every claim is readable by anyone holding the token. Putting
    // the credential inside the thing the credential buys you would defeat the whole scheme.
    const claims = decodeJwt(token);
    expect(JSON.stringify(claims)).not.toMatch(/code/i);
    expect(Object.keys(claims)).toEqual(
      expect.arrayContaining(["sub", "username", "iss", "aud", "exp", "iat", "jti"]),
    );
  });

  it("publishes a public key and NOT a private one", async () => {
    const set = await jwks();
    const key = set.keys[0] as Record<string, unknown>;
    expect(key.kty).toBe("RSA");
    expect(key.n).toBeDefined(); // public modulus
    // If any of these ever appear, anyone can mint tokens as anyone.
    for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(key[secret]).toBeUndefined();
    }
  });

  it("rejects a token signed by somebody else's key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { SignJWT, importPKCS8 } = await import("jose");
    const forged = await new SignJWT({ username: "evil" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://api-andres.project-platform.me/auth")
      .setAudience("platform")
      .setSubject("0b7f0000-0000-4000-8000-000000000000")
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(await importPKCS8(other.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "RS256"));

    const set = createLocalJWKSet(await jwks());
    await expect(jwtVerify(forged, set)).rejects.toThrow();
  });
});
