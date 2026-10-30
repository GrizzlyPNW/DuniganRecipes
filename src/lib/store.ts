import { useCallback, useEffect, useMemo, useState } from 'react';
import base from '../data/recipes.json';
import type { Contributor, Recipe, Story } from '../types';
import * as api from './api';

const baseContributors: Record<string, Contributor> = Object.fromEntries(
  Object.entries(base.contributors).map(([id, c]) => [id, { id, ...(c as Omit<Contributor, 'id'>) }]),
);
const baseRecipes = base.recipes as Recipe[];
export const CATEGORIES: string[] = base.categories;
export const isBaseContributor = (id: string) => id in baseContributors;

const NAME_KEY = 'dunigan-name';
export const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};
export const rememberName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n.trim());
  } catch {
    /* ignore */
  }
};

export type Family = ReturnType<typeof useFamily>;

export function useFamily() {
  const [mode, setMode] = useState<api.Mode | null>(null);
  const [joined, setJoined] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [edits, setEdits] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (m: api.Mode) => {
    try {
      const data = await api.loadAll(m);
      setStories(data.stories);
      setEdits(data.recipes);
      setJoined(true);
      setError(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) setJoined(false);
      else setError('Couldn’t reach the family box. Check your connection.');
    }
  }, []);

  useEffect(() => {
    api.detectMode().then(({ mode: m }) => {
      setMode(m);
      if (m === 'local' || api.savedCode()) refresh(m);
    });
  }, [refresh]);

  // Pick up new stories from the rest of the family when the app comes back into view.
  useEffect(() => {
    if (mode !== 'shared' || !joined) return;
    const onShow = () => document.visibilityState === 'visible' && refresh(mode);
    document.addEventListener('visibilitychange', onShow);
    const iv = setInterval(onShow, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      clearInterval(iv);
    };
  }, [mode, joined, refresh]);

  const { recipes, contributors } = useMemo(() => {
    const byId = new Map(baseRecipes.map((r) => [r.id, r]));
    for (const e of edits) byId.set(e.id, e);
    const contributors = { ...baseContributors };
    for (const r of byId.values()) if (r.newContributor && !contributors[r.contributor]) contributors[r.contributor] = r.newContributor;
    return { recipes: [...byId.values()], contributors };
  }, [edits]);

  const storiesByRecipe = useMemo(() => {
    const m: Record<string, Story[]> = {};
    for (const s of stories) (m[s.recipeId] ||= []).push(s);
    return m;
  }, [stories]);

  return {
    mode,
    joined,
    error,
    recipes,
    contributors,
    storiesByRecipe,
    join: async (code: string) => {
      if (!mode) return false;
      const ok = await api.join(code);
      if (ok) await refresh(mode);
      return ok;
    },
    addStory: async (recipeId: string, authorName: string, text: string) => {
      const s = await api.addStory(mode!, { recipeId, authorName, text });
      setStories((all) => [...all, s]);
      rememberName(authorName);
      return s;
    },
    saveRecipe: async (r: Recipe) => {
      await api.saveRecipe(mode!, r, savedName());
      setEdits((all) => [...all.filter((x) => x.id !== r.id), r]);
    },
    uploadPhoto: (b: Blob) => api.uploadPhoto(mode!, b),
  };
}
