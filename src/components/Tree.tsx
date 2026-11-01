import { useMemo, useState } from 'react';
import type { Family } from '../lib/store';
import { go } from '../lib/router';
import { newId, plural } from '../lib/util';
import {
  FOCUS,
  byId,
  childrenOf,
  displayName,
  generationTitle,
  generations,
  parentsOf,
  relation,
  shortName,
  siblingsOf,
  spousesOf,
  withChild,
  withParent,
  withSibling,
  withSpouse,
  type People,
  type TreePerson,
} from '../lib/tree';
import { Avatar } from './bits';
import { AppPortal, Layer } from './Stack';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Cooks" and "Family tree" sit side by side on the Family tab. */
export function FamilySwitch({ on }: { on: 'cooks' | 'tree' }) {
  return (
    <div className="seg" role="tablist" aria-label="Family view">
      <button role="tab" aria-selected={on === 'cooks'} className={on === 'cooks' ? 'on' : ''} onClick={() => on !== 'cooks' && go('family')}>
        Cooks
      </button>
      <button role="tab" aria-selected={on === 'tree'} className={on === 'tree' ? 'on' : ''} onClick={() => on !== 'tree' && go('tree')}>
        Family tree
      </button>
    </div>
  );
}

type Pick = (who: string) => void;

/** The family tree, one generation per row, centered on Jeanette. */
export function TreePage({ fam, toast, pickWho }: { fam: Family; toast: (t: string) => void; pickWho: Pick }) {
  const [open, setOpen] = useState<string | null>(null);
  const P = useMemo(() => byId(fam.tree), [fam.tree]);
  const focus = P[FOCUS];
  const focusName = focus ? shortName(P, focus) : 'Jeanette';
  const meId = fam.myContributor ? fam.tree.find((p) => p.contributorId === fam.myContributor)?.id : undefined;

  const { rows, loose } = useMemo(() => layout(P), [P]);
  const myRel = meId && meId !== FOCUS ? relation(P, FOCUS, meId) : null;

  return (
    <div className="screen with-tabs pad">
      <FamilySwitch on="tree" />
      <div className="eyebrow">The family</div>
      <h1 className="h1" style={{ marginBottom: 6 }}>
        Family tree
      </h1>
      <p className="lead">
        Everyone is shown by how they’re related to {focusName}, since the tree was her idea. Tap anyone to see more or to add their family.
      </p>
      {meId === FOCUS ? (
        <div className="tree-you">You’re in the center of the tree.</div>
      ) : myRel ? (
        <div className="tree-you">
          You’re {focusName}’s {lower(myRel)}.
        </div>
      ) : fam.myContributor ? (
        <div className="tree-you">Not on the tree yet? Find yourself and tap “This is me,” or add yourself next to a parent.</div>
      ) : null}

      {rows.map(({ gen, groups }) => (
        <section key={gen} className="tree-gen">
          <h2 className="tree-gen-t">{generationTitle(gen, focusName)}</h2>
          {groups.map((grp) => (
            <div key={grp.key} className="tree-group">
              {grp.label && <div className="tree-group-t">{grp.label}</div>}
              <div className="tree-units">
                {grp.units.map((u) => (
                  <div key={u.join('+')} className={'tree-unit' + (u.length > 1 ? ' couple' : '')}>
                    {u.map((id, i) => (
                      <PersonCard
                        key={id}
                        fam={fam}
                        P={P}
                        p={P[id]}
                        rel={id === FOCUS ? 'The center of the tree' : relation(P, FOCUS, id)}
                        me={id === meId}
                        joined={i > 0}
                        onClick={() => setOpen(id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {loose.length > 0 && (
        <section className="tree-gen">
          <h2 className="tree-gen-t">Not connected yet</h2>
          <p className="field-help" style={{ margin: '0 0 10px' }}>
            Tap someone and add a parent, child or husband or wife to connect them.
          </p>
          <div className="tree-units">
            {loose.map((id) => (
              <div key={id} className="tree-unit">
                <PersonCard fam={fam} P={P} p={P[id]} rel={null} me={id === meId} joined={false} onClick={() => setOpen(id)} />
              </div>
            ))}
          </div>
        </section>
      )}

      <AppPortal>
        <Layer show={!!open && !!P[open]} kind="fade" z={45}>
          {open && P[open] && (
            <PersonSheet
              key={open}
              fam={fam}
              P={P}
              id={open}
              meId={meId}
              setOpen={setOpen}
              toast={toast}
              pickWho={(who) => {
                setOpen(null);
                pickWho(who);
              }}
            />
          )}
        </Layer>
      </AppPortal>
    </div>
  );
}

/** Generations top to bottom; in each, brothers and sisters grouped together, couples side by side. */
function layout(P: People) {
  const gen = generations(P, FOCUS);
  const order = new Map<string, number>();
  const byGen = new Map<number, string[]>();
  for (const [id, n] of gen) (byGen.get(n) || byGen.set(n, []).get(n)!).push(id);

  const rows: { gen: number; groups: { key: string; label: string; units: string[][] }[] }[] = [];
  for (const n of [...byGen.keys()].sort((a, b) => a - b)) {
    const ids = byGen.get(n)!;
    const inGen = new Set(ids);
    const parentKey = (id: string) => parentsOf(P, id).sort().join('+');
    // Someone with parents on the tree anchors their couple; a husband or wife from outside joins them.
    const anchors = ids
      .filter((id) => parentsOf(P, id).length || !spousesOf(P, id).some((s) => inGen.has(s) && parentsOf(P, s).length))
      .sort((a, b) => {
        const pa = Math.min(...parentsOf(P, a).map((x) => order.get(x) ?? 999), 999);
        const pb = Math.min(...parentsOf(P, b).map((x) => order.get(x) ?? 999), 999);
        return pa - pb || Number(b === FOCUS) - Number(a === FOCUS) || (P[a].born || '').localeCompare(P[b].born || '') || 0;
      });
    const placed = new Set<string>();
    const groups = new Map<string, { key: string; label: string; units: string[][] }>();
    for (const a of anchors) {
      if (placed.has(a)) continue;
      const unit = [a, ...spousesOf(P, a).filter((s) => inGen.has(s) && !placed.has(s) && s !== a)];
      unit.forEach((x) => placed.add(x));
      const key = parentKey(a);
      if (!groups.has(key)) groups.set(key, { key: key || 'none:' + a, label: groupLabel(P, parentsOf(P, a)), units: [] });
      groups.get(key)!.units.push(unit);
    }
    let i = 0;
    for (const grp of groups.values()) for (const u of grp.units) for (const id of u) order.set(id, i++);
    rows.push({ gen: n, groups: [...groups.values()] });
  }
  const loose = Object.keys(P).filter((id) => !gen.has(id));
  return { rows, loose };
}

function groupLabel(P: People, parents: string[]) {
  if (!parents.length) return '';
  const known = parents.map((id) => P[id]).filter((p) => !p.unknown);
  if (parents.length === 1 && known.length === 1) return `${shortName(P, known[0])}’s children`;
  if (known.length < parents.length) return 'Brothers and sisters';
  return `Children of ${known.map((p) => shortName(P, p)).join(' & ')}`;
}

function Face({ fam, p, size }: { fam: Family; p: TreePerson; size: number }) {
  const c = p.contributorId ? fam.contributors[p.contributorId] : null;
  const img = p.contributorId ? fam.linkByContributor[p.contributorId]?.image : null;
  if (img) return <img className="pf-img" src={img} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
  if (c) return <Avatar c={c} size={size} font={Math.round(size / 3)} />;
  const ini = p.unknown
    ? '?'
    : p.name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
  return (
    <Avatar c={{ id: p.id, name: p.name, short: '', ini, hue: p.unknown ? 60 : p.sex === 'f' ? 20 : p.sex === 'm' ? 230 : 140 }} size={size} font={Math.round(size / 3)} />
  );
}

function PersonCard({
  fam,
  P,
  p,
  rel,
  me,
  joined,
  onClick,
}: {
  fam: Family;
  P: People;
  p: TreePerson;
  rel: string | null;
  me: boolean;
  joined: boolean;
  onClick: () => void;
}) {
  return (
    <>
      {joined && (
        <span className="tree-amp" aria-hidden>
          &amp;
        </span>
      )}
      <button className={'tree-card' + (p.id === FOCUS ? ' focus' : '') + (p.unknown ? ' unknown' : '')} onClick={onClick}>
        <Face fam={fam} p={p} size={44} />
        <span className="nm">{displayName(P, p)}</span>
        <span className="rl">{p.unknown ? 'Tap to add a name' : rel || ' '}</span>
        {me && <span className="you-badge">You</span>}
      </button>
    </>
  );
}

type AddKind = 'parent' | 'sibling' | 'spouse' | 'child';
const ADD_LABEL: Record<AddKind, string> = {
  parent: 'Add a parent',
  sibling: 'Add a brother or sister',
  spouse: 'Add a husband or wife',
  child: 'Add a child',
};

/** One person: how they're related, their close family, and buttons to add more. */
function PersonSheet({
  fam,
  P,
  id,
  meId,
  setOpen,
  toast,
  pickWho,
}: {
  fam: Family;
  P: People;
  id: string;
  meId: string | undefined;
  setOpen: (id: string | null) => void;
  toast: (t: string) => void;
  pickWho: Pick;
}) {
  const p = P[id];
  const [mode, setMode] = useState<'view' | 'edit' | AddKind>(p.unknown ? 'edit' : 'view');
  const [busy, setBusy] = useState(false);
  const name = displayName(P, p);
  const focusName = P[FOCUS] ? shortName(P, P[FOCUS]) : 'Jeanette';
  const rel = id === FOCUS ? null : relation(P, FOCUS, id);
  const toMe = meId && meId !== id && meId !== FOCUS ? relation(P, meId, id) : null;
  const recipes = p.contributorId ? fam.recipes.filter((r) => r.contributor === p.contributorId).length : 0;
  const myCookTaken = !!fam.myContributor && fam.tree.some((x) => x.contributorId === fam.myContributor);

  async function save(changed: TreePerson[], done: string, next: string | null = id) {
    if (!changed.length) return toast('Nothing to change.');
    setBusy(true);
    try {
      await fam.saveTree(changed);
      toast(done);
      setMode('view');
      setOpen(next);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Take ${name} off the family tree?`)) return;
    setBusy(true);
    try {
      await fam.removeFromTree(id);
      toast(`${name} was taken off the tree`);
      setOpen(null);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  const links: [string, string[]][] = [
    ['Parents', parentsOf(P, id)],
    [spousesOf(P, id).length > 1 ? 'Married to' : p.sex === 'f' ? 'Husband' : p.sex === 'm' ? 'Wife' : 'Married to', spousesOf(P, id)],
    ['Brothers and sisters', siblingsOf(P, id)],
    ['Children', childrenOf(P, id)],
  ];

  return (
    <>
      <div className="scrim" onClick={() => setOpen(null)} />
      <div className="sheet" role="dialog" aria-label={name}>
        <div className="sheet-grab" />
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Face fam={fam} p={p} size={52} />
            <div style={{ minWidth: 0 }}>
              <h2 className="h2" style={{ fontSize: 22 }}>
                {name}
              </h2>
              <div className="field-help" style={{ margin: 0 }}>
                {id === FOCUS ? 'The center of the family tree' : rel ? `${focusName}’s ${lower(rel)}` : 'Not connected to the tree yet'}
                {p.born ? ` · born ${p.born}` : ''}
              </div>
            </div>
          </div>
          <button className="link-btn" onClick={() => setOpen(null)}>
            Done
          </button>
        </div>

        {mode === 'view' ? (
          <>
            {id === meId ? <div className="tree-you">This is you.</div> : toMe ? <div className="tree-you">Your {lower(toMe)}</div> : null}
            {p.note && <p className="tree-note">{p.note}</p>}

            {links.map(([label, ids]) =>
              ids.length ? (
                <div key={label} className="tree-links">
                  <div className="field-label">{label}</div>
                  <div className="also-chips">
                    {ids.map((x) => (
                      <button key={x} className="chip chip-sm" onClick={() => setOpen(x)}>
                        {displayName(P, P[x])}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}

            {p.contributorId && fam.contributors[p.contributorId] && (
              <button className="btn btn-outline btn-block" style={{ marginTop: 6 }} onClick={() => pickWho(p.contributorId!)}>
                See {shortName(P, p)}’s recipes ({recipes})
              </button>
            )}

            <div className="field-label" style={{ marginTop: 18 }}>
              Add to {shortName(P, p)}’s family
            </div>
            <div className="tree-add-grid">
              {(['parent', 'sibling', 'spouse', 'child'] as AddKind[])
                .filter((k) => k !== 'parent' || parentsOf(P, id).filter((x) => !P[x].unknown).length < 2)
                .map((k) => (
                  <button key={k} className="btn btn-outline" onClick={() => setMode(k)}>
                    + {ADD_LABEL[k].replace('Add a ', '').replace(/^./, (c) => c.toUpperCase())}
                  </button>
                ))}
            </div>

            <div className="tree-actions">
              <button className="link-btn" onClick={() => setMode('edit')}>
                Edit details
              </button>
              {fam.myContributor && !myCookTaken && !p.contributorId && !p.unknown && (
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => save([{ ...p, contributorId: fam.myContributor }], 'Got it. That’s you on the tree.')}
                >
                  This is me
                </button>
              )}
              {fam.admin && id !== FOCUS && (
                <button className="link-btn" style={{ color: 'var(--muted)' }} disabled={busy} onClick={remove}>
                  Take off the tree
                </button>
              )}
            </div>
          </>
        ) : mode === 'edit' ? (
          <PersonForm
            fam={fam}
            P={P}
            start={p}
            title={p.unknown ? `What was ${name}’s name?` : `Edit ${name}`}
            busy={busy}
            cancel={() => (p.unknown ? setOpen(null) : setMode('view'))}
            submit={(v) => save([{ ...p, ...v, unknown: false }], 'Saved')}
          />
        ) : (
          <PersonForm
            fam={fam}
            P={P}
            start={{ id: newId(), name: '', sex: mode === 'spouse' ? (p.sex === 'm' ? 'f' : p.sex === 'f' ? 'm' : null) : null }}
            title={`${ADD_LABEL[mode]} for ${shortName(P, p)}`}
            busy={busy}
            otherParents={mode === 'child' ? spousesOf(P, id) : undefined}
            cancel={() => setMode('view')}
            submit={(v, other) => {
              const person: TreePerson = { id: newId(), ...v };
              const changed =
                mode === 'parent'
                  ? withParent(P, id, person)
                  : mode === 'sibling'
                    ? withSibling(P, id, person, newId)
                    : mode === 'spouse'
                      ? withSpouse(P, id, person)
                      : withChild(P, id, person, other ?? null);
              save(changed, `${v.name.split(' ')[0]} was added`);
            }}
          />
        )}
      </div>
    </>
  );
}

type Fields = Pick2<TreePerson, 'name' | 'sex' | 'born' | 'note' | 'contributorId'>;
type Pick2<T, K extends keyof T> = { [P in K]: T[P] };

function PersonForm({
  fam,
  P,
  start,
  title,
  busy,
  otherParents,
  cancel,
  submit,
}: {
  fam: Family;
  P: People;
  start: TreePerson;
  title: string;
  busy: boolean;
  otherParents?: string[];
  cancel: () => void;
  submit: (v: Fields, otherParent?: string | null) => void;
}) {
  const [name, setName] = useState(start.unknown ? '' : start.name);
  const [sex, setSex] = useState<TreePerson['sex']>(start.sex ?? null);
  const [born, setBorn] = useState(start.born || '');
  const [note, setNote] = useState(start.note || '');
  const [cook, setCook] = useState(start.contributorId || '');
  const [other, setOther] = useState<string>(otherParents?.[0] || '');

  const taken = new Set(fam.tree.filter((x) => x.id !== start.id && x.contributorId).map((x) => x.contributorId));
  const cooks = Object.values(fam.contributors)
    .filter((c) => c.id !== 'none' && (!taken.has(c.id) || c.id === cook))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        submit(
          { name: name.trim(), sex, born: born.trim() || null, note: note.trim() || null, contributorId: cook || null },
          otherParents ? other || null : undefined,
        );
      }}
    >
      <div className="field-label" style={{ fontSize: 15, color: 'var(--ink)', margin: '4px 0 12px' }}>
        {title}
      </div>
      <div className="form-group">
        <label className="field-label" htmlFor="tp-name">
          Name
        </label>
        <input id="tp-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoFocus />
      </div>
      <div className="form-group">
        <div className="field-label">They are a</div>
        <div className="also-chips">
          {(
            [
              ['f', 'Woman'],
              ['m', 'Man'],
              [null, 'Not sure'],
            ] as const
          ).map(([v, l]) => (
            <button type="button" key={l} className={'chip chip-sm' + (sex === v ? ' on' : '')} onClick={() => setSex(v)}>
              {l}
            </button>
          ))}
        </div>
        <p className="field-help">So the tree can say sister or brother, aunt or uncle.</p>
      </div>
      {otherParents && otherParents.length > 0 && (
        <div className="form-group">
          <label className="field-label" htmlFor="tp-other">
            Other parent
          </label>
          <select id="tp-other" className="field" value={other} onChange={(e) => setOther(e.target.value)}>
            {otherParents.map((x) => (
              <option key={x} value={x}>
                {displayName(P, P[x])}
              </option>
            ))}
            <option value="">Someone else / not on the tree</option>
          </select>
        </div>
      )}
      <div className="form-group">
        <label className="field-label" htmlFor="tp-born">
          Born (optional)
        </label>
        <input id="tp-born" className="field" value={born} onChange={(e) => setBorn(e.target.value)} placeholder="Year, like 1952" inputMode="numeric" />
      </div>
      <div className="form-group">
        <label className="field-label" htmlFor="tp-cook">
          Their recipes are under (optional)
        </label>
        <select id="tp-cook" className="field" value={cook} onChange={(e) => setCook(e.target.value)}>
          <option value="">Nobody / no recipes yet</option>
          {cooks.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({plural(fam.recipes.filter((r) => r.contributor === c.id).length, 'recipe')})
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="field-label" htmlFor="tp-note">
          A few words (optional)
        </label>
        <textarea id="tp-note" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where they lived, what they were known for…" />
      </div>
      <div className="two-btns">
        <button type="button" className="btn btn-outline" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
