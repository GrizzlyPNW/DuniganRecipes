import type { Contributor, Recipe, Story } from '../types';
import { blobToDataUrl } from './image';
import { getToken } from './auth';

/**
 * Talks to /api/family when the site is deployed with a database.
 * Without one (plain `npm run dev`, or before Neon is connected) everything is kept
 * in this browser instead, so the app still works on a single device.
 */
export type Mode = 'shared' | 'local';

const INVITE_KEY = 'dunigan-family-code';
const LOCAL_STORIES = 'dunigan-stories-v2';
const LOCAL_RECIPES = 'dunigan-recipes-v2';

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};

/** An invite code from a link, kept until the person has signed in and joined. */
export const pendingInvite = () => {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
};
export const setPendingInvite = (code: string | null) => {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code.trim());
    else localStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
};

export async function detectMode(): Promise<{ mode: Mode; photos: boolean }> {
  try {
    const res = await fetch('/api/family?op=health');
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      const h = await res.json();
      if (h.shared) return { mode: 'shared', photos: !!h.photos };
    }
  } catch {
    /* no server: local mode */
  }
  return { mode: 'local', photos: true };
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', op: string, body?: BodyInit, type = 'application/json'): Promise<T> {
  const token = await getToken();
  const res = await fetch('/api/family?op=' + op, {
    method,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': type } : {}) },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status);
  return data as T;
}

export const me = () =>
  call<{ member: boolean; admin: boolean; blocked: boolean; contributorId: string | null }>('GET', 'me');

/* ---------- Personal invites (one per cook) ---------- */

const TOKEN_KEY = 'dunigan-invite-token';
export const pendingToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setPendingToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};
export async function claimInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await call('POST', 'claim-invite', JSON.stringify({ token }));
    setPendingToken(null);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) setPendingToken(null);
    return { ok: false, error: (e as Error).message };
  }
}
export const createInvite = (contributorId: string) =>
  call<{ token: string }>('POST', 'create-invite', JSON.stringify({ contributorId })).then((r) => r.token);
export const listInvites = () =>
  call<{ invites: { token: string; contributorId: string }[] }>('GET', 'invites').then((r) => r.invites);

export interface Link {
  contributorId: string;
  userId: string;
  name: string | null;
  image: string | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
  joinedAt: number;
  blocked: boolean;
  stories: number;
  isYou: boolean;
}
export const listMembers = () => call<{ members: Member[] }>('GET', 'members').then((r) => r.members);
export const setMemberRemoved = (userId: string, removed: boolean) =>
  call('POST', removed ? 'remove-member' : 'restore-member', JSON.stringify({ userId }));
export const getInviteCode = () => call<{ code: string }>('GET', 'invite').then((r) => r.code);

export async function deleteStory(mode: Mode, id: string) {
  if (mode === 'local') {
    write(LOCAL_STORIES, read<Story[]>(LOCAL_STORIES, []).filter((s) => s.id !== id));
    return;
  }
  await call('POST', 'delete-story', JSON.stringify({ id }));
}

export async function join(code: string): Promise<boolean> {
  try {
    await call('POST', 'join', JSON.stringify({ code }));
    setPendingInvite(null);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) setPendingInvite(null);
    return false;
  }
}

const LOCAL_PEOPLE = 'dunigan-people-v1';

export async function addContributor(mode: Mode, contributor: Contributor, isMe: boolean) {
  if (mode === 'local') {
    write(LOCAL_PEOPLE, [...read<Contributor[]>(LOCAL_PEOPLE, []).filter((c) => c.id !== contributor.id), contributor]);
    return { contributor, contributorId: isMe ? contributor.id : null };
  }
  return call<{ contributor: Contributor; contributorId: string | null }>(
    'POST',
    'add-contributor',
    JSON.stringify({ contributor, me: isMe }),
  );
}

const LOCAL_FAVS = 'dunigan-favorites-v1';
export async function setFavorite(mode: Mode, recipeId: string, on: boolean): Promise<number> {
  if (mode === 'local') {
    const s = new Set(read<string[]>(LOCAL_FAVS, []));
    if (on) s.add(recipeId);
    else s.delete(recipeId);
    write(LOCAL_FAVS, [...s]);
    return on ? 1 : 0;
  }
  const r = await call<{ count: number }>('POST', 'favorite', JSON.stringify({ recipeId, on }));
  return r.count;
}

export interface FamilyData {
  favoriteCounts?: Record<string, number>;
  myFavorites?: string[];
  stories: Story[];
  recipes: Recipe[];
  admin?: boolean;
  contributorId?: string | null;
  contributors?: Contributor[];
  links?: Link[];
}

export async function loadAll(mode: Mode): Promise<FamilyData> {
  if (mode === 'local') {
    const favs = read<string[]>(LOCAL_FAVS, []);
    return {
      stories: read(LOCAL_STORIES, []),
      recipes: read(LOCAL_RECIPES, []),
      contributors: read(LOCAL_PEOPLE, []),
      myFavorites: favs,
      favoriteCounts: Object.fromEntries(favs.map((id) => [id, 1])),
    };
  }
  return call('GET', 'data');
}

export async function addStory(mode: Mode, s: Omit<Story, 'id' | 'createdAt'>): Promise<Story> {
  if (mode === 'local') {
    const story: Story = { ...s, id: crypto.randomUUID(), createdAt: Date.now() };
    write(LOCAL_STORIES, [...read<Story[]>(LOCAL_STORIES, []), story]);
    return story;
  }
  return call('POST', 'story', JSON.stringify(s));
}

export async function saveRecipe(mode: Mode, recipe: Recipe) {
  if (mode === 'local') {
    const all = read<Recipe[]>(LOCAL_RECIPES, []).filter((r) => r.id !== recipe.id);
    write(LOCAL_RECIPES, [...all, recipe]);
    return;
  }
  await call('POST', 'recipe', JSON.stringify({ recipe }));
}

/** Uploads a compressed card photo and returns its URL. */
export async function uploadPhoto(mode: Mode, jpeg: Blob): Promise<string> {
  if (mode === 'local') return blobToDataUrl(jpeg);
  const { url } = await call<{ url: string }>('POST', 'upload', jpeg, 'image/jpeg');
  return url;
}

/* ---------- Shopping list (one per person) ---------- */

export interface ShopItem {
  id: string;
  text: string;
  done: boolean;
  /** Set when the item came from a recipe's ingredients. */
  recipeId?: string;
  recipe?: string;
}

export const getShopping = () => call<{ items: ShopItem[]; updatedAt: number }>('GET', 'shopping');
export const saveShopping = (items: ShopItem[]) => call<{ ok: boolean }>('POST', 'shopping', JSON.stringify({ items }));
