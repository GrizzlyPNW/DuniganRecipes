import type { Family } from '../lib/store';
import { CATEGORIES } from '../lib/store';
import { go } from '../lib/router';
import { isTyped } from '../types';
import { plural } from '../lib/util';
import { Avatar } from './bits';

export interface Filters {
  query: string;
  cat: string | null;
  who: string | null;
}

export function Home({ fam, f, setF }: { fam: Family; f: Filters; setF: (f: Filters) => void }) {
  const q = f.query.trim().toLowerCase();
  const { recipes, contributors: P, storiesByRecipe } = fam;

  const list = q
    ? recipes.filter((r) =>
        [r.title, P[r.contributor]?.name, r.category, ...(r.ingredients || [])].join(' ').toLowerCase().includes(q),
      )
    : recipes.filter((r) => (!f.cat || r.category === f.cat) && (!f.who || r.contributor === f.who));
  list.sort((a, b) => a.title.localeCompare(b.title));

  const used = [...new Set(recipes.map((r) => r.contributor))].filter((k) => k !== 'none' && P[k]);
  const cats = CATEGORIES.filter((c) => recipes.some((r) => r.category === c));

  return (
    <div className="screen with-tabs">
      <div className="pad">
        <div className="eyebrow">The Dunigan Kitchen</div>
        <h1 className="h1">What are we cooking today?</h1>
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
      </div>

      {!q && (
        <>
          <button className="note-card" onClick={() => go('book')}>
            <q>From my kitchen to yours, these recipes hold so much more than ingredients.</q>
            <div>Mom's note · open the book →</div>
          </button>
          <div className="label pad" style={{ margin: '24px 0 10px' }}>
            Whose kitchen?
          </div>
          <div className="hscroll cooks">
            {used.map((k) => (
              <button
                key={k}
                className="cook"
                aria-pressed={f.who === k}
                onClick={() => setF({ ...f, who: f.who === k ? null : k, query: '' })}
              >
                <div style={{ borderRadius: '50%', boxShadow: f.who === k ? '0 0 0 3px #f7f2e8, 0 0 0 5px #a24a2a' : 'none' }}>
                  <Avatar c={P[k]} size={54} font={17} />
                </div>
                <span>{P[k].short}</span>
              </button>
            ))}
          </div>
          <div className="hscroll chips">
            {[null, ...cats].map((c) => (
              <button key={c || 'all'} className={'chip' + (f.cat === c ? ' on' : '')} onClick={() => setF({ ...f, cat: c })}>
                {c || 'All ' + recipes.length}
              </button>
            ))}
          </div>
        </>
      )}

      {f.who && !q && (
        <div className="who-banner">
          <span>
            From the kitchen of <b>{P[f.who]?.name}</b>
          </span>
          <button className="link-btn" onClick={() => setF({ ...f, who: null })}>
            Clear
          </button>
        </div>
      )}

      <div className="list-head row-between">
        <span className="t">{q ? 'Results' : f.cat || 'All recipes'}</span>
        <span className="meta">{plural(list.length, 'card')}</span>
      </div>
      <div className="pad">
        {list.map((r) => {
          const n = storiesByRecipe[r.id]?.length || 0;
          const p = P[r.contributor];
          return (
            <button key={r.id} className="recipe-row" onClick={() => go('recipe/' + r.id)}>
              {r.cardImages[0] ? (
                <img className="thumb" src={r.cardImages[0]} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="s">
                  {r.contributor !== 'none' && p ? p.name + ' · ' : ''}
                  {isTyped(r) ? r.category : 'Card only · needs typing'}
                </div>
              </div>
              {n > 0 && <div className="n">{plural(n, 'story', 'stories')}</div>}
            </button>
          );
        })}
        {list.length === 0 && <div className="italic-empty">Nothing in the box matches that yet.</div>}
      </div>
    </div>
  );
}
