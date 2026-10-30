import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

// Neon Auth for the production branch. It's a public address, not a secret.
const AUTH_URL =
  import.meta.env.VITE_NEON_AUTH_URL || 'https://ep-rapid-unit-aru1y562.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';

export const authClient = createAuthClient(AUTH_URL, { adapter: BetterAuthReactAdapter() });

export function signInWithGoogle() {
  return authClient.signIn.social({ provider: 'google', callbackURL: location.origin + '/' + location.hash });
}

// Tokens last 15 minutes; reuse one for up to 10.
let cached: { token: string; at: number } | null = null;
export async function getToken(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.token;
  try {
    const { data } = await authClient.token();
    cached = data?.token ? { token: data.token, at: Date.now() } : null;
  } catch {
    cached = null;
  }
  return cached?.token ?? null;
}

export async function signOut() {
  cached = null;
  await authClient.signOut();
}
