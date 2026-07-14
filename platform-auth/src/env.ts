import { z } from 'zod';

/**
 * Every value resolved and validated once, at import. A missing signing key or pepper is a fatal
 * misconfiguration, and it should stop the process at boot with a message naming the variable —
 * not surface later as a 500 on somebody's first sign-in.
 */
const Schema = z.object({
  PORT: z.coerce.number().default(8002),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** RSA private key, PKCS#8 PEM. Generated once by `npm run keygen`, then sealed. */
  AUTH_SIGNING_KEY: z.string().min(1, 'AUTH_SIGNING_KEY is required (PKCS#8 PEM)'),

  /**
   * The HMAC key that codes are hashed under. Without it a stolen database dump would be
   * enumerable offline — 34 billion candidates is minutes of work. It is the only thing standing
   * between a dump and every user's credential, and it must NEVER be stored alongside the data it
   * protects.
   */
  AUTH_CODE_PEPPER: z.string().min(32, 'AUTH_CODE_PEPPER must be at least 32 chars'),

  /**
   * The elevated users, as a comma-separated list of usernames. A SECRET, not config — not because
   * the names are hard to guess (they are printed on a dashboard), but because the list is a policy
   * decision and policy belongs with the thing that enforces it. Changing who is an admin should
   * require the same ceremony as changing a signing key, not a ConfigMap edit anyone can make.
   */
  AUTH_ADMINS: z.string().default(''),

  AUTH_ISSUER: z.string().default('https://api-andres.project-platform.me/auth'),
  AUTH_AUDIENCE: z.string().default('platform'),
  AUTH_TOKEN_TTL: z.coerce.number().default(86400), // 24h

  /** Token attempts allowed per IP per window. The code's ONLY defence — see DESIGN.md §4. */
  AUTH_RATE_MAX: z.coerce.number().default(10),
  AUTH_RATE_WINDOW: z.coerce.number().default(300), // seconds
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`platform-auth: bad configuration\n${issues}`);
}
const e = parsed.data;

/** Lowercased and de-duplicated once, at boot. Usernames are stored lowercase, so an entry that
 *  differs only in case would silently never match — a quiet way to lose your own admin rights. */
const admins = new Set(
  e.AUTH_ADMINS.split(',')
    .map((s2) => s2.trim().toLowerCase())
    .filter(Boolean),
);

export const env = {
  port: e.PORT,
  /** Is this username elevated? Asked ONLY by the token minter — never by a request handler, and
   *  never on the basis of anything the caller said about themselves. */
  isAdmin: (username: string): boolean => admins.has(username.toLowerCase()),
  adminCount: admins.size,
  databaseUrl: e.DATABASE_URL,
  // The PEM arrives from a Kubernetes secret, where newlines are commonly \n-escaped.
  signingKeyPem: e.AUTH_SIGNING_KEY.replace(/\\n/g, '\n'),
  codePepper: e.AUTH_CODE_PEPPER,
  issuer: e.AUTH_ISSUER,
  audience: e.AUTH_AUDIENCE,
  tokenTtlSeconds: e.AUTH_TOKEN_TTL,
  rateMax: e.AUTH_RATE_MAX,
  rateWindowSeconds: e.AUTH_RATE_WINDOW,
} as const;
