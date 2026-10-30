import type { Recipe, Story } from '../types';
import { blobToDataUrl } from './image';

/**
 * Talks to /api/family when the site is deployed with a database.
 * Without one (plain `npm run dev`, or before Neon is connected) everything is kept
 * in this browser instead, so the app still works on a single device.
 */
export type Mode = 'shared' | 'local';

const CODE_KEY = 'dunigan-family-code';
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

export const savedCode = () => {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
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

async function call<T>(method: 'GET' | 'POST', op: string, body?: BodyInit, type = 'application/json'): Promise<T> {
  const res = await fetch('/api/family?op=' + op, {
    method,
    headers: { 'x-family-code': savedCode() || '', ...(body ? { 'content-type': type } : {}) },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function join(code: string): Promise<boolean> {
  const res = await fetch('/api/family?op=join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return false;
  try {
    localStorage.setItem(CODE_KEY, code.trim());
  } catch {
    /* ignore */
  }
  return true;
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

export async function saveRecipe(mode: Mode, recipe: Recipe, by: string) {
  if (mode === 'local') {
    const all = read<Recipe[]>(LOCAL_RECIPES, []).filter((r) => r.id !== recipe.id);
    write(LOCAL_RECIPES, [...all, recipe]);
    return;
  }
  await call('POST', 'recipe', JSON.stringify({ recipe, by }));
}

/** Uploads a compressed card photo and returns its URL. */
export async function uploadPhoto(mode: Mode, jpeg: Blob): Promise<string> {
  if (mode === 'local') return blobToDataUrl(jpeg);
  const { url } = await call<{ url: string }>('POST', 'upload', jpeg, 'image/jpeg');
  return url;
}
