import { useState } from 'react';
import { go } from '../lib/router';
import { useShoppingList, type ShopItem } from '../lib/shopping';
import { plural } from '../lib/util';

/** The shopping list: a checklist grouped by recipe, plus anything typed in by hand. */
export function ShoppingPage({ toast }: { toast: (t: string) => void }) {
  const shop = useShoppingList();
  const [text, setText] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  // Hand-typed items first, then one group per recipe in the order they were added.
  const groups: { key: string; title: string | null; recipeId?: string; items: ShopItem[] }[] = [];
  const mine = shop.items.filter((i) => !i.recipeId);
  if (mine.length) groups.push({ key: 'mine', title: null, items: mine });
  for (const i of shop.items) {
    if (!i.recipeId) continue;
    let g = groups.find((x) => x.recipeId === i.recipeId);
    if (!g) groups.push((g = { key: i.recipeId, title: i.recipe || 'Recipe', recipeId: i.recipeId, items: [] }));
    g.items.push(i);
  }
  const doneCount = shop.items.length - shop.open;

  function add() {
    const t = text.trim();
    if (!t) return;
    // Pasting several lines adds several items.
    for (const line of t.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)) shop.addText(line);
    setText('');
  }

  async function share() {
    const body = groups
      .map((g) => {
        const open = g.items.filter((i) => !i.done);
        if (!open.length) return '';
        return (g.title ? g.title + '\n' : '') + open.map((i) => '☐ ' + i.text).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
    if (!body) return toast('Nothing left to buy');
    const textOut = 'Shopping list\n\n' + body;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ text: textOut });
      else {
        await navigator.clipboard.writeText(textOut);
        toast('List copied. Paste it into a text.');
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="screen with-tabs pad">
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">To buy</div>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Shopping list
          </h1>
        </div>
        {shop.items.length > 0 && (
          <button className="link-btn" onClick={share} style={{ marginBottom: 10 }}>
            Share
          </button>
        )}
      </div>
      <p className="lead" style={{ marginBottom: 14 }}>
        {shop.items.length
          ? `${plural(shop.open, 'item')} to get${doneCount ? ` · ${doneCount} in the cart` : ''}.`
          : 'Add anything you need, or open a recipe and tap “Add to shopping list.”'}
      </p>

      <div className="shop-add">
        <input
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add an item, like paper towels"
          aria-label="Add an item"
          enterKeyHint="done"
        />
        <button className="btn btn-accent" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>

      {groups.map((g) => {
        // Unchecked first; checked sink to the bottom of their group.
        const sorted = [...g.items.filter((i) => !i.done), ...g.items.filter((i) => i.done)];
        return (
          <section key={g.key} className="shop-group">
            {g.title && (
              <div className="shop-group-head">
                <button className="link-btn shop-recipe" onClick={() => go('recipe/' + g.recipeId)}>
                  {g.title} ›
                </button>
                <button className="link-btn shop-remove" onClick={() => shop.removeRecipe(g.recipeId!)} aria-label={'Remove ' + g.title + ' from the list'}>
                  Remove
                </button>
              </div>
            )}
            {sorted.map((i) => (
              <div key={i.id} className={'shop-item' + (i.done ? ' done' : '')}>
                <button className="shop-check" role="checkbox" aria-checked={i.done} onClick={() => shop.toggle(i.id)}>
                  <span className="box">{i.done ? '✓' : ''}</span>
                  <span className="txt">{i.text}</span>
                </button>
                <button className="shop-x" onClick={() => shop.remove(i.id)} aria-label={'Delete ' + i.text}>
                  ✕
                </button>
              </div>
            ))}
          </section>
        );
      })}

      {shop.items.length > 0 && (
        <div className="two-btns" style={{ marginTop: 22 }}>
          <button className="btn btn-outline" onClick={shop.clearDone} disabled={!doneCount}>
            Clear checked{doneCount ? ` (${doneCount})` : ''}
          </button>
          {confirmAll ? (
            <button
              className="btn btn-dark"
              onClick={() => {
                shop.clearAll();
                setConfirmAll(false);
                toast('List cleared');
              }}
            >
              Yes, clear everything
            </button>
          ) : (
            <button className="btn btn-outline" onClick={() => setConfirmAll(true)}>
              Clear all
            </button>
          )}
        </div>
      )}

      {!shop.synced && shop.items.length > 0 && (
        <p className="field-help" style={{ marginTop: 14 }}>
          Saved on this device. Sign in to keep it on all your devices.
        </p>
      )}
    </div>
  );
}
