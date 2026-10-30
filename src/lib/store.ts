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

/**
 * - loading: still checking the server and the sign-in
 * - signed-out: shared mode, nobody signed in
 * - not-member: signed in with Google, but hasn't used the invite link or family code yet
 * - member: can read and add stories (always the case in local mode)
 */
export type Access = 'loading' | 'signed-out' | 'not-member' | 'member';

export type Family = ReturnType<typeof useFamily>;

export function useFamily(userId: string | null, sessionPending: boolean) {
  const [mode, setMode] = useState<api.Mode | null>(null);
  const [access, setAccess] = useState<Access>('loading');
  const [admin, setAdmin] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [edits, setEdits] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.detectMode().then(({ mode: m }) => setMode(m));
  }, []);

  const refresh = useCallback(async (m: api.Mode) => {
    try {
      const data = await api.loadAll(m);
      setStories(data.stories);
      setEdits(data.recipes);
      setAccess('member');
      setError(null);
    } catch (e) {
      const status = e instanceof api.ApiError ? e.status : 0;
      if (status === 403) setAccess('not-member');
      else if (status === 401) setAccess('signed-out');
      else {
        // A network blip: keep what we had, but never stay stuck on "loading".
        setAccess((a) => (a === 'loading' ? 'signed-out' : a));
        setError('Couldn’t reach the family box. Check your connection.');
      }
    }
  }, []);

  // Work out what this person can see whenever the server mode or the signed-in user changes.
  useEffect(() => {
    if (!mode || sessionPending) return;
    if (mode === 'local') {
      refresh('local');
      return;
    }
    if (!userId) {
      setAdmin(false);
      setBlocked(false);
      setAccess('signed-out');
      setStories([]);
      setEdits([]);
      // Recipe edits by the family are only visible to members, so show the original box.
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await api.me();
        if (cancelled) return;
        setAdmin(status.admin);
        setBlocked(status.blocked);
        if (status.member) return refresh('shared');
        const code = status.blocked ? null : api.pendingInvite();
        if (code && (await api.join(code))) return refresh('shared');
        if (!cancelled) setAccess('not-member');
      } catch (e) {
        if (cancelled) return;
        // Never leave the app waiting: fall back to the signed-out view.
        const status = e instanceof api.ApiError ? e.status : 0;
        setAccess(status === 403 ? 'not-member' : 'signed-out');
        if (status !== 401) setError('Couldn’t reach the family box. Check your connection.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userId, sessionPending, refresh]);

  // Pick up new stories from the rest of the family when the app comes back into view.
  useEffect(() => {
    if (mode !== 'shared' || access !== 'member') return;
    const onShow = () => document.visibilityState === 'visible' && refresh(mode);
    document.addEventListener('visibilitychange', onShow);
    const iv = setInterval(onShow, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      clearInterval(iv);
    };
  }, [mode, access, refresh]);

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
    access,
    /** The family admin (set in Neon Auth). Always true on a single-device copy. */
    admin: mode === 'local' || admin,
    blocked,
    ready: !!mode && access !== 'loading',
    error,
    recipes,
    contributors,
    storiesByRecipe,
    /** Join with a typed family code (already signed in). */
    join: async (code: string) => {
      const ok = await api.join(code);
      if (ok && mode) await refresh(mode);
      return ok;
    },
    addStory: async (recipeId: string, authorName: string, text: string) => {
      const s = await api.addStory(mode!, { recipeId, authorName, text });
      setStories((all) => [...all, s]);
      return s;
    },
    deleteStory: async (id: string) => {
      await api.deleteStory(mode!, id);
      setStories((all) => all.filter((s) => s.id !== id));
    },
    saveRecipe: async (r: Recipe) => {
      await api.saveRecipe(mode!, r);
      setEdits((all) => [...all.filter((x) => x.id !== r.id), r]);
    },
    uploadPhoto: (b: Blob) => api.uploadPhoto(mode!, b),
  };
}
