import { z } from 'zod';

/**
 * Every value resolved and validated once, at import. A missing signing key or pepper is fatal and
 * should stop the process at boot naming the variable, not surface as a 500 on someone's first sign-in.
 */
const Schema = z.object({
  PORT: z.coerce.number().default(8002),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** RSA private key, PKCS#8 PEM. Generated once by `npm run keygen`, then sealed. */
  AUTH_SIGNING_KEY: z.string().min(1, 'AUTH_SIGNING_KEY is required (PKCS#8 PEM)'),

  /**
   * The pepper folded into every password hash. The per-row salt defends users from each other; the
   * pepper defends all from a dump — a stolen database (salts and all) can't be dictionary-attacked
   * without a secret that never lives beside the data. Kept under its original name so existing sealed
   * secrets and deploys keep working.
   */
  AUTH_CODE_PEPPER: z.string().min(32, 'AUTH_CODE_PEPPER must be at least 32 chars'),

  /**
   * The elevated users, comma-separated usernames. A SECRET, not config — not because the names are
   * secret (they're on a dashboard) but because the list is a policy decision, and changing who is an
   * admin should take the same ceremony as changing a signing key, not a ConfigMap edit.
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
