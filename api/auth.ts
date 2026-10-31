// Sign-in requests go through the app's own address (/api/auth/*) instead of straight to Neon Auth.
// That way the "signed in" cookie belongs to this site. Browsers (Safari and home-screen apps above all)
// throw away cookies from other sites, which made everyone sign in again on every launch.
// This mirrors the proxy in @neondatabase/auth's Next.js helper.

const AUTH_BASE =
  process.env.NEON_AUTH_BASE_URL || 'https://ep-rapid-unit-aru1y562.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';

const COOKIE_PREFIX = '__Secure-neon-auth';
const FORWARD_HEADERS = ['user-agent', 'authorization', 'referer', 'content-type', 'x-neon-client-info'];
const RETURN_HEADERS = ['content-type', 'date', 'set-auth-jwt', 'set-auth-token', 'x-neon-ret-request-id'];

/** Only Neon Auth's own cookies go upstream. */
function authCookies(header: string | null) {
  return (header || '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(COOKIE_PREFIX))
    .join('; ');
}

/** Re-issue an upstream cookie as this site's own: no Domain, not partitioned, SameSite=Lax. */
function ownCookie(setCookie: string) {
  const [pair, ...attrs] = setCookie.split(';').map((s) => s.trim());
  const keep = attrs.filter((a) => !/^(domain|samesite|partitioned|secure)\b/i.test(a));
  return [pair, ...keep, 'Secure', 'SameSite=Lax'].join('; ');
}

async function handle(req: Request) {
  const url = new URL(req.url);
  // vercel.json rewrites /api/auth/<path> to /api/auth?__path=<path>
  const path = url.searchParams.get('__path') || url.pathname.replace(/^\/api\/auth\/?/, '');
  url.searchParams.delete('__path');
  if (!/^[\w\-./]+$/.test(path) || path.includes('..')) return new Response('Not found', { status: 404 });

  const upstream = new URL(`${AUTH_BASE}/${path}`);
  upstream.search = url.search;

  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('origin', req.headers.get('origin') || url.origin);
  const cookie = authCookies(req.headers.get('cookie'));
  if (cookie) headers.set('cookie', cookie);
  headers.set('x-neon-auth-middleware', 'true');

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
      redirect: 'manual',
    });
  } catch {
    return Response.json({ error: 'Sign-in service unreachable' }, { status: 502 });
  }

  const out = new Headers({ 'cache-control': 'no-store' });
  for (const h of RETURN_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  const location = res.headers.get('location');
  if (location) out.set('location', location);
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', ownCookie(c));

  return new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: out });
}

export const GET = handle;
export const POST = handle;
