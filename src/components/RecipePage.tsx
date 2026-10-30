import { useEffect, useRef, useState } from 'react';
import type { Family } from '../lib/store';
import { savedName } from '../lib/store';
import { back, go } from '../lib/router';
import { isTyped, type Recipe } from '../types';
import { ago, initials, plural } from '../lib/util';
import { Avatar } from './bits';

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
    const top = el.getBoundingClientRect().top - box.current.getBoundingClientRect().top + box.current.scrollTop - 80;
    box.current.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div className="detail">
      <div className="screen" ref={box}>
        <div className="pad">
          <div className="eyebrow">{r.category}</div>
          <h1>{r.title}</h1>
          <button className="from-btn" onClick={() => r.contributor !== 'none' && pickWho(r.contributor)}>
            <Avatar c={p} size={30} font={12} />
            <span>{r.contributor === 'none' ? 'Not signed · know who wrote it?' : 'From the kitchen of ' + p.name}</span>
          </button>
          <div className="two-btns">
            <button className="btn btn-accent" onClick={() => jump(recipeRef.current)}>
              {typed ? 'Go to recipe ↓' : 'Help type it ↓'}
            </button>
            <button className="btn btn-outline" onClick={() => jump(cardRef.current)}>
              See the card ↓
            </button>
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
              {r.note && <div className="card-note">Note on the card: “{r.note}”</div>}
              <div className="row-between" style={{ margin: '24px 0 4px' }}>
                <h3 className="h3">Ingredients</h3>
                <span className="meta">
                  {nChecked} of {r.ingredients!.length} gathered
                </span>
              </div>
              {r.ingredients!.map((t, i) => (
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
              ))}
              {r.steps && r.steps.length > 0 && (
                <>
                  <h3 className="h3" style={{ margin: '28px 0 10px' }}>
                    Method
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {r.steps.map((t, i) => (
                      <div key={i} className="step">
                        <div className="n">{i + 1}</div>
                        <div className="x">{t}</div>
                      </div>
                    ))}
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
        {r.cardImages.length === 0 && <div ref={cardRef} />}
      </div>
      <div className="top-fade" />
      <button className="back-pill" onClick={() => back('')}>
        ‹ Recipes
      </button>
      {lb !== null && <Lightbox recipe={r} i={lb} setI={setLb} />}
    </div>
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
  const [name, setName] = useState(savedName);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = [...(fam.storiesByRecipe[r.id] || [])].reverse();
  const ready = name.trim() && text.trim();

  useEffect(() => setText(''), [r.id]);

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
      {!fam.joined && fam.mode === 'shared' ? (
        <JoinBox fam={fam} toast={toast} />
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

export function JoinBox({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!code.trim()) return toast('Type the family code first');
    setBusy(true);
    const ok = await fam.join(code).catch(() => false);
    setBusy(false);
    toast(ok ? 'Welcome to the family box' : 'That code didn’t match');
  }
  return (
    <div className="join-box">
      <div className="t">Join the family to see stories</div>
      <p className="field-help" style={{ margin: '4px 0 12px' }}>
        Open the invite link someone in the family sent you, or type the family code here.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Family code" aria-label="Family code" autoCapitalize="off" />
        <button className="btn btn-accent" onClick={submit} disabled={busy}>
          {busy ? '…' : 'Join'}
        </button>
      </div>
    </div>
  );
}
