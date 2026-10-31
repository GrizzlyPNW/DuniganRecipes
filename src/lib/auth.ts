import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

// Neon Auth for the production branch. It's a public address, not a secret.
const NEON_AUTH_URL =
  import.meta.env.VITE_NEON_AUTH_URL || 'https://ep-rapid-unit-aru1y562.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';

// On the live site, sign-in goes through our own /api/auth (api/auth.ts) so the session cookie
// belongs to this site and survives closing the app. The Vite dev server has no /api, so it talks to Neon directly.
const isDevServer = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const AUTH_URL = isDevServer ? NEON_AUTH_URL : location.origin + '/api/auth';

export const authClient = createAuthClient(AUTH_URL, { adapter: BetterAuthReactAdapter() });

export function signInWithGoogle() {
  return authClient.signIn.social({ provider: 'google', callbackURL: location.origin + '/' + location.hash });
}

const isJwt = (t: unknown): t is string => typeof t === 'string' && t.split('.').length === 3;

/** Seconds-since-epoch expiry from a JWT, or 0. */
function expiry(jwt: string) {
  try {
    return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0;
  } catch {
    return 0;
  }
}

// Tokens last 15 minutes; reuse one until a minute before it runs out.
let cached: string | null = null;
export async function getToken(): Promise<string | null> {
  if (cached && expiry(cached) * 1000 - Date.now() > 60_000) return cached;
  cached = null;
  try {
    // Neon's client puts the signed JWT on the session it returns.
    const { data } = await authClient.getSession();
    const t = (data?.session as { token?: string } | undefined)?.token;
    if (isJwt(t)) cached = t;
  } catch {
    /* fall through */
  }
  if (!cached) {
    try {
      const { data } = await authClient.token();
      if (isJwt(data?.token)) cached = data!.token;
    } catch {
      /* not signed in */
    }
  }
  return cached;
}

export async function signOut() {
  cached = null;
  await authClient.signOut();
}
