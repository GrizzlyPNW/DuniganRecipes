import type { Recipe, Story } from '../types';
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

export const me = () => call<{ member: boolean }>('GET', 'me');

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

export async function loadAll(mode: Mode): Promise<{ stories: Story[]; recipes: Recipe[] }> {
  if (mode === 'local') return { stories: read(LOCAL_STORIES, []), recipes: read(LOCAL_RECIPES, []) };
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
