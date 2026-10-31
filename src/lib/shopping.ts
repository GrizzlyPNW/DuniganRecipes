import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { ShopItem } from './api';
import type { Access } from './store';
import { isGroup, type Recipe } from '../types';
export type { ShopItem };

// A copy stays on the device so the list opens instantly and works with poor signal at the store.
const LOCAL_KEY = 'dunigan-shopping-v1';
const keyFor = (userId: string | null) => LOCAL_KEY + (userId ? ':' + userId : '');
const readLocal = (userId: string | null): { items: ShopItem[]; at: number } => {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    return v && Array.isArray(v.items) ? v : { items: [], at: 0 };
  } catch {
    return { items: [], at: 0 };
  }
};
const writeLocal = (userId: string | null, items: ShopItem[], at: number) => {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ items, at }));
  } catch {
    /* storage blocked */
  }
};
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/**
 * The signed-in person's shopping list. Saved on this device right away and to the
 * family database a moment later, so it follows them between phone and computer.
 */
export function useShopping(mode: 'shared' | 'local' | null, access: Access, userId: string | null) {
  const [items, setItems] = useState<ShopItem[]>(() => readLocal(userId).items);
  const synced = mode === 'shared' && access === 'member';
  const saveTimer = useRef<number>();
  const pending = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Pull the saved list when signed in, and again when the app comes back to the front.
  useEffect(() => {
    if (!synced) return;
    let alive = true;
    const pull = () => {
      if (pending.current) return; // don't overwrite changes still being saved
      api
        .getShopping()
        .then(({ items: server, updatedAt }) => {
          if (!alive || pending.current) return;
          const local = readLocal(userId);
          if (updatedAt >= local.at) {
            setItems(server);
            writeLocal(userId, server, updatedAt);
          } else if (local.items.length || updatedAt) {
            // This device changed the list while offline: send it up.
            api.saveShopping(local.items).catch(() => {});
          }
        })
        .catch(() => {});
    };
    pull();
    const onShow = () => document.visibilityState === 'visible' && pull();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [synced, userId]);

  // Someone else signed in on this device: show their list, not the last person's.
  useEffect(() => setItems(readLocal(userId).items), [userId]);

  const update = useCallback(
    (fn: (prev: ShopItem[]) => ShopItem[]) => {
      setItems((prev) => {
        const next = fn(prev);
        writeLocal(userId, next, Date.now());
        if (synced) {
          pending.current = true;
          clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            api
              .saveShopping(next)
              .catch(() => {})
              .finally(() => (pending.current = false));
          }, 600);
        }
        return next;
      });
    },
    [synced, userId],
  );

  /** Adds a recipe's ingredients (skipping section headings and anything already on the list). Returns how many were added. */
  const addRecipe = useCallback(
    (r: Recipe, only?: string[]) => {
      const lines = (only || r.ingredients || []).filter((t) => !isGroup(t));
      const have = new Set(itemsRef.current.filter((i) => i.recipeId === r.id && !i.done).map((i) => i.text.toLowerCase()));
      const fresh = lines
        .filter((t) => !have.has(t.toLowerCase()))
        .map((text) => ({ id: newId(), text, done: false, recipeId: r.id, recipe: r.title }));
      if (fresh.length) update((prev) => [...prev, ...fresh]);
      return fresh.length;
    },
    [update],
  );

  return {
    items,
    synced,
    open: items.filter((i) => !i.done).length,
    has: (recipeId: string) => items.some((i) => i.recipeId === recipeId && !i.done),
    addRecipe,
    addText: (text: string) => update((p) => [...p, { id: newId(), text: text.trim(), done: false }]),
    toggle: (id: string) => update((p) => p.map((i) => (i.id === id ? { ...i, done: !i.done } : i))),
    remove: (id: string) => update((p) => p.filter((i) => i.id !== id)),
    removeRecipe: (recipeId: string) => update((p) => p.filter((i) => i.recipeId !== recipeId)),
    clearDone: () => update((p) => p.filter((i) => !i.done)),
    clearAll: () => update(() => []),
  };
}

export type Shopping = ReturnType<typeof useShopping>;
export const ShoppingContext = createContext<Shopping | null>(null);
export const useShoppingList = () => useContext(ShoppingContext)!;
