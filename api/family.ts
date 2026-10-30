// One Vercel function for everything shared: stories, recipe edits and card photo uploads.
// People sign in with Google (Neon Auth). A signed-in person becomes a family member once,
// by opening the invite link or typing the family code (FAMILY_CODE env var).
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { timingSafeEqual, randomUUID } from 'node:crypto';

type Sql = ReturnType<typeof neon>;
interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Set with `neon neon-auth user set-role <id> --roles admin`; read from neon_auth.user. */
  admin: boolean;
}

const AUTH_BASE =
  process.env.NEON_AUTH_BASE_URL || 'https://ep-rapid-unit-aru1y562.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
const JWKS = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL || AUTH_BASE + '/.well-known/jwks.json'));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function db(): Sql | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return url ? neon(url) : null;
}

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(sql: Sql) {
  schemaReady ??= (async () => {
    await sql`create table if not exists stories (
      id uuid primary key default gen_random_uuid(),
      recipe_id text not null,
      author_name text not null,
      text text not null,
      created_at timestamptz not null default now()
    )`;
    await sql`alter table stories add column if not exists author_id text`;
    await sql`create index if not exists stories_recipe_idx on stories (recipe_id)`;
    await sql`create table if not exists recipe_edits (
      id text primary key,
      data jsonb not null,
      updated_by text,
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists members (
      user_id text primary key,
      email text,
      name text,
      image text,
      joined_at timestamptz not null default now()
    )`;
    // Removed members stay listed as blocked, so the family code can't let them back in.
    await sql`alter table members add column if not exists blocked boolean not null default false`;
    // Cooks added in the app (the original list ships with the app).
    await sql`create table if not exists contributors (
      id text primary key,
      data jsonb not null,
      created_by text,
      created_at timestamptz not null default now()
    )`;
    // Which account belongs to which cook, so their recipes live under their name.
    await sql`create table if not exists contributor_links (
      contributor_id text primary key,
      user_id text not null unique,
      linked_at timestamptz not null default now()
    )`;
    await sql`create table if not exists favorites (
      user_id text not null,
      recipe_id text not null,
      created_at timestamptz not null default now(),
      primary key (user_id, recipe_id)
    )`;
    // Personal invite links, one per cook.
    await sql`create table if not exists invites (
      token text primary key,
      contributor_id text not null,
      created_by text,
      created_at timestamptz not null default now(),
      claimed_by text,
      claimed_at timestamptz
    )`;
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

function codeOk(given: unknown) {
  const want = process.env.FAMILY_CODE;
  if (!want || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(want.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The signed-in Google user, from the Neon Auth token in the Authorization header. */
async function currentUser(req: Request): Promise<User | null> {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(h.slice(7), JWKS);
    const p = payload as Record<string, unknown>;
    const id = String(p.sub || p.id || '');
    if (!id) return null;
    return {
      id,
      name: String(p.name || p.email || 'Family member'),
      email: String(p.email || ''),
      image: typeof p.image === 'string' ? p.image : null,
      admin: false, // filled in from the database by loadRole()
    };
  } catch {
    return null;
  }
}

/**
 * The token's `role` claim is the Postgres role ("authenticated"), not the app role,
 * so read the Neon Auth user role from the database (set with `neon neon-auth user set-role`).
 */
async function loadRole(sql: Sql, user: User) {
  try {
    const rows = (await sql`select role from neon_auth."user" where id::text = ${user.id}`) as { role: string | null }[];
    user.admin = String(rows[0]?.role || '')
      .split(',')
      .map((r) => r.trim())
      .includes('admin');
  } catch {
    user.admin = false;
  }
  return user;
}

async function addMember(sql: Sql, user: User) {
  await sql`insert into members (user_id, email, name, image) values (${user.id}, ${user.email}, ${user.name}, ${user.image})
    on conflict (user_id) do update set email = excluded.email, name = excluded.name,
      image = coalesce(excluded.image, members.image)`;
}

/** 'member', 'blocked' or 'none'. Admins are always members. */
async function memberState(sql: Sql, user: User): Promise<'member' | 'blocked' | 'none'> {
  if (user.admin) {
    await addMember(sql, user);
    await sql`update members set blocked = false where user_id = ${user.id}`;
    return 'member';
  }
  const rows = (await sql`select blocked from members where user_id = ${user.id}`) as { blocked: boolean }[];
  if (!rows.length) return 'none';
  return rows[0].blocked ? 'blocked' : 'member';
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function linkedContributor(sql: Sql, userId: string): Promise<string | null> {
  const rows = (await sql`select contributor_id from contributor_links where user_id = ${userId}`) as { contributor_id: string }[];
  return rows[0]?.contributor_id ?? null;
}

/** Ties an account to a cook, unless either side is already taken. */
async function linkContributor(sql: Sql, contributorId: string, userId: string) {
  await sql`insert into contributor_links (contributor_id, user_id) values (${contributorId}, ${userId}) on conflict do nothing`;
}

/** Keeps only the fields a cook needs, so nobody can stuff odd data into the list. */
function cleanContributor(c: any) {
  if (!c || typeof c.id !== 'string') return null;
  const id = clip(c.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const name = clip(c.name, 80);
  if (!id || !name || id === 'none') return null;
  return {
    id,
    name,
    short: clip(c.short, 40) || name.split(' ')[0],
    ini: clip(c.ini, 3) || name.slice(0, 2).toUpperCase(),
    hue: Number.isFinite(c.hue) ? Math.round(c.hue) % 360 : 330,
    ...(clip(c.rel, 40) ? { rel: clip(c.rel, 40) } : {}),
  };
}

/** Signed in + family member, or an error response. */
async function requireMember(req: Request, sql: Sql): Promise<User | Response> {
  const user = await currentUser(req);
  if (!user) return json({ error: 'Please sign in first' }, 401);
  await ensureSchema(sql);
  await loadRole(sql, user);
  const state = await memberState(sql, user);
  if (state === 'blocked') return json({ error: 'Your access was removed. Ask the family admin.' }, 403);
  if (state === 'none') return json({ error: 'Join the family with the invite link or family code' }, 403);
  return user;
}

async function requireAdmin(req: Request, sql: Sql): Promise<User | Response> {
  const user = await requireMember(req, sql);
  if (user instanceof Response) return user;
  return user.admin ? user : json({ error: 'Only the family admin can do that' }, 403);
}

export async function GET(req: Request) {
  const op = new URL(req.url).searchParams.get('op');
  const sql = db();

  if (op === 'health') {
    return json({ shared: !!sql && !!process.env.FAMILY_CODE, photos: !!process.env.BLOB_READ_WRITE_TOKEN });
  }
  if (!sql) return json({ error: 'No database connected' }, 503);

  if (op === 'me') {
    const user = await currentUser(req);
    if (!user) return json({ error: 'Please sign in first' }, 401);
    await ensureSchema(sql);
    await loadRole(sql, user);
    const state = await memberState(sql, user);
    return json({
      user,
      member: state === 'member',
      blocked: state === 'blocked',
      admin: user.admin,
      contributorId: await linkedContributor(sql, user.id),
    });
  }

  if (op === 'invites') {
    const who = await requireAdmin(req, sql);
    if (who instanceof Response) return who;
    const rows = (await sql`select token, contributor_id, claimed_by from invites where claimed_by is null`) as any[];
    return json({ invites: rows.map((r) => ({ token: r.token, contributorId: r.contributor_id })) });
  }

  if (op === 'members') {
    const who = await requireAdmin(req, sql);
    if (who instanceof Response) return who;
    const rows = (await sql`select m.user_id, m.name, m.email, m.image, m.joined_at, m.blocked,
        (select count(*)::int from stories s where s.author_id = m.user_id) as stories
      from members m order by m.blocked, m.joined_at`) as any[];
    return json({
      members: rows.map((m) => ({
        id: m.user_id,
        name: m.name,
        email: m.email,
        image: m.image,
        joinedAt: new Date(m.joined_at).getTime(),
        blocked: m.blocked,
        stories: m.stories,
        isYou: m.user_id === who.id,
      })),
    });
  }

  if (op === 'invite') {
    const who = await requireAdmin(req, sql);
    if (who instanceof Response) return who;
    return json({ code: (process.env.FAMILY_CODE || '').trim() });
  }

  if (op === 'data') {
    const who = await requireMember(req, sql);
    if (who instanceof Response) return who;
    const stories = (await sql`select id, recipe_id, author_name, author_id, text, created_at from stories order by created_at asc`) as any[];
    const edits = (await sql`select data from recipe_edits order by updated_at asc`) as any[];
    const contributors = (await sql`select data from contributors order by created_at asc`) as any[];
    const links = (await sql`select l.contributor_id, l.user_id, m.name, m.image
      from contributor_links l left join members m on m.user_id = l.user_id`) as any[];
    const favCounts = (await sql`select recipe_id, count(*)::int as n from favorites group by recipe_id`) as any[];
    const mine = (await sql`select recipe_id from favorites where user_id = ${who.id}`) as any[];
    return json({
      admin: who.admin,
      favoriteCounts: Object.fromEntries(favCounts.map((f) => [f.recipe_id, f.n])),
      myFavorites: mine.map((f) => f.recipe_id),
      contributorId: await linkedContributor(sql, who.id),
      contributors: contributors.map((c) => c.data),
      links: links.map((l) => ({ contributorId: l.contributor_id, userId: l.user_id, name: l.name, image: l.image })),
      stories: stories.map((s) => ({
        id: s.id,
        recipeId: s.recipe_id,
        authorName: s.author_name,
        authorId: s.author_id,
        text: s.text,
        createdAt: new Date(s.created_at).getTime(),
      })),
      recipes: edits.map((e) => e.data),
    });
  }
  return json({ error: 'Unknown request' }, 404);
}

export async function POST(req: Request) {
  const op = new URL(req.url).searchParams.get('op');
  const sql = db();
  if (!sql) return json({ error: 'No database connected' }, 503);

  if (op === 'join') {
    const user = await currentUser(req);
    if (!user) return json({ error: 'Please sign in first' }, 401);
    const body = await req.json().catch(() => ({}));
    if (!codeOk(body.code)) return json({ error: 'That code didn’t match' }, 403);
    await ensureSchema(sql);
    await loadRole(sql, user);
    if ((await memberState(sql, user)) === 'blocked') return json({ error: 'Your access was removed. Ask the family admin.' }, 403);
    await addMember(sql, user);
    return json({ ok: true });
  }

  // A personal invite link: joins the family and ties this account to the cook it was made for.
  if (op === 'claim-invite') {
    const user = await currentUser(req);
    if (!user) return json({ error: 'Please sign in first' }, 401);
    const body = await req.json().catch(() => ({}));
    const token = clip(body.token, 64);
    await ensureSchema(sql);
    const [inv] = (await sql`select contributor_id, claimed_by from invites where token = ${token}`) as any[];
    if (!inv) return json({ error: 'That invite link isn’t valid. Ask Luke for a new one.' }, 403);
    if (inv.claimed_by && inv.claimed_by !== user.id) return json({ error: 'That invite link was already used. Ask Luke for a new one.' }, 403);
    await loadRole(sql, user);
    if ((await memberState(sql, user)) === 'blocked') return json({ error: 'Your access was removed. Ask the family admin.' }, 403);
    await addMember(sql, user);
    if (!(await linkedContributor(sql, user.id))) await linkContributor(sql, inv.contributor_id, user.id);
    await sql`update invites set claimed_by = ${user.id}, claimed_at = now() where token = ${token}`;
    return json({ ok: true, contributorId: await linkedContributor(sql, user.id) });
  }

  if (op === 'create-invite') {
    const who = await requireAdmin(req, sql);
    if (who instanceof Response) return who;
    const body = await req.json().catch(() => ({}));
    const contributorId = clip(body.contributorId, 60);
    if (!contributorId || contributorId === 'none') return json({ error: 'Pick a person to invite' }, 400);
    const [existing] = (await sql`select token from invites where contributor_id = ${contributorId} and claimed_by is null`) as any[];
    if (existing) return json({ token: existing.token });
    const token = randomUUID().replace(/-/g, '').slice(0, 16);
    await sql`insert into invites (token, contributor_id, created_by) values (${token}, ${contributorId}, ${who.id})`;
    return json({ token });
  }

  if (op === 'remove-member' || op === 'restore-member') {
    const who = await requireAdmin(req, sql);
    if (who instanceof Response) return who;
    const body = await req.json().catch(() => ({}));
    const id = clip(body.userId, 100);
    if (!id || id === who.id) return json({ error: 'You can’t remove yourself' }, 400);
    await sql`update members set blocked = ${op === 'remove-member'} where user_id = ${id}`;
    return json({ ok: true });
  }

  const who = await requireMember(req, sql);
  if (who instanceof Response) return who;

  if (op === 'upload') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ error: 'Photo storage is not connected' }, 503);
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length || buf.length > 4_000_000) return json({ error: 'Photo is too large' }, 413);
    const blob = await put(`cards/${randomUUID()}.jpg`, buf, { access: 'public', contentType: 'image/jpeg' });
    return json({ url: blob.url });
  }

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Bad request' }, 400);

  if (op === 'story') {
    const recipeId = clip(body.recipeId, 80);
    const authorName = clip(body.authorName, 80) || who.name;
    const text = clip(body.text, 5000);
    if (!recipeId || !text) return json({ error: 'Write a few words first' }, 400);
    const [row] = (await sql`insert into stories (recipe_id, author_name, author_id, text)
      values (${recipeId}, ${authorName}, ${who.id}, ${text}) returning id, created_at`) as any[];
    return json({ id: row.id, recipeId, authorName, authorId: who.id, text, createdAt: new Date(row.created_at).getTime() });
  }

  if (op === 'favorite') {
    const recipeId = clip(body.recipeId, 80);
    if (!recipeId) return json({ error: 'Bad request' }, 400);
    if (body.on) await sql`insert into favorites (user_id, recipe_id) values (${who.id}, ${recipeId}) on conflict do nothing`;
    else await sql`delete from favorites where user_id = ${who.id} and recipe_id = ${recipeId}`;
    const [row] = (await sql`select count(*)::int as n from favorites where recipe_id = ${recipeId}`) as any[];
    return json({ count: row.n, on: !!body.on });
  }

  if (op === 'add-contributor') {
    const c = cleanContributor(body.contributor);
    if (!c) return json({ error: 'That person needs a name' }, 400);
    await sql`insert into contributors (id, data, created_by) values (${c.id}, ${JSON.stringify(c)}::jsonb, ${who.id})
      on conflict (id) do nothing`;
    // "This is me": tie the new cook to the person who added themselves.
    if (body.me === true && !(await linkedContributor(sql, who.id))) await linkContributor(sql, c.id, who.id);
    return json({ ok: true, contributor: c, contributorId: await linkedContributor(sql, who.id) });
  }

  if (op === 'delete-story') {
    const id = clip(body.id, 64);
    const [row] = (await sql`select author_id from stories where id::text = ${id}`) as { author_id: string | null }[];
    if (!row) return json({ ok: true });
    if (row.author_id !== who.id && !who.admin) return json({ error: 'You can only delete your own stories' }, 403);
    await sql`delete from stories where id::text = ${id}`;
    return json({ ok: true });
  }

  if (op === 'recipe') {
    const r = body.recipe;
    const raw = JSON.stringify(r ?? null);
    if (!r || typeof r.id !== 'string' || !clip(r.title, 200) || raw.length > 60_000) {
      return json({ error: 'Recipe is missing a title' }, 400);
    }
    await sql`insert into recipe_edits (id, data, updated_by) values (${r.id}, ${raw}::jsonb, ${who.name})
      on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`;
    return json({ ok: true });
  }

  return json({ error: 'Unknown request' }, 404);
}
