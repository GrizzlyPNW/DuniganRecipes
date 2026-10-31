import { go } from '../lib/router';
import type { Mode } from '../lib/api';

export type Tab = 'home' | 'favorites' | 'shopping' | 'family' | 'book' | 'admin' | 'invite';

const icons = {
  home: (on: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"
        fill={on ? 'currentColor' : 'none'}
        fillOpacity={on ? 0.15 : 0}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5ZM9 7.5h7M9 11h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  favorites: (on: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.5s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.2-7.5 10.2Z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  family: (on: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8.5" r="3.3" fill={on ? 'currentColor' : 'none'} fillOpacity={on ? 0.15 : 0} stroke="currentColor" strokeWidth="1.8" />
      <path d="M2.8 19.5c.9-3.4 3.3-5.3 6.2-5.3s5.3 1.9 6.2 5.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 5.6a3.1 3.1 0 0 1 0 6M17.6 14.4c1.8.6 3.1 2.3 3.6 5.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  shopping: (on: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.4"
        fill={on ? 'currentColor' : 'none'}
        fillOpacity={on ? 0.15 : 0}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  ),
  book: (on: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"
        fill={on ? 'currentColor' : 'none'}
        fillOpacity={on ? 0.15 : 0}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 6.5V20" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
};

export function TabBar({ tab, listCount = 0 }: { tab: Tab; listCount?: number }) {
  const item = (k: 'home' | 'favorites' | 'shopping' | 'family' | 'book', label: string, path: string, badge = 0) => (
    <button
      className={'tab' + (tab === k ? ' on' : '')}
      onClick={() => tab !== k && go(path)}
      aria-current={tab === k ? 'page' : undefined}
      aria-label={badge ? `${label}, ${badge} to get` : undefined}
    >
      {icons[k](tab === k)}
      {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      {item('home', 'Recipes', '')}
      {item('favorites', 'Favorites', 'favorites')}
      <div className="tab-add-wrap">
        <button className="tab-add" onClick={() => go('add')} aria-label="Add a recipe">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {item('shopping', 'List', 'shopping', listCount)}
      {item('family', 'Family', 'family')}
    </nav>
  );
}

export function Menu({
  tab,
  count,
  mode,
  admin,
  close,
}: {
  tab: Tab;
  count: number;
  mode: Mode | null;
  admin: boolean;
  close: () => void;
}) {
  const items: [string, Tab | 'add', string, string][] = [
    ['', 'home', 'Recipes', count + ' cards in the box'],
    ['family', 'family', 'Family', 'Whose kitchen it came from'],
    ['book', 'book', 'Book', "Mom's note · print a copy"],
    ['add', 'add', 'Add Recipe', 'Photograph or type a card'],
  ];
  items.splice(1, 0, ['favorites', 'favorites', 'Favorites', 'Recipes you’ve hearted']);
  items.splice(2, 0, ['shopping', 'shopping', 'Shopping list', 'What to pick up at the store']);
  if (admin && mode === 'shared') {
    items.push(['invite-family', 'invite', 'Invite family', 'Text each cook their own link']);
    items.push(['admin', 'admin', 'Manage family', 'Who’s in the box']);
  }
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="drawer" role="dialog" aria-label="Menu">
        <div className="row-between" style={{ alignItems: 'center' }}>
          <span className="eyebrow">The Dunigan Kitchen</span>
          <button className="x" onClick={close} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
          {items.map(([path, k, label, sub]) => (
            <button
              key={k}
              className={'menu-item' + (tab === k ? ' on' : '')}
              onClick={() => {
                close();
                go(path);
              }}
            >
              <div>
                <div className="t">{label}</div>
                <div className="s">{sub}</div>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
        <div className="drawer-foot">
          {mode === 'local'
            ? 'Stories are saved on this device only until the family database is connected.'
            : 'Stories are shared with the whole family.'}
        </div>
      </div>
    </>
  );
}
