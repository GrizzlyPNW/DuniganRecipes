import type { Family as Fam } from '../lib/store';
import { plural } from '../lib/util';
import { Avatar } from './bits';

export function Family({ fam, pick }: { fam: Fam; pick: (who: string) => void }) {
  const { recipes, contributors: P } = fam;
  // Everyone on the list, including cooks who joined or were added before they have recipes.
  const used = [...new Set([...recipes.map((r) => r.contributor), ...Object.keys(P)])]
    .filter((k) => k !== 'none' && P[k])
    .sort((a, b) => P[a].name.localeCompare(P[b].name));
  const unsigned = recipes.filter((r) => r.contributor === 'none').length;
  const rows = unsigned ? [...used, 'none'] : used;

  return (
    <div className="screen with-tabs pad">
      <div className="eyebrow">The family</div>
      <h1 className="h1" style={{ marginBottom: 6 }}>
        Whose kitchen it came from
      </h1>
      <p className="lead">Names as written on the cards. Tap one to see their recipes.</p>
      {rows.map((k) => {
        const p = P[k];
        const n = recipes.filter((r) => r.contributor === k).length;
        const link = fam.linkByContributor[k];
        return (
          <button key={k} className="fam-row" onClick={() => pick(k)}>
            {link?.image ? (
              <img className="pf-img" src={link.image} alt="" width={48} height={48} referrerPolicy="no-referrer" />
            ) : (
              <Avatar c={p} size={48} font={16} />
            )}
            <div style={{ flex: 1 }}>
              <div className="t">
                {p.name}
                {p.rel ? ' · ' + p.rel : ''}
              </div>
              <div className="meta" style={{ marginTop: 2 }}>
                {plural(n, 'recipe')}
                {link ? ' · on the app' : ''}
              </div>
            </div>
            <span className="chev">›</span>
          </button>
        );
      })}
      {unsigned > 0 && (
        <div className="dashed" style={{ marginTop: 18 }}>
          <div className="t" style={{ fontSize: 17 }}>
            {unsigned === 1 ? '1 card isn’t signed' : `${unsigned} cards aren’t signed`}
          </div>
          <div className="s">
            Know whose handwriting it is? Open the recipe and tap “know who wrote it?” so the credit stays in the family.
          </div>
        </div>
      )}
    </div>
  );
}
