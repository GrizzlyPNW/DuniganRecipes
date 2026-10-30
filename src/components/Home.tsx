import { useState } from 'react';
import type { Family } from '../lib/store';
import { CATEGORIES } from '../lib/store';
import { go } from '../lib/router';
import { isTyped } from '../types';
import { plural } from '../lib/util';
import { Avatar } from './bits';
import { AppPortal, Layer } from './Stack';

export interface Filters {
  query: string;
  cat: string | null;
  who: string | null;
}

export function Home({ fam, f, setF, favorites = false }: { fam: Family; f: Filters; setF: (f: Filters) => void; favorites?: boolean }) {
  const [sheet, setSheet] = useState<'cook' | 'cat' | null>(null);
  const q = f.query.trim().toLowerCase();
  const { recipes, contributors: P, storiesByRecipe } = fam;

  const pool = favorites ? recipes.filter((r) => fam.isFavorite(r.id)) : recipes;
  const list = pool.filter(
    (r) =>
      (!f.cat || r.category === f.cat) &&
      (!f.who || r.contributor === f.who) &&
      (!q || [r.title, P[r.contributor]?.name, r.category, ...(r.ingredients || [])].join(' ').toLowerCase().includes(q)),
  );
  list.sort((a, b) => a.title.localeCompare(b.title));

  const cooks = [...new Set(recipes.map((r) => r.contributor))]
    .filter((k) => P[k])
    .sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : P[a].name.localeCompare(P[b].name)));
  const cats = CATEGORIES.filter((c) => recipes.some((r) => r.category === c));
  const filtered = !!(f.cat || f.who);

  return (
    <div className="screen with-tabs">
      <div className="pad">
        <h1 className="h1" style={{ marginTop: 0 }}>
          {favorites ? 'Your favorites' : 'What are we cooking today?'}
        </h1>
        <label className="search">
          <span className="lens" />
          <input
            type="search"
            value={f.query}
            onChange={(e) => setF({ ...f, query: e.target.value })}
            placeholder="Search recipes, cooks, ingredients"
            aria-label="Search recipes"
            enterKeyHint="search"
          />
          {f.query && (
            <button className="clear" onClick={() => setF({ ...f, query: '' })} aria-label="Clear search">
              ✕
            </button>
          )}
        </label>

        <div className="filter-btns">
          <button className={'filter-btn' + (f.who ? ' on' : '')} onClick={() => setSheet('cook')}>
            {f.who && P[f.who] ? <Avatar c={P[f.who]} size={22} font={10} /> : <CookIcon />}
            <span>{f.who && P[f.who] ? P[f.who].short : 'Cook: Anyone'}</span>
            <Caret />
          </button>
          <button className={'filter-btn' + (f.cat ? ' on' : '')} onClick={() => setSheet('cat')}>
            <span>{f.cat || 'Category: All'}</span>
            <Caret />
          </button>
        </div>

        {filtered && (
          <div className="active-filters" aria-live="polite">
            <span className="af-label">Filtered by</span>
            {f.who && P[f.who] && (
              <button className="af-chip" onClick={() => setF({ ...f, who: null })} aria-label={'Remove filter ' + P[f.who].name}>
                {P[f.who].name} <b>✕</b>
              </button>
            )}
            {f.cat && (
              <button className="af-chip" onClick={() => setF({ ...f, cat: null })} aria-label={'Remove filter ' + f.cat}>
                {f.cat} <b>✕</b>
              </button>
            )}
            <button className="link-btn" onClick={() => setF({ ...f, who: null, cat: null })}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {!q && !filtered && !favorites && (
        <button className="note-card" onClick={() => go('book')}>
          <q>From my kitchen to yours, these recipes hold so much more than ingredients.</q>
          <div>Mom's note · open the book →</div>
        </button>
      )}

      <div className="list-head row-between">
        <span className="t">{q ? 'Results' : favorites ? 'Hearted recipes' : f.who && P[f.who] ? 'From ' + P[f.who].short + '’s kitchen' : f.cat || 'All recipes'}</span>
        <span className="meta">{plural(list.length, 'card')}</span>
      </div>
      <div className="pad">
        {list.map((r) => {
          const n = storiesByRecipe[r.id]?.length || 0;
          const hearts = fam.favoriteCount(r.id);
          const p = P[r.contributor];
          return (
            <button key={r.id} className="recipe-row" onClick={() => go('recipe/' + r.id)}>
              {r.cardImages[0] ? <img className="thumb" src={r.cardImages[0]} alt="" loading="lazy" /> : <div className="thumb" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="s">
                  {r.contributor !== 'none' && p ? p.name + ' · ' : ''}
                  {isTyped(r) ? r.category : 'Card only · needs typing'}
                </div>
              </div>
              <div className="row-badges">
                {hearts > 0 && (
                  <span className={'heart-badge' + (fam.isFavorite(r.id) ? ' mine' : '')} aria-label={plural(hearts, 'favorite')}>
                    ♥ {hearts}
                  </span>
                )}
                {n > 0 && <span className="n">{plural(n, 'story', 'stories')}</span>}
              </div>
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="italic-empty">
            {favorites && !q && !filtered ? 'Tap the ♥ on any recipe to keep it here.' : 'Nothing in the box matches that yet.'}
          </div>
        )}
      </div>

      <AppPortal>
      <Layer show={!!sheet} kind="fade" z={45}>
        <div className="scrim" onClick={() => setSheet(null)} />
        <div className="sheet" role="dialog" aria-label={sheet === 'cook' ? 'Choose a cook' : 'Choose a category'}>
          <div className="sheet-grab" />
          <div className="row-between" style={{ alignItems: 'center', marginBottom: 14 }}>
            <h2 className="h2" style={{ fontSize: 22 }}>
              {sheet === 'cook' ? 'Whose kitchen?' : 'Category'}
            </h2>
            <button className="link-btn" onClick={() => setSheet(null)}>
              Done
            </button>
          </div>
          {sheet === 'cook' ? (
            <div className="cook-grid">
              <button className={'cook-opt' + (!f.who ? ' on' : '')} onClick={() => (setF({ ...f, who: null, query: '' }), setSheet(null))}>
                <span className="avatar any">All</span>
                <span className="nm">Anyone</span>
                <span className="ct">{recipes.length}</span>
              </button>
              {cooks.map((k) => (
                <button
                  key={k}
                  className={'cook-opt' + (f.who === k ? ' on' : '')}
                  onClick={() => (setF({ ...f, who: k, query: '' }), setSheet(null))}
                >
                  <Avatar c={P[k]} size={52} font={17} />
                  <span className="nm">{k === 'none' ? 'Unsigned' : P[k].short}</span>
                  <span className="ct">{recipes.filter((r) => r.contributor === k).length}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="cat-grid">
              {[null, ...cats].map((c) => (
                <button key={c || 'all'} className={'cat-opt' + (f.cat === c ? ' on' : '')} onClick={() => (setF({ ...f, cat: c }), setSheet(null))}>
                  <span>{c || 'All categories'}</span>
                  <span className="ct">{c ? recipes.filter((r) => r.category === c).length : recipes.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Layer>
      </AppPortal>
    </div>
  );
}

const Caret = () => (
  <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden style={{ flex: 'none' }}>
    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden style={{ flex: 'none' }}>
    <path d="M7 14h10v5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M7 14c-2.5 0-4-1.8-4-4a4 4 0 0 1 5-3.9A4.5 4.5 0 0 1 16 6.1 4 4 0 0 1 21 10c0 2.2-1.5 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);
