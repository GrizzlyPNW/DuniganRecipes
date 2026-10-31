import { useEffect, useState } from 'react';

/** Tiny hash router so the phone's back button works: #/recipe/r3, #/family, #/book … */
export type Route =
  | { name: 'home' }
  | { name: 'family' }
  | { name: 'book' }
  | { name: 'admin' }
  | { name: 'invite-family' }
  | { name: 'favorites' }
  | { name: 'shopping' }
  | { name: 'claim'; token: string }
  | { name: 'add' }
  | { name: 'new'; kind: 'photo' | 'type' }
  | { name: 'recipe'; id: string }
  | { name: 'cook'; id: string }
  | { name: 'transcribe'; id: string }
  | { name: 'join'; code: string };

export function parse(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (p[0]) {
    case 'family':
      return { name: 'family' };
    case 'book':
      return { name: 'book' };
    case 'admin':
      return { name: 'admin' };
    case 'favorites':
      return { name: 'favorites' };
    case 'shopping':
      return { name: 'shopping' };
    case 'invite-family':
      return { name: 'invite-family' };
    case 'i':
      return { name: 'claim', token: p[1] || '' };
    case 'add':
      return { name: 'add' };
    case 'new':
      return { name: 'new', kind: p[1] === 'photo' ? 'photo' : 'type' };
    case 'recipe':
      if (p[2] === 'cook') return { name: 'cook', id: p[1] };
      if (p[2] === 'type') return { name: 'transcribe', id: p[1] };
      return { name: 'recipe', id: p[1] };
    case 'join':
      return { name: 'join', code: p.slice(1).join('/') };
    default:
      return { name: 'home' };
  }
}

// Every fresh launch starts on Recipes. Phones and the Google sign-in return can
// reopen the last page; only invite links should land somewhere else.
if (typeof window !== 'undefined' && !/^#\/?(i|join)\//.test(location.hash) && location.hash) {
  history.replaceState(null, '', location.pathname + location.search);
}

// How many in-app steps we can safely go back (so "back" never leaves the site).
let depth = 0;
export const go = (path: string) => {
  depth++;
  location.hash = '#/' + path;
};
export const replace = (path: string) => {
  history.replaceState(null, '', '#/' + path);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};
/** Go back if we came from inside the app, otherwise to a fallback route. */
export const back = (fallback = '') => {
  if (depth > 0) {
    depth--;
    history.back();
  } else replace(fallback);
};

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
