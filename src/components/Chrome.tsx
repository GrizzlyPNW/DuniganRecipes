import { go } from '../lib/router';
import type { Mode } from '../lib/api';

type Tab = 'home' | 'family' | 'book';

export function TabBar({ tab }: { tab: Tab }) {
  return (
    <nav className="tabbar">
      <button className={'tab' + (tab === 'home' ? ' on' : '')} onClick={() => go('')}>
        Recipes
        <span className="dot" />
      </button>
      <button className="tab" onClick={() => go('add')} aria-label="Add recipe">
        <span className="tab-add">
          <b>+</b>Add Recipe
        </span>
      </button>
      <button className={'tab' + (tab === 'family' ? ' on' : '')} onClick={() => go('family')}>
        Family
        <span className="dot" />
      </button>
    </nav>
  );
}

export function Menu({ tab, count, mode, close }: { tab: Tab; count: number; mode: Mode | null; close: () => void }) {
  const items: [string, Tab | 'add', string, string][] = [
    ['', 'home', 'Recipes', count + ' cards in the box'],
    ['family', 'family', 'Family', 'Whose kitchen it came from'],
    ['book', 'book', 'Book', "Mom's note · print a copy"],
    ['add', 'add', 'Add Recipe', 'Photograph or type a card'],
  ];
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
