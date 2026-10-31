import { useEffect, useRef, useState } from 'react';
import type { Family } from '../lib/store';
import { back, go } from '../lib/router';
import { useMe } from '../lib/session';
import { AccessGate, Header } from './Account';
import { AppPortal, Layer } from './Stack';
import { groupName, isGroup, isTyped, type Recipe } from '../types';
import { ago, initials, makeContributor, plural } from '../lib/util';
import { Avatar } from './bits';
import { useShoppingList } from '../lib/shopping';

const cardLabel = (r: Recipe, i: number) =>
  r.cardImages.length === 1 ? 'Card' : i === 0 ? 'Front of card' : i === 1 ? 'Back of card' : 'Card ' + (i + 1);

export function RecipePage({
  fam,
  recipe: r,
  toast,
  pickWho,
  scrollTop,
}: {
  fam: Family;
  recipe: Recipe;
  toast: (t: string) => void;
  pickWho: (who: string) => void;
  scrollTop: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const recipeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [lb, setLb] = useState<number | null>(null);
  const [pop, setPop] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // A new recipe (or "Add a story about today") starts at the top with nothing checked.
  useEffect(() => {
    setChecked({});
    box.current?.scrollTo({ top: 0 });
  }, [r.id, scrollTop]);

  const p = fam.contributors[r.contributor] || fam.contributors.none;
  const typed = isTyped(r);
  const meta = [r.temp && ['Oven', r.temp], r.time && ['Time', r.time], r.makes && ['Makes', r.makes]].filter(Boolean) as [string, string][];
  const nChecked = Object.values(checked).filter(Boolean).length;

  const jump = (el: HTMLElement | null) => {
    if (!el || !box.current) return;
    const top = el.getBoundingClientRect().top - box.current.getBoundingClientRect().top + box.current.scrollTop - 96;
    box.current.scrollTo({ top, behavior: 'smooth' });
  };

  const linked = fam.linkByContributor[r.contributor];
  const fav = fam.isFavorite(r.id);
  const favCount = fam.favoriteCount(r.id);

  async function toggleFav() {
    if (fam.access !== 'member') return toast('Sign in to save favorites');
    setPop(true);
    setTimeout(() => setPop(false), 420);
    try {
      await fam.toggleFavorite(r.id);
    } catch {
      toast('Couldn’t save that. Try again.');
    }
  }

  function onFrom() {
    if (r.contributor === 'none') {
      if (fam.admin && fam.access === 'member') setAssigning(true);
      else toast('Know who wrote it? Let Luke know and he’ll add their name.');
      return;
    }
    pickWho(r.contributor);
  }

  return (
    <div className="detail">
      <Header onBack={() => back('')} backLabel="Recipes" />
      <div className="screen" ref={box}>
        <div className="pad">
          <div className="eyebrow">{[r.category, ...(r.alsoIn || [])].join(' · ')}</div>
          <div className="title-row">
            <h1>{r.title}</h1>
            <button
              className={'fav-btn' + (fav ? ' on' : '') + (pop ? ' pop' : '')}
              onClick={toggleFav}
              aria-pressed={fav}
              aria-label={(fav ? 'Remove from favorites' : 'Add to favorites') + ` (${plural(favCount, 'favorite')})`}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 20.5s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.9c0 5.8-7.5 10.2-7.5 10.2Z"
                  fill={fav ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
              </svg>
              {favCount}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="from-btn" onClick={onFrom}>
              {linked?.image ? (
                <img className="pf-img" src={linked.image} alt="" width={30} height={30} referrerPolicy="no-referrer" />
              ) : (
                <Avatar c={p} size={30} font={12} />
              )}
              <span>
                {r.contributor === 'none' ? (
                  <>
                    Not signed · <u>know who wrote it?</u>
                  </>
                ) : (
                  'From the kitchen of ' + p.name
                )}
              </span>
            </button>
            {fam.admin && fam.access === 'member' && r.contributor !== 'none' && (
              <button className="link-btn" onClick={() => setAssigning(true)}>
                Change
              </button>
            )}
          </div>
          <div className="two-btns" style={r.cardImages.length ? undefined : { gridTemplateColumns: '1fr' }}>
            <button className="btn btn-accent" onClick={() => jump(recipeRef.current)}>
              {typed ? 'Go to recipe ↓' : 'Help type it ↓'}
            </button>
            {r.cardImages.length > 0 && (
              <button className="btn btn-outline" onClick={() => jump(cardRef.current)}>
                See the card ↓
              </button>
            )}
          </div>

          <Stories fam={fam} recipe={r} toast={toast} />

          <div ref={recipeRef} className="divider" />
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h2 className="h2">The recipe</h2>
            {typed && (
              <button className="link-btn" onClick={() => go(`recipe/${r.id}/type`)}>
                Edit
              </button>
            )}
          </div>
          {typed ? (
            <>
              {meta.length > 0 && (
                <div className="meta-strip">
                  {meta.map(([k, v]) => (
                    <div key={k}>
                      <div className="k">{k}</div>
                      <div className="v">{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {r.note && <div className="card-note">{r.cardImages.length ? `Note on the card: “${r.note}”` : r.note}</div>}
              <div className="row-between" style={{ margin: '24px 0 4px' }}>
                <h3 className="h3">Ingredients</h3>
                <span className="meta">
                  {nChecked} of {r.ingredients!.filter((t) => !isGroup(t)).length} gathered
                </span>
              </div>
              {r.ingredients!.map((t, i) =>
                isGroup(t) ? (
                  <div key={i} className="ing-group">
                    {groupName(t)}
                  </div>
                ) : (
                <button
                  key={i}
                  className={'ing' + (checked[i] ? ' on' : '')}
                  role="checkbox"
                  aria-checked={!!checked[i]}
                  onClick={() => setChecked({ ...checked, [i]: !checked[i] })}
                >
                  <div className="box">{checked[i] ? '✓' : ''}</div>
                  <span>{t}</span>
                </button>
                ),
              )}
              <ShopButton recipe={r} checked={checked} toast={toast} />
              {r.steps && r.steps.length > 0 && (
                <>
                  <h3 className="h3" style={{ margin: '28px 0 10px' }}>
                    Method
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {(() => {
                      let n = 0;
                      return r.steps.map((t, i) =>
                        isGroup(t) ? (
                          <div key={i} className="ing-group step-group">
                            {groupName(t)}
                          </div>
                        ) : (
                          <div key={i} className="step">
                            <div className="n">{++n}</div>
                            <div className="x">{t}</div>
                          </div>
                        ),
                      );
                    })()}
                  </div>
                  <button className="btn btn-accent btn-block btn-big" style={{ marginTop: 22 }} onClick={() => go(`recipe/${r.id}/cook`)}>
                    Start cooking · step by step
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="dashed">
              <div className="t">This card hasn't been typed up yet</div>
              <div className="s">Read the card below and type it in so it's searchable and works in cook mode.</div>
              <button className="btn btn-outline" style={{ marginTop: 12, height: 44, borderColor: '#2b2521' }} onClick={() => go(`recipe/${r.id}/type`)}>
                I'll type it up
              </button>
            </div>
          )}
        </div>

        {r.cardImages.length > 0 && (
          <>
            <div ref={cardRef} className="pad row-between" style={{ marginTop: 32 }}>
              <span className="label">The original card</span>
              <span className="meta" style={{ fontSize: 12 }}>
                {r.cardImages.length > 1 ? 'Swipe · tap to enlarge' : 'Tap to enlarge'}
              </span>
            </div>
            <div className="hscroll cards">
              {r.cardImages.map((src, i) => (
                <button key={src} className="card-thumb" onClick={() => setLb(i)}>
                  <img src={src} alt={cardLabel(r, i)} loading="lazy" />
                  <div>{cardLabel(r, i)}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {r.cardImages.length === 0 && (
          <div ref={cardRef} className="pad" style={{ marginTop: 28 }}>
            <div className="dashed">
              <div className="t">No photo of the card yet</div>
              <div className="s">Have the original card? Snap a photo of the front and back so it's saved with the recipe.</div>
              <button className="btn btn-outline" style={{ marginTop: 12, height: 44, borderColor: '#2b2521' }} onClick={() => go(`recipe/${r.id}/type`)}>
                Add a photo of the card
              </button>
            </div>
          </div>
        )}
      </div>
      {lb !== null && <Lightbox recipe={r} i={lb} setI={setLb} />}
      <AppPortal>
        <Layer show={assigning} kind="fade" z={45}>
          <AssignSheet fam={fam} recipe={r} close={() => setAssigning(false)} toast={toast} />
        </Layer>
      </AppPortal>
    </div>
  );
}

/** Admin: choose whose kitchen a recipe came from. */
function AssignSheet({ fam, recipe: r, close, toast }: { fam: Family; recipe: Recipe; close: () => void; toast: (t: string) => void }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const cooks = Object.values(fam.contributors)
    .filter((c) => c.id !== 'none')
    .sort((a, b) => a.name.localeCompare(b.name));

  async function assign(id: string, name: string) {
    setBusy(true);
    try {
      await fam.saveRecipe({ ...r, contributor: id, newContributor: fam.isBase(id) ? null : fam.contributors[id] || null });
      toast(id === 'none' ? 'Marked as not signed' : `Now from the kitchen of ${name}`);
      close();
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save that.');
    } finally {
      setBusy(false);
    }
  }
  async function addNew() {
    if (!newName.trim()) return toast('Type their name first');
    setBusy(true);
    try {
      const c = await fam.addContributor(makeContributor(newName, fam.contributors), false);
      await assign(c.id, c.name);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t add them.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog" aria-label="Whose recipe is this?">
        <div className="sheet-grab" />
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 6 }}>
          <h2 className="h2" style={{ fontSize: 22 }}>
            Whose recipe is this?
          </h2>
          <button className="link-btn" onClick={close}>
            Cancel
          </button>
        </div>
        <p className="field-help" style={{ margin: '0 0 8px' }}>
          {r.title}
        </p>
        <div className="assign-list">
          {cooks.map((c) => (
            <button key={c.id} className={'assign-row' + (r.contributor === c.id ? ' on' : '')} disabled={busy} onClick={() => assign(c.id, c.name)}>
              <Avatar c={c} size={36} font={13} />
              <span>
                {c.name}
                {c.rel ? ' · ' + c.rel : ''}
              </span>
              {r.contributor === c.id && <span className="ck">✓</span>}
            </button>
          ))}
          {r.contributor !== 'none' && (
            <button className="assign-row" disabled={busy} onClick={() => assign('none', '')}>
              <Avatar c={fam.contributors.none} size={36} font={13} />
              <span>Not signed / not sure</span>
            </button>
          )}
        </div>
        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="field-label" htmlFor="assign-new">
            Someone not on the list
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="assign-new" className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Aunt Carol" />
            <button className="btn btn-accent" disabled={busy} onClick={addNew}>
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Lightbox({ recipe: r, i, setI }: { recipe: Recipe; i: number; setI: (i: number | null) => void }) {
  const multi = r.cardImages.length > 1;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setI(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setI]);
  return (
    <div className="lightbox" onClick={() => setI(null)} role="dialog" aria-label="Card photo">
      <div className="row-between" style={{ padding: '0 8px', alignItems: 'center' }}>
        <span style={{ font: '500 15px var(--sans)' }}>
          {r.title}
          {multi ? (i === 0 ? ' · front' : ' · back') : ''}
        </span>
        <span style={{ font: '600 14px var(--sans)' }}>Close ✕</span>
      </div>
      <img src={r.cardImages[i]} alt={r.title} />
      {multi && (
        <button
          className="flip"
          onClick={(e) => {
            e.stopPropagation();
            setI((i + 1) % r.cardImages.length);
          }}
        >
          Flip card ↻
        </button>
      )}
    </div>
  );
}

function Stories({ fam, recipe: r, toast }: { fam: Family; recipe: Recipe; toast: (t: string) => void }) {
  const me = useMe();
  const [name, setName] = useState(me?.name || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = [...(fam.storiesByRecipe[r.id] || [])].reverse();
  const ready = name.trim() && text.trim();

  useEffect(() => setText(''), [r.id]);
  useEffect(() => {
    if (me?.name) setName((n) => n || me.name);
  }, [me?.name]);

  async function removeStory(id: string) {
    if (!confirm('Delete this story? This can’t be undone.')) return;
    try {
      await fam.deleteStory(id);
      toast('Story deleted');
    } catch (e) {
      toast((e as Error).message || 'Couldn’t delete the story.');
    }
  }

  async function submit() {
    if (!name.trim()) return toast('Add your name first');
    if (!text.trim()) return toast('Write a few words first');
    setBusy(true);
    try {
      await fam.addStory(r.id, name.trim(), text.trim());
      setText('');
      toast('Story added to ' + r.title);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save the story. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row-between" style={{ margin: '22px 0 4px' }}>
        <h2 className="h2">Family stories</h2>
        <span className="meta">{list.length ? plural(list.length, 'story', 'stories') : ''}</span>
      </div>
      <p className="lead" style={{ fontSize: 14 }}>
        Who made it, when, and what you remember. Anyone in the family can add one.
      </p>
      {fam.access !== 'member' ? (
        <AccessGate fam={fam} toast={toast} what="see and share stories" />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((s) => (
              <div key={s.id} className="story">
                <p>{s.text}</p>
                <div className="story-foot">
                  <div className="ini">{initials(s.authorName)}</div>
                  <span>{s.authorName}</span>
                  <span className="when">· {ago(s.createdAt)}</span>
                  {(fam.admin || (me && s.authorId === me.id)) && (
                    <button className="story-del" onClick={() => removeStory(s.id)} aria-label="Delete this story">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div style={{ padding: '6px 0 4px', font: 'italic 400 17px var(--serif)', color: 'var(--muted)' }}>
                No stories yet. Be the first to share one.
              </div>
            )}
          </div>
          <div className="story-form">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" aria-label="Your name" />
            <textarea
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Share a memory about this recipe…"
              aria-label="Your story"
            />
            <button className="btn" style={{ height: 50, background: ready ? '#a24a2a' : '#b9a999', color: '#fff' }} onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Add my story'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Puts the ingredients on the shopping list. Ingredients ticked as "gathered" are
 * things you already have, so only the rest get added.
 */
function ShopButton({ recipe: r, checked, toast }: { recipe: Recipe; checked: Record<number, boolean>; toast: (t: string) => void }) {
  const shop = useShoppingList();
  const need = (r.ingredients || []).filter((t, i) => !isGroup(t) && !checked[i]);
  const all = (r.ingredients || []).filter((t) => !isGroup(t)).length;
  const onList = shop.has(r.id);

  function add() {
    if (!need.length) return toast('You’ve got everything. Nothing to add.');
    const n = shop.addRecipe(r, need);
    toast(n ? `Added ${plural(n, 'item')} to your shopping list` : 'Those are already on your list');
  }

  return (
    <div className="shop-cta-row">
      <button className="btn btn-outline btn-block shop-cta" onClick={add}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
          <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
        </svg>
        {need.length === all ? 'Add to shopping list' : `Add the ${plural(need.length, 'item')} I still need`}
      </button>
      {onList && (
        <button className="link-btn" onClick={() => go('shopping')}>
          On your list · View ›
        </button>
      )}
    </div>
  );
}
