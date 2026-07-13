/**
 * Generate the RSA signing keypair, once.
 *
 *   npx tsx scripts/keygen.ts
 *
 * Prints the PKCS#8 private key. Seal it (see the platform-orchestration wiki) and set it as
 * AUTH_SIGNING_KEY. The public half is never configured anywhere — it is DERIVED from the private
 * key and published at /.well-known/jwks.json, so there is exactly one thing to keep safe and
 * exactly one thing to rotate.
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.stdout.write(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
