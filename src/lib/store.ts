import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import base from '../data/recipes.json';
import type { Contributor, Recipe, Story } from '../types';
export type { Contributor };
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
  const [people, setPeople] = useState<Contributor[]>([]);
  const [links, setLinks] = useState<api.Link[]>([]);
  const [myContributor, setMyContributor] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [favCounts, setFavCounts] = useState<Record<string, number>>({});
  const [myFavs, setMyFavs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Bumped to re-run the sign-in check (e.g. after opening an invite link while signed in).
  const [checkNonce, setCheckNonce] = useState(0);

  useEffect(() => {
    api.detectMode().then(({ mode: m }) => setMode(m));
  }, []);

  // Each sign-in check bumps this; results from an older check are ignored.
  const gen = useRef(0);

  const refresh = useCallback(async (m: api.Mode, g = gen.current) => {
    try {
      const data = await api.loadAll(m);
      if (g !== gen.current) return;
      setStories(data.stories);
      setEdits(data.recipes);
      setPeople(data.contributors || []);
      setLinks(data.links || []);
      setFavCounts(data.favoriteCounts || {});
      setMyFavs(new Set(data.myFavorites || []));
      if (data.contributorId !== undefined) setMyContributor(data.contributorId);
      if (typeof data.admin === 'boolean') setAdmin(data.admin);
      setAccess('member');
      setError(null);
    } catch (e) {
      if (g !== gen.current) return;
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
    const g = ++gen.current;
    if (mode === 'local') {
      refresh('local', g);
      return;
    }
    if (!userId) {
      setAdmin(false);
      setBlocked(false);
      setAccess('signed-out');
      setStories([]);
      setEdits([]);
      setPeople([]);
      setLinks([]);
      setMyContributor(null);
      // Recipe edits by the family are only visible to members, so show the original box.
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // The session can be mid-refresh right after sign-in; give the check one retry.
        const status = await api.me().catch(async (e) => {
          if (!(e instanceof api.ApiError) || e.status !== 401) throw e;
          await new Promise((r) => setTimeout(r, 1200));
          return api.me();
        });
        if (cancelled) return;
        setAdmin(status.admin);
        setBlocked(status.blocked);
        setMyContributor(status.contributorId);
        // A personal invite link (#/invite/<token>) joins and ties this account to its cook.
        const token = status.blocked ? null : api.pendingToken();
        if (token) {
          const res = await api.claimInvite(token);
          if (cancelled) return;
          if (res.ok) return refresh('shared', g);
          setInviteError(res.error || null);
        }
        if (status.member) return refresh('shared', g);
        const code = status.blocked ? null : api.pendingInvite();
        if (code && (await api.join(code))) return refresh('shared', g);
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
  }, [mode, userId, sessionPending, refresh, checkNonce]);

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
    for (const p of people) if (!contributors[p.id]) contributors[p.id] = p;
    for (const r of byId.values()) if (r.newContributor && !contributors[r.contributor]) contributors[r.contributor] = r.newContributor;
    return { recipes: [...byId.values()], contributors };
  }, [edits, people]);

  /** contributorId → the family account that belongs to that cook. */
  const linkByContributor = useMemo(() => Object.fromEntries(links.map((l) => [l.contributorId, l])), [links]);

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
    isBase: isBaseContributor,
    blocked,
    ready: !!mode && access !== 'loading',
    error,
    recipes,
    contributors,
    storiesByRecipe,
    linkByContributor,
    /** The cook this account belongs to, if any. */
    myContributor,
    inviteError,
    /** Adds a cook to the family list; `isMe` also ties it to this account. */
    addContributor: async (c: Contributor, isMe: boolean) => {
      const res = await api.addContributor(mode!, c, isMe);
      setPeople((all) => [...all.filter((p) => p.id !== res.contributor.id), res.contributor]);
      if (res.contributorId) setMyContributor(res.contributorId);
      return res.contributor;
    },
    refresh: () => mode && refresh(mode),
    refreshAccess: () => setCheckNonce((n) => n + 1),
    favoriteCount: (recipeId: string) => favCounts[recipeId] || 0,
    isFavorite: (recipeId: string) => myFavs.has(recipeId),
    /** Flips the heart right away, then confirms the count with the server. */
    toggleFavorite: async (recipeId: string) => {
      const on = !myFavs.has(recipeId);
      const before = favCounts[recipeId] || 0;
      setMyFavs((s) => {
        const n = new Set(s);
        if (on) n.add(recipeId);
        else n.delete(recipeId);
        return n;
      });
      setFavCounts((c) => ({ ...c, [recipeId]: Math.max(0, before + (on ? 1 : -1)) }));
      try {
        const count = await api.setFavorite(mode!, recipeId, on);
        setFavCounts((c) => ({ ...c, [recipeId]: count }));
      } catch (e) {
        setMyFavs((s) => {
          const n = new Set(s);
          if (on) n.delete(recipeId);
          else n.add(recipeId);
          return n;
        });
        setFavCounts((c) => ({ ...c, [recipeId]: before }));
        throw e;
      }
    },
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
