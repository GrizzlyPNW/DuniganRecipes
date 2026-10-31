import { useMemo, useState } from 'react';
import type { Family } from '../lib/store';
import { CATEGORIES, isBaseContributor } from '../lib/store';
import { back, go, replace } from '../lib/router';
import { compressImage } from '../lib/image';
import { makeContributor, newId, parseIngredients, parseSteps } from '../lib/util';
import { groupName, isGroup, type Recipe } from '../types';
import { useMe } from '../lib/session';
import { AccessGate, Header } from './Account';

export function AddChooser({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  return (
    <div className="overlay-page">
      <Header onBack={() => back('')} backLabel="Recipes" />
      <div className="screen pad">
        <h1 className="h1" style={{ fontSize: 30 }}>
          Add a card to the box
        </h1>
        {fam.access !== 'member' ? (
          <AccessGate fam={fam} toast={toast} what="add recipes" />
        ) : (
          <AddOptions />
        )}
      </div>
    </div>
  );
}

function AddOptions() {
  return (
    <>
        <button className="big-option dark" onClick={() => go('new/photo')}>
          <div className="t">Photograph a card</div>
          <div className="s">Shoot the front, then the back. The photos go on the recipe page, and the family can type it up later.</div>
        </button>
        <button className="big-option light" onClick={() => go('new/type')}>
          <div className="t">Type it in</div>
          <div className="s">For recipes you know by heart.</div>
        </button>
    </>
  );
}

type Kind = 'photo' | 'type' | 'transcribe';

/** One form for: photographing a new card, typing a new recipe, or typing up an existing card. */
export function RecipeForm({ fam, kind, existing, toast }: { fam: Family; kind: Kind; existing?: Recipe; toast: (t: string) => void }) {
  const P = fam.contributors;
  const me = useMe();
  const cooks = useMemo(() => Object.values(P).filter((c) => c.id !== 'none').sort((a, b) => a.name.localeCompare(b.name)), [P]);
  // New recipes live under the person adding them: their linked cook, or "Me" (creates one).
  const canBeMe = !!me && !fam.myContributor && fam.mode === 'shared';
  const defaultWho = existing
    ? existing.contributor === 'none'
      ? ''
      : existing.contributor
    : fam.myContributor || (canBeMe ? '__me' : '');

  const [title, setTitle] = useState(existing?.title || '');
  const [category, setCategory] = useState(existing?.category || '');
  const [alsoIn, setAlsoIn] = useState<string[]>(existing?.alsoIn || []);
  const [who, setWho] = useState(defaultWho);
  const [newCook, setNewCook] = useState('');
  const [photos, setPhotos] = useState<(File | null)[]>([null, null]);
  const [temp, setTemp] = useState(existing?.temp || '');
  const [time, setTime] = useState(existing?.time || '');
  const [makes, setMakes] = useState(existing?.makes || '');
  const [note, setNote] = useState(existing?.note || '');
  const [ings, setIngs] = useState((existing?.ingredients || []).join('\n'));
  const [steps, setSteps] = useState((existing?.steps || []).join('\n'));
  const [showTyping, setShowTyping] = useState(kind !== 'photo');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const previews = useMemo(() => photos.map((f) => (f ? URL.createObjectURL(f) : null)), [photos]);

  const heading = kind === 'photo' ? 'Photograph a card' : kind === 'type' ? 'Type it in' : existing?.cardImages.length ? 'Type up this card' : 'Edit recipe';

  async function save() {
    if (!title.trim()) return toast('Give the recipe a name first');
    if (!category) return toast('Pick a category');
    if (kind === 'photo' && !photos[0]) return toast('Add a photo of the front of the card');
    if (who === '__new' && !newCook.trim()) return toast('Type the cook’s name');
    const ingredients = parseIngredients(ings);
    const stepList = parseSteps(steps);
    if (showTyping && kind !== 'photo' && (!ingredients.some((t) => !isGroup(t)) || !stepList.some((t) => !isGroup(t))))
      return toast('Add at least one ingredient and one step');

    setBusy(true);
    try {
      let contributor = who || 'none';
      // Cooks added by the family (not in the original list) travel with each recipe that names them.
      let newContributor = P[contributor] && !isBaseContributor(contributor) ? P[contributor] : null;
      if (who === '__new') {
        newContributor = await fam.addContributor(makeContributor(newCook, P), false);
        contributor = newContributor.id;
      } else if (who === '__me' && me) {
        newContributor = await fam.addContributor(makeContributor(me.name, P), true);
        contributor = newContributor.id;
      }

      const uploaded: string[] = [];
      for (const f of photos) {
        if (!f) continue;
        toast(`Uploading photo ${uploaded.length + 1}…`);
        uploaded.push(await fam.uploadPhoto(await compressImage(f)));
      }

      const r: Recipe = {
        id: existing?.id || newId(),
        title: title.trim(),
        category,
        alsoIn: alsoIn.filter((c) => c !== category).length ? alsoIn.filter((c) => c !== category) : null,
        contributor,
        newContributor,
        cardImages: [...(existing?.cardImages || []), ...uploaded],
        temp: temp.trim() || null,
        time: time.trim() || null,
        makes: makes.trim() || null,
        note: note.trim() || null,
        ingredients: ingredients.length ? ingredients : null,
        steps: stepList.length ? stepList : null,
      };
      await fam.saveRecipe(r);
      toast(existing ? 'Saved. Thank you!' : 'Added to the box');
      replace('recipe/' + r.id);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const setPhoto = (i: number, f: File | null) => setPhotos((p) => p.map((x, j) => (j === i ? f : x)));

  if (fam.access !== 'member') {
    return (
      <div className="overlay-page">
        <Header onBack={() => back(existing ? 'recipe/' + existing.id : '')} backLabel="Back" />
        <div className="screen pad">
          <h1 className="h1" style={{ fontSize: 30 }}>
            {heading}
          </h1>
          <AccessGate fam={fam} toast={toast} what="add and edit recipes" />
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-page">
      <Header onBack={() => back(existing ? 'recipe/' + existing.id : 'add')} backLabel={existing ? 'Recipe' : 'Add'} />
      <div className="screen pad" style={{ paddingBottom: 0 }}>
        <div className="eyebrow">{existing ? existing.title : 'Add Recipe'}</div>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {heading}
        </h1>

        {existing && existing.cardImages.length > 0 && (
          <div className="form-group">
            <span className="field-label">The card (tap to enlarge)</span>
            <div className="hscroll" style={{ gap: 10 }}>
              {existing.cardImages.map((src) => (
                <button key={src} className="card-thumb" onClick={() => setLightbox(src)}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          </div>
        )}

        {(kind !== 'transcribe' || (existing && existing.cardImages.length === 0)) && (
          <div className="form-group">
            <span className="field-label">
              {kind === 'photo' ? 'Photos of the card' : existing ? 'Have the original card? Add a photo (optional)' : 'Photo of the card (optional)'}
            </span>
            <div className="photo-slots">
              {['Front', 'Back'].map((side, i) => (
                <label key={side} className="photo-slot">
                  {previews[i] ? (
                    <>
                      <img src={previews[i]!} alt={side} />
                      <button
                        className="remove"
                        onClick={(e) => {
                          e.preventDefault();
                          setPhoto(i, null);
                        }}
                        aria-label={'Remove ' + side.toLowerCase() + ' photo'}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span>+ {side}</span>
                      <small>{i === 0 ? 'Take or choose a photo' : 'Optional'}</small>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(i, e.target.files?.[0] || null)} />
                    </>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="field-label" htmlFor="f-title">
            Recipe name
          </label>
          <input id="f-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Grandma's Apple Pie" />
        </div>
        <div className="form-group">
          <label className="field-label" htmlFor="f-cat">
            Category
          </label>
          <select id="f-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {category && (
            <>
              <span className="field-label" style={{ display: 'block', margin: '14px 0 8px' }}>
                Also show it under (optional)
              </span>
              <div className="also-chips">
                {CATEGORIES.filter((c) => c !== category).map((c) => {
                  const on = alsoIn.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className={'chip chip-sm' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() => setAlsoIn(on ? alsoIn.filter((x) => x !== c) : [...alsoIn, c])}
                    >
                      {on ? '✓ ' : '+ '}
                      {c}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="form-group">
          <label className="field-label" htmlFor="f-who">
            Whose kitchen is it from?
          </label>
          <select id="f-who" className="field" value={who} onChange={(e) => setWho(e.target.value)}>
            {canBeMe && <option value="__me">Me ({me!.name})</option>}
            {cooks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.rel ? ' · ' + c.rel : ''}
                {c.id === fam.myContributor ? ' (me)' : ''}
              </option>
            ))}
            <option value="">Not sure / not signed</option>
            <option value="__new">Someone else…</option>
          </select>
          {who === '__new' && (
            <input className="field" style={{ marginTop: 8 }} value={newCook} onChange={(e) => setNewCook(e.target.value)} placeholder="Their name, e.g. Aunt Carol" />
          )}
        </div>

        {kind === 'photo' && !showTyping && (
          <button className="btn btn-outline btn-block" style={{ marginBottom: 16 }} onClick={() => setShowTyping(true)}>
            Type the recipe too (optional)
          </button>
        )}

        {showTyping && (
          <>
            <div className="three form-group">
              <div>
                <label className="field-label" htmlFor="f-temp">
                  Oven
                </label>
                <input id="f-temp" className="field" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="350°" />
              </div>
              <div>
                <label className="field-label" htmlFor="f-time">
                  Time
                </label>
                <input id="f-time" className="field" value={time} onChange={(e) => setTime(e.target.value)} placeholder="1 hr" />
              </div>
              <div>
                <label className="field-label" htmlFor="f-makes">
                  Makes
                </label>
                <input id="f-makes" className="field" value={makes} onChange={(e) => setMakes(e.target.value)} placeholder="2 loaves" />
              </div>
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="f-ing">
                Ingredients
              </label>
              <textarea id="f-ing" className="field" rows={7} value={ings} onChange={(e) => setIngs(e.target.value)} placeholder={'One per line\n1 c sugar\n2 eggs'} />
              <p className="field-help">One per line. For a part like a topping, put its name on its own line ending in a colon, like “Topping:”.</p>
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="f-steps">
                Steps
              </label>
              <textarea id="f-steps" className="field" rows={7} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'One step per line\nMix the butter and sugar.\nBake at 350° for 12 min.'} />
              <p className="field-help">
                One step per line. Part names on their own line (like “Caramel sauce”) become headings, not steps. Times like “12 min”
                get a timer in cook mode.
              </p>
              <StepPreview text={steps} />
            </div>
            <div className="form-group">
              <label className="field-label" htmlFor="f-note">
                Note on the card (optional)
              </label>
              <input id="f-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Roast the hazelnuts first!" />
            </div>
          </>
        )}

        <div className="form-bar">
          <button className="btn btn-outline" onClick={() => back(existing ? 'recipe/' + existing.id : 'add')} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-accent" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save recipe' : 'Add to the box'}
          </button>
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div style={{ textAlign: 'right', font: '600 14px var(--sans)', padding: '0 8px' }}>Close ✕</div>
          <img src={lightbox} alt="Card" />
        </div>
      )}
    </div>
  );
}

/** Shows how the typed steps will look: headings for parts, numbers for steps. */
function StepPreview({ text }: { text: string }) {
  const list = useMemo(() => parseSteps(text), [text]);
  if (!list.some(isGroup)) return null;
  let n = 0;
  return (
    <div className="step-preview" aria-label="Preview of the steps">
      <div className="field-label" style={{ marginBottom: 6 }}>
        Preview
      </div>
      {list.map((t, i) =>
        isGroup(t) ? (
          <div key={i} className="ing-group" style={{ margin: '10px 0 2px' }}>
            {groupName(t)}
          </div>
        ) : (
          <div key={i} className="sp-step">
            <b>{++n}</b> {t.length > 70 ? t.slice(0, 70) + '…' : t}
          </div>
        ),
      )}
    </div>
  );
}
