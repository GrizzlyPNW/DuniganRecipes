// One Vercel function for everything shared: stories, recipe edits and card photo uploads.
// Every read and write needs the family code (FAMILY_CODE env var), sent as the x-family-code header.
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { timingSafeEqual, randomUUID } from 'node:crypto';

type Sql = ReturnType<typeof neon>;

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
    await sql`create index if not exists stories_recipe_idx on stories (recipe_id)`;
    await sql`create table if not exists recipe_edits (
      id text primary key,
      data jsonb not null,
      updated_by text,
      updated_at timestamptz not null default now()
    )`;
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

function codeOk(given: string | null) {
  const want = process.env.FAMILY_CODE;
  if (!want || !given) return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(req: Request) {
  const op = new URL(req.url).searchParams.get('op');
  const sql = db();

  if (op === 'health') {
    return json({ shared: !!sql && !!process.env.FAMILY_CODE, photos: !!process.env.BLOB_READ_WRITE_TOKEN });
  }
  if (!sql) return json({ error: 'No database connected' }, 503);
  if (!codeOk(req.headers.get('x-family-code'))) return json({ error: 'Family code needed' }, 401);

  if (op === 'data') {
    await ensureSchema(sql);
    const stories = (await sql`select id, recipe_id, author_name, text, created_at from stories order by created_at asc`) as any[];
    const edits = (await sql`select data from recipe_edits order by updated_at asc`) as any[];
    return json({
      stories: stories.map((s) => ({
        id: s.id,
        recipeId: s.recipe_id,
        authorName: s.author_name,
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

  if (op === 'join') {
    const body = await req.json().catch(() => ({}));
    return codeOk(body.code) ? json({ ok: true }) : json({ error: 'That code didn’t match' }, 401);
  }

  const sql = db();
  if (!codeOk(req.headers.get('x-family-code'))) return json({ error: 'Family code needed' }, 401);

  if (op === 'upload') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ error: 'Photo storage is not connected' }, 503);
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length || buf.length > 4_000_000) return json({ error: 'Photo is too large' }, 413);
    const blob = await put(`cards/${randomUUID()}.jpg`, buf, { access: 'public', contentType: 'image/jpeg' });
    return json({ url: blob.url });
  }

  if (!sql) return json({ error: 'No database connected' }, 503);
  await ensureSchema(sql);
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Bad request' }, 400);

  if (op === 'story') {
    const recipeId = clip(body.recipeId, 80);
    const authorName = clip(body.authorName, 80);
    const text = clip(body.text, 5000);
    if (!recipeId || !authorName || !text) return json({ error: 'Name and story are both needed' }, 400);
    const [row] = (await sql`insert into stories (recipe_id, author_name, text)
      values (${recipeId}, ${authorName}, ${text}) returning id, created_at`) as any[];
    return json({ id: row.id, recipeId, authorName, text, createdAt: new Date(row.created_at).getTime() });
  }

  if (op === 'recipe') {
    const r = body.recipe;
    const raw = JSON.stringify(r ?? null);
    if (!r || typeof r.id !== 'string' || !clip(r.title, 200) || raw.length > 60_000) {
      return json({ error: 'Recipe is missing a title' }, 400);
    }
    const by = clip(body.by, 80) || null;
    await sql`insert into recipe_edits (id, data, updated_by) values (${r.id}, ${raw}::jsonb, ${by})
      on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`;
    return json({ ok: true });
  }

  return json({ error: 'Unknown request' }, 404);
}
