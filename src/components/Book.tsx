import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Family } from '../lib/store';
import { groupName, isGroup, isTyped } from '../types';
import { MOM_NOTE } from './bits';

type Opts = { cards: boolean; typed: boolean; stories: boolean };

export function Book({ fam, toast }: { fam: Family; toast: (t: string) => void }) {
  const [opts, setOpts] = useState<Opts>({ cards: true, typed: true, stories: true });
  const [printing, setPrinting] = useState(false);

  async function exportPdf() {
    toast(`Preparing your book: ${fam.recipes.length} recipes…`);
    setPrinting(true);
    // Wait for the print pages to render and their photos to load before opening the print dialog.
    await new Promise((r) => setTimeout(r, 50));
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.print-book img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r))))));
    // Phones may return from print() before the dialog closes, so clear the pages afterwards.
    window.addEventListener('afterprint', () => setPrinting(false), { once: true });
    window.print();
  }

  const rows: [keyof Opts, string][] = [
    ['cards', 'Original card photos'],
    ['typed', 'Typed recipe'],
    ['stories', 'Family stories'],
  ];

  return (
    <div className="screen with-tabs pad">
      <div className="eyebrow">The book</div>
      <h1 className="h1" style={{ marginBottom: 18 }}>
        Print a copy
      </h1>
      <div className="cover">
        <div className="a">A Family Recipe Book</div>
        <div className="b">Collected with love over 50 years</div>
        <div className="c">First Edition</div>
      </div>
      <div className="mom-note">
        <p>{MOM_NOTE}</p>
        <div>With all my love, Mom</div>
      </div>
      <div className="label" style={{ margin: '20px 0 8px' }}>
        Each page includes
      </div>
      {rows.map(([k, l]) => (
        <button key={k} className="toggle-row" role="switch" aria-checked={opts[k]} onClick={() => setOpts({ ...opts, [k]: !opts[k] })}>
          {l}
          <div className={'switch' + (opts[k] ? ' on' : '')}>
            <i />
          </div>
        </button>
      ))}
      <button className="btn btn-accent btn-block btn-big" style={{ marginTop: 20 }} onClick={exportPdf}>
        Export PDF for printing
      </button>
      <p className="field-help" style={{ textAlign: 'center' }}>
        Opens the print screen. Choose “Save as PDF” to keep a file.
      </p>
      {printing && createPortal(<PrintBook fam={fam} opts={opts} />, document.body)}
    </div>
  );
}

function PrintBook({ fam, opts }: { fam: Family; opts: Opts }) {
  const list = [...fam.recipes].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  return (
    <div className="print-book">
      <section className="pb-page pb-cover">
        <div className="a">A Family Recipe Book</div>
        <div className="b">Collected with love over 50 years</div>
        <div className="b" style={{ marginTop: 40, fontSize: 14 }}>
          The Dunigan Kitchen
        </div>
      </section>
      <section className="pb-page pb-note">
        <p>{MOM_NOTE}</p>
        <p>With all my love, Mom</p>
      </section>
      {list.map((r) => {
        const p = fam.contributors[r.contributor];
        const stories = fam.storiesByRecipe[r.id] || [];
        return (
          <section key={r.id} className="pb-page pb-recipe">
            <h2>{r.title}</h2>
            <div className="from">
              {r.category}
              {r.contributor !== 'none' && p ? ' · From the kitchen of ' + p.name : ''}
              {[r.temp && 'Oven ' + r.temp, r.time, r.makes && 'Makes ' + r.makes].filter(Boolean).map((x) => ' · ' + x)}
            </div>
            {opts.typed && isTyped(r) && (
              <>
                {r.note && <p className="st">{r.cardImages.length ? `Note on the card: “${r.note}”` : r.note}</p>}
                <h3>Ingredients</h3>
                <ul>
                  {r.ingredients!.map((t, i) =>
                    isGroup(t) ? (
                      <li key={i} className="grp">
                        {groupName(t)}
                      </li>
                    ) : (
                      <li key={i}>{t}</li>
                    ),
                  )}
                </ul>
                <h3>Method</h3>
                <ol>
                  {(r.steps || []).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </>
            )}
            {opts.cards && r.cardImages.length > 0 && (
              <div className="imgs">
                {r.cardImages.map((src) => (
                  <img key={src} src={src} alt="" />
                ))}
              </div>
            )}
            {opts.stories && stories.length > 0 && (
              <>
                <h3>Family stories</h3>
                {stories.map((s) => (
                  <p key={s.id} className="st">
                    {s.text} <b>— {s.authorName}</b>
                  </p>
                ))}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
