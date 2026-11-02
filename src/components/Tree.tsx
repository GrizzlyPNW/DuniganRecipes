import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Family } from '../lib/store';
import { go } from '../lib/router';
import { newId, plural } from '../lib/util';
import {
  GROUPS,
  START,
  byId,
  childrenOf,
  displayName,
  generations,
  groupOf,
  isPartner,
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
/** "Mother" reads stiff on a family page. */
const casual = (r: string) => (r === 'Mother' ? 'mom' : r === 'Father' ? 'dad' : lower(r));

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
type View = 'tree' | 'list';
const VIEW_KEY = 'dunigan-tree-view';

/**
 * The family tree, seen from one person: Jeanette, until you tap someone (or yourself)
 * and choose to see it from their side. Every label ("Your aunt", "Elaine's niece") follows.
 */
export function TreePage({ fam, toast, pickWho }: { fam: Family; toast: (t: string) => void; pickWho: Pick }) {
  const P = useMemo(() => byId(fam.tree), [fam.tree]);
  const meId = fam.myContributor ? fam.tree.find((p) => p.contributorId === fam.myContributor)?.id : undefined;
  const home = P[START] ? START : fam.tree[0]?.id;
  const [center, setCenter] = useState(home);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'tree' ? 'tree' : 'list';
    } catch {
      return 'list';
    }
  });
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const c = center && P[center] ? center : home;
  if (!c) return null;

  const mine = c === meId;
  const cName = shortName(P, P[c]);
  /** How `id` is related to whoever is in the middle. */
  const phrase = (id: string) => {
    if (id === c) return mine ? 'You' : 'Center of the tree';
    const r = relation(P, c, id);
    if (!r) return '';
    return mine ? `Your ${casual(r)}` : `${cName}’s ${casual(r)}`;
  };
  /** The short version for the tree's small cards: "Aunt", "Mom". */
  const label = (id: string) => {
    if (id === c) return mine ? 'You' : 'Center';
    const r = relation(P, c, id);
    return r ? casual(r).replace(/^./, (ch) => ch.toUpperCase()) : '';
  };

  return (
    <div className="screen with-tabs pad">
      <FamilySwitch on="tree" />
      <div className="eyebrow">The family</div>
      <h1 className="h1" style={{ marginBottom: 6 }}>
        The Dunigan Family Tree
      </h1>
      <p className="lead">Tap anyone to see more, add their family, or see the tree from their side.</p>

      {!meId && fam.myContributor ? (
        <div className="tree-you">
          <b>Not on the tree yet?</b> Tap the person you’re closest to, like your partner, mom or dad. Then add yourself and tap
          “It’s me.” If you’re already on it, tap your name and “This is me.”
        </div>
      ) : mine ? (
        <div className="tree-you row-between" style={{ alignItems: 'center' }}>
          <span>Seeing it from your side.</span>
          {home && home !== c && (
            <button className="link-btn" onClick={() => setCenter(home)}>
              Back to {shortName(P, P[home])}
            </button>
          )}
        </div>
      ) : (
        <div className="tree-you row-between" style={{ alignItems: 'center', gap: 10 }}>
          <span>Seeing it from {cName}’s side.</span>
          {meId ? (
            <button className="link-btn" onClick={() => setCenter(meId)}>
              See it from my side
            </button>
          ) : home && home !== c ? (
            <button className="link-btn" onClick={() => setCenter(home)}>
              Back to {shortName(P, P[home])}
            </button>
          ) : null}
        </div>
      )}

      <div className="seg seg-sm" role="tablist" aria-label="List or tree">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')}>
          List
        </button>
        <button role="tab" aria-selected={view === 'tree'} className={view === 'tree' ? 'on' : ''} onClick={() => pickView('tree')}>
          Tree
        </button>
      </div>

      {view === 'tree' ? (
        <DrawnTree fam={fam} P={P} center={c} meId={meId} phrase={label} onOpen={setOpen} />
      ) : (
        <ListView fam={fam} P={P} center={c} meId={meId} mine={mine} phrase={label} onOpen={setOpen} />
      )}

      <AppPortal>
        <Layer show={!!open && !!P[open]} kind="fade" z={45}>
          {open && P[open] && (
            <PersonSheet
              key={open}
              fam={fam}
              P={P}
              id={open}
              center={c}
              meId={meId}
              phrase={phrase}
              setOpen={setOpen}
              recenter={(id) => {
                setOpen(null);
                setCenter(id);
              }}
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

/* ---------- Drawn tree ---------- */

const CW = 100; // card width
const CH = 84; // card height
const CGAP = 8; // between husband and wife
const GAP = 16; // between families
const ROW = 136; // from one generation to the next
const PAD = 16;

/**
 * Lays out a classic family tree: couples side by side, children centered under their
 * parents, one generation per row. Everyone connected to `center` is placed once.
 */
function treeLayout(P: People, center: string) {
  const gen = generations(P, center);
  const ids = [...gen.keys()];
  // People with parents on the tree anchor their couple; a husband or wife from outside joins them.
  ids.sort((a, b) => Number(parentsOf(P, b).length > 0) - Number(parentsOf(P, a).length > 0));
  const unitOf = new Map<string, number>();
  const units: string[][] = [];
  for (const id of ids) {
    if (unitOf.has(id)) continue;
    const u = [id, ...spousesOf(P, id).filter((s) => gen.has(s) && !unitOf.has(s))];
    units.push(u);
    u.forEach((x) => unitOf.set(x, units.length - 1));
  }

  // Each couple hangs under the parents of whichever of them has parents on the tree.
  const kids = new Map<number, number[]>();
  const hasParent = new Set<number>();
  const born = (u: number) => units[u].map((id) => P[id].born || '').find(Boolean) || '';
  units.forEach((u, i) => {
    const anchor = u.find((id) => parentsOf(P, id).length);
    if (!anchor) return;
    const pu = unitOf.get(parentsOf(P, anchor)[0]);
    if (pu === undefined || pu === i) return;
    hasParent.add(i);
    (kids.get(pu) || kids.set(pu, []).get(pu)!).push(i);
  });
  for (const list of kids.values()) list.sort((a, b) => born(a).localeCompare(born(b)));

  const unitW = (u: number) => units[u].length * CW + (units[u].length - 1) * CGAP;
  const widthMemo = new Map<number, number>();
  const width = (u: number, seen = new Set<number>()): number => {
    if (widthMemo.has(u)) return widthMemo.get(u)!;
    seen.add(u);
    const ch = (kids.get(u) || []).filter((k) => !seen.has(k));
    const sum = ch.reduce((s, k) => s + width(k, seen), 0) + GAP * Math.max(0, ch.length - 1);
    const w = Math.max(unitW(u), sum);
    widthMemo.set(u, w);
    return w;
  };

  const minGen = Math.min(...gen.values());
  const pos = new Map<string, { x: number; y: number }>();
  const placed = new Set<number>();
  const place = (u: number, left: number) => {
    if (placed.has(u)) return;
    placed.add(u);
    const w = width(u);
    const x0 = left + (w - unitW(u)) / 2;
    units[u].forEach((id, i) => pos.set(id, { x: x0 + i * (CW + CGAP), y: PAD + (gen.get(id)! - minGen) * ROW }));
    const ch = kids.get(u) || [];
    const total = ch.reduce((s, k) => s + width(k), 0) + GAP * Math.max(0, ch.length - 1);
    let x = left + (w - total) / 2;
    for (const k of ch) {
      place(k, x);
      x += width(k) + GAP;
    }
  };
  // Top of the family first; the side that leads to `center` on the left.
  const roots = units
    .map((_, i) => i)
    .filter((i) => !hasParent.has(i))
    .sort((a, b) => Math.min(...units[a].map((id) => gen.get(id)!)) - Math.min(...units[b].map((id) => gen.get(id)!)));
  let left = PAD;
  for (const r of roots) {
    place(r, left);
    left += width(r) + GAP * 2;
  }

  // Lines: a short one between husband and wife, and a bracket from parents down to their children.
  const lines: string[] = [];
  for (const u of units) {
    for (let i = 1; i < u.length; i++) {
      const a = pos.get(u[i - 1])!;
      lines.push(`M${a.x + CW} ${a.y + CH / 2}h${CGAP}`);
    }
  }
  const families = new Map<string, string[]>();
  for (const id of pos.keys()) {
    const ps = parentsOf(P, id).filter((p) => pos.has(p));
    if (ps.length) (families.get(ps.sort().join('+')) || families.set(ps.sort().join('+'), []).get(ps.sort().join('+'))!).push(id);
  }
  for (const [key, children] of families) {
    const ps = key.split('+').map((p) => pos.get(p)!);
    const sameRow = ps.every((p) => p.y === ps[0].y);
    const px = sameRow ? (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x)) + CW) / 2 : ps[0].x + CW / 2;
    const py = (sameRow && ps.length > 1 ? ps[0].y + CH / 2 : ps[0].y + CH) as number;
    for (const ch of children) {
      const k = pos.get(ch)!;
      const cx = k.x + CW / 2;
      const midY = k.y - (ROW - CH) / 2;
      lines.push(`M${px} ${py}V${midY}H${cx}V${k.y}`);
    }
  }

  const w = Math.max(...[...pos.values()].map((p) => p.x + CW), 0) + PAD;
  const h = Math.max(...[...pos.values()].map((p) => p.y + CH), 0) + PAD;
  const loose = Object.keys(P).filter((id) => !gen.has(id));
  return { pos, lines, w, h, loose };
}

function DrawnTree({
  fam,
  P,
  center,
  meId,
  phrase,
  onOpen,
}: {
  fam: Family;
  P: People;
  center: string;
  meId: string | undefined;
  phrase: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const { pos, lines, w, h, loose } = useMemo(() => treeLayout(P, center), [P, center]);
  const box = useRef<HTMLDivElement>(null);

  // Start with the person in the middle in view.
  useLayoutEffect(() => {
    const el = box.current;
    const p = pos.get(center);
    if (!el || !p) return;
    el.scrollLeft = p.x + CW / 2 - el.clientWidth / 2;
    el.scrollTop = p.y + CH / 2 - el.clientHeight / 2;
  }, [center, pos]);

  return (
    <>
      <div className="tree-canvas" ref={box}>
        <div style={{ position: 'relative', width: w, height: h }}>
          <svg width={w} height={h} className="tree-lines" aria-hidden>
            {lines.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          {[...pos.entries()].map(([id, p]) => (
            <TreeCard
              key={id}
              fam={fam}
              P={P}
              p={P[id]}
              rel={phrase(id)}
              center={id === center}
              me={id === meId}
              style={{ left: p.x, top: p.y, width: CW, height: CH }}
              onClick={() => onOpen(id)}
            />
          ))}
        </div>
      </div>
      <p className="field-help" style={{ marginTop: 8 }}>
        Drag to move around the tree.
      </p>
      {loose.length > 0 && <LooseList fam={fam} P={P} loose={loose} meId={meId} onOpen={onOpen} />}
    </>
  );
}

function TreeCard({
  fam,
  P,
  p,
  rel,
  center,
  me,
  style,
  onClick,
}: {
  fam: Family;
  P: People;
  p: TreePerson;
  rel: string;
  center: boolean;
  me: boolean;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  return (
    <button className={'tree-node' + (center ? ' center' : '') + (p.unknown ? ' unknown' : '')} style={style} onClick={onClick}>
      <Face fam={fam} p={p} size={26} />
      <span className="nm">{p.unknown ? displayName(P, p) : shortName(P, p)}</span>
      <span className="rl">{p.unknown ? 'Add a name' : rel}</span>
      {me && !center && <span className="you-badge">You</span>}
    </button>
  );
}

function LooseList({ fam, P, loose, meId, onOpen }: { fam: Family; P: People; loose: string[]; meId?: string; onOpen: (id: string) => void }) {
  return (
    <section className="tree-sec">
      <h2 className="tree-sec-t">Not connected yet</h2>
      <p className="field-help" style={{ margin: '0 0 6px' }}>
        Tap someone and add a parent, child or husband or wife to connect them.
      </p>
      {loose.map((id) => (
        <PersonRow key={id} fam={fam} P={P} p={P[id]} sub={id === meId ? 'You' : ''} onClick={() => onOpen(id)} />
      ))}
    </section>
  );
}

/* ---------- List ---------- */

function ListView({
  fam,
  P,
  center,
  meId,
  mine,
  phrase,
  onOpen,
}: {
  fam: Family;
  P: People;
  center: string;
  meId: string | undefined;
  mine: boolean;
  phrase: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const cName = shortName(P, P[center]);
  const groups = new Map<string, string[]>();
  const loose: string[] = [];
  for (const id of Object.keys(P)) {
    if (id === center) continue;
    const g = groupOf(P, center, id);
    if (g) (groups.get(g) || groups.set(g, []).get(g)!).push(id);
    else loose.push(id);
  }
  const recipes = (p: TreePerson) => (p.contributorId ? fam.recipes.filter((r) => r.contributor === p.contributorId).length : 0);

  return (
    <>
      <PersonRow fam={fam} P={P} p={P[center]} sub={mine ? 'You' : 'Center of the tree'} onClick={() => onOpen(center)} highlight />
      {GROUPS.filter((g) => groups.has(g)).map((g) => (
        <section key={g} className="tree-sec">
          <h2 className="tree-sec-t">{mine ? `Your ${lower(g)}` : `${cName}’s ${lower(g)}`}</h2>
          {groups.get(g)!.map((id) => {
            const p = P[id];
            const n = recipes(p);
            return (
              <PersonRow
                key={id}
                fam={fam}
                P={P}
                p={p}
                sub={p.unknown ? 'Add a name' : [phrase(id), id === meId ? 'you' : '', n ? plural(n, 'recipe') : ''].filter(Boolean).join(' · ')}
                onClick={() => onOpen(id)}
              />
            );
          })}
        </section>
      ))}
      {loose.length > 0 && <LooseList fam={fam} P={P} loose={loose} meId={meId} onOpen={onOpen} />}
    </>
  );
}

function PersonRow({
  fam,
  P,
  p,
  sub,
  onClick,
  highlight,
}: {
  fam: Family;
  P: People;
  p: TreePerson;
  sub: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button className={'fam-row' + (highlight ? ' tree-row-center' : '')} onClick={onClick}>
      <Face fam={fam} p={p} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t" style={p.unknown ? { color: 'var(--muted2)' } : undefined}>
          {displayName(P, p)}
        </div>
        {sub && (
          <div className="meta" style={{ marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      <span className="chev">›</span>
    </button>
  );
}

/* ---------- Shared bits ---------- */

function Face({ fam, p, size }: { fam: Family; p: TreePerson; size: number }) {
  const c = p.contributorId ? fam.contributors[p.contributorId] : null;
  const img = p.contributorId ? fam.linkByContributor[p.contributorId]?.image : null;
  if (img) return <img className="pf-img" src={img} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
  if (c) return <Avatar c={c} size={size} font={Math.round(size / 2.6)} />;
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
    <Avatar
      c={{ id: p.id, name: p.name, short: '', ini, hue: p.unknown ? 60 : p.sex === 'f' ? 20 : p.sex === 'm' ? 230 : 140 }}
      size={size}
      font={Math.round(size / 2.6)}
    />
  );
}

type AddKind = 'parent' | 'sibling' | 'spouse' | 'child';
const ADD_LABEL: Record<AddKind, string> = {
  parent: 'Add a parent',
  sibling: 'Add a brother or sister',
  spouse: 'Add a husband, wife or partner',
  child: 'Add a child',
};
const ADD_BUTTON: Record<AddKind, string> = {
  parent: '+ Parent',
  sibling: '+ Brother or sister',
  spouse: '+ Spouse or partner',
  child: '+ Child',
};

/** One person: how they're related, their close family, and buttons to add more. */
function PersonSheet({
  fam,
  P,
  id,
  center,
  meId,
  phrase,
  setOpen,
  recenter,
  toast,
  pickWho,
}: {
  fam: Family;
  P: People;
  id: string;
  center: string;
  meId: string | undefined;
  phrase: (id: string) => string;
  setOpen: (id: string | null) => void;
  recenter: (id: string) => void;
  toast: (t: string) => void;
  pickWho: Pick;
}) {
  const p = P[id];
  const [mode, setMode] = useState<'view' | 'edit' | AddKind>(p.unknown ? 'edit' : 'view');
  const [busy, setBusy] = useState(false);
  const name = displayName(P, p);
  const rel = phrase(id);
  // When looking at someone else's side, still say how this person is related to you.
  const toMe = meId && meId !== id && center !== meId ? relation(P, meId, id) : null;
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

  /** A breakup: undo the couple. If the other person has no one else on the tree, offer to take them off. */
  async function unlink(s: string) {
    const other = P[s];
    const sName = displayName(P, other);
    const word = isPartner(P, id, s) ? 'partner' : 'husband or wife';
    if (!confirm(`Remove ${sName} as ${first}’s ${word}? Any children stay connected to both of them.`)) return;
    const strip = (x: TreePerson, gone: string): TreePerson => ({
      ...x,
      spouses: (x.spouses || []).filter((y) => y !== gone),
      partners: (x.partners || []).filter((y) => y !== gone),
    });
    setBusy(true);
    try {
      await fam.saveTree([strip(p, s), strip(other, id)]);
      const alone = !parentsOf(P, s).length && !spousesOf(P, s).some((y) => y !== id) && !childrenOf(P, s).length;
      if (alone && confirm(`${sName} isn’t connected to anyone else now. Take them off the tree too?`)) {
        await fam.removeFromTree(s);
        toast(`${sName} was taken off the tree`);
      } else toast(`${sName} is no longer listed as ${first}’s ${word}`);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const links: [string, string[]][] = [
    ['Parents', parentsOf(P, id)],
    ...spousesOf(P, id).map(
      (s): [string, string[]] => [isPartner(P, id, s) ? 'Partner' : P[s].sex === 'm' ? 'Husband' : P[s].sex === 'f' ? 'Wife' : 'Married to', [s]],
    ),
    ['Brothers and sisters', siblingsOf(P, id)],
    ['Children', childrenOf(P, id)],
  ];
  const first = shortName(P, p);

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
                {id === meId ? 'You' : rel || 'Not connected to the tree yet'}
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
            {toMe && <div className="tree-you">Your {casual(toMe)}</div>}
            {p.note && <p className="tree-note">{p.note}</p>}

            {id !== center && !p.unknown && (
              <button className="btn btn-dark btn-block" style={{ marginBottom: 14 }} onClick={() => recenter(id)}>
                {id === meId ? 'See the tree from my side' : `See the tree from ${first}’s side`}
              </button>
            )}

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
                See {first}’s recipes ({recipes})
              </button>
            )}

            <div className="field-label" style={{ marginTop: 18 }}>
              Add to {first}’s family
            </div>
            <div className="tree-add-grid">
              {(['parent', 'sibling', 'spouse', 'child'] as AddKind[])
                .filter((k) => k !== 'parent' || parentsOf(P, id).filter((x) => !P[x].unknown).length < 2)
                .map((k) => (
                  <button key={k} className="btn btn-outline" onClick={() => setMode(k)}>
                    {ADD_BUTTON[k]}
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
              {spousesOf(P, id).map((s) => (
                <button key={s} className="link-btn" style={{ color: 'var(--muted)' }} disabled={busy} onClick={() => unlink(s)}>
                  {isPartner(P, id, s) ? 'Remove partner' : 'Remove spouse'}
                  {spousesOf(P, id).length > 1 ? ` (${shortName(P, P[s])})` : ''}
                </button>
              ))}
              {fam.admin && id !== center && (
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
            start={{ id: newId(), name: '', sex: null }}
            title={`${ADD_LABEL[mode]} for ${first}`}
            busy={busy}
            otherParents={mode === 'child' ? spousesOf(P, id) : undefined}
            couple={mode === 'spouse'}
            canBeMe={!!fam.myContributor && !myCookTaken}
            linkable={linkableFor(P, id, mode)}
            cancel={() => setMode('view')}
            submit={(v, other, partner, existing) => {
              const person: TreePerson = existing ? P[existing] : { id: newId(), ...v };
              const changed =
                mode === 'parent'
                  ? withParent(P, id, person)
                  : mode === 'sibling'
                    ? withSibling(P, id, person, newId)
                    : mode === 'spouse'
                      ? withSpouse(P, id, person, !!partner)
                      : withChild(P, id, person, other ?? null);
              save(
                changed,
                existing
                  ? `${shortName(P, P[existing])} is now linked`
                  : v.contributorId && v.contributorId === fam.myContributor
                    ? 'You’re on the tree'
                    : `${v.name.split(' ')[0]} was added`,
              );
            }}
          />
        )}
      </div>
    </>
  );
}

/**
 * People already on the tree who can be linked as this kind of relative, instead of adding someone new.
 * Only husbands, wives, partners and children: linking an existing parent or sibling could
 * tangle two families, so those are always added fresh.
 */
function linkableFor(P: People, id: string, kind: AddKind): string[] {
  if (kind !== 'spouse' && kind !== 'child') return [];
  const ancestorsOf = (x: string, seen = new Set<string>()): Set<string> => {
    for (const p of parentsOf(P, x)) if (!seen.has(p)) ancestorsOf(p, seen.add(p));
    return seen;
  };
  const mineUp = ancestorsOf(id);
  return Object.values(P)
    .filter((x) => x.id !== id && !x.unknown && !mineUp.has(x.id))
    .filter((x) =>
      kind === 'spouse'
        ? !spousesOf(P, id).includes(x.id) && (x.spouses?.length || 0) < 4
        : !x.parents?.includes(id) && parentsOf(P, x.id).filter((y) => !P[y].unknown).length < 2 && !spousesOf(P, id).includes(x.id),
    )
    .map((x) => x.id);
}

type Fields = Pick2<TreePerson, 'name' | 'sex' | 'born' | 'note' | 'contributorId'>;
type Pick2<T, K extends keyof T> = { [Q in K]: T[Q] };

function PersonForm({
  fam,
  P,
  start,
  title,
  busy,
  otherParents,
  couple,
  canBeMe,
  linkable,
  cancel,
  submit,
}: {
  fam: Family;
  P: People;
  start: TreePerson;
  title: string;
  busy: boolean;
  otherParents?: string[];
  /** Adding a husband, wife or partner: ask whether they're married. */
  couple?: boolean;
  /** The viewer isn't on the tree yet, so offer "It's me". */
  canBeMe?: boolean;
  /** Adding someone: people already on the tree who can be linked instead of typed in. Undefined when editing. */
  linkable?: string[];
  cancel: () => void;
  submit: (v: Fields, otherParent?: string | null, partner?: boolean, existing?: string) => void;
}) {
  const [partner, setPartner] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);
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
        if (!name.trim() && !existing) return;
        submit(
          { name: name.trim(), sex, born: born.trim() || null, note: note.trim() || null, contributorId: cook || null },
          otherParents ? other || null : undefined,
          couple ? partner : undefined,
          existing || undefined,
        );
      }}
    >
      <div className="field-label" style={{ fontSize: 15, color: 'var(--ink)', margin: '4px 0 12px' }}>
        {title}
      </div>
      {canBeMe && fam.myContributor && (
        <button
          type="button"
          className={'chip' + (cook === fam.myContributor ? ' on' : '')}
          style={{ marginBottom: 14 }}
          onClick={() => {
            if (cook === fam.myContributor) return setCook('');
            setCook(fam.myContributor!);
            if (!name.trim()) setName(fam.contributors[fam.myContributor!]?.name || '');
          }}
        >
          {cook === fam.myContributor ? '✓ It’s me' : 'It’s me (I’m adding myself)'}
        </button>
      )}
      {existing || picked ? (
        <div className="form-group">
          <div className="field-label">Linked to</div>
          <div className="tree-linked">
            {existing ? <Face fam={fam} p={P[existing]} size={40} /> : <Face fam={fam} p={{ id: 'x', name, contributorId: cook }} size={40} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{existing ? displayName(P, P[existing]) : name}</div>
              <div className="meta">{existing ? 'Already on the tree' : fam.linkByContributor[cook] ? 'In the app' : 'Cook in the app'}</div>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setExisting(null);
                setPicked(false);
                setCook('');
                setName('');
              }}
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div className="form-group">
          <label className="field-label" htmlFor="tp-name">
            Name
          </label>
          <input id="tp-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoFocus />
          {linkable && (
            <LinkPicker
              fam={fam}
              P={P}
              query={name}
              linkable={linkable}
              cooks={cooks.filter((c) => c.id !== fam.myContributor)}
              onTree={(id) => setExisting(id)}
              onCook={(c) => {
                setCook(c.id);
                setPicked(true);
                setName(c.name);
              }}
            />
          )}
        </div>
      )}
      {!existing && (
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
      )}
      {couple && (
        <div className="form-group">
          <div className="field-label">They are</div>
          <div className="also-chips">
            {(
              [
                [false, 'Married'],
                [true, 'Partners'],
              ] as const
            ).map(([v, l]) => (
              <button type="button" key={l} className={'chip chip-sm' + (partner === v ? ' on' : '')} onClick={() => setPartner(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
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
      {!existing && (
      <>
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
      </>
      )}
      <div className="two-btns">
        <button type="button" className="btn btn-outline" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={busy || (!name.trim() && !existing)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/** "Already in the app?" People on the tree or cooks in the app, to link instead of typing a name. */
function LinkPicker({
  fam,
  P,
  query,
  linkable,
  cooks,
  onTree,
  onCook,
}: {
  fam: Family;
  P: People;
  query: string;
  linkable: string[];
  cooks: { id: string; name: string }[];
  onTree: (id: string) => void;
  onCook: (c: { id: string; name: string }) => void;
}) {
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const hit = (n: string) => !q || n.toLowerCase().split(/s+/).some((w) => w.startsWith(q)) || n.toLowerCase().includes(q);
  const rows = [
    ...linkable.map((id) => ({ key: 't' + id, name: displayName(P, P[id]), sub: 'On the tree', face: P[id], pick: () => onTree(id) })),
    ...cooks.map((c) => ({
      key: 'c' + c.id,
      name: c.name,
      sub: fam.linkByContributor[c.id] ? 'In the app' : plural(fam.recipes.filter((r) => r.contributor === c.id).length, 'recipe'),
      face: { id: 'c' + c.id, name: c.name, contributorId: c.id } as TreePerson,
      pick: () => onCook(c),
    })),
  ]
    .filter((r) => hit(r.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, q ? 8 : 4);
  return (
    <div className="tree-pick">
      <div className="field-help" style={{ margin: '10px 0 4px' }}>
        {q ? 'Is it one of these? Tap to link them.' : 'Already in the app? Tap to link them, or type a new name.'}
      </div>
      {shown.map((r) => (
        <button type="button" key={r.key} className="tree-pick-row" onClick={r.pick}>
          <Face fam={fam} p={r.face} size={30} />
          <span className="t">{r.name}</span>
          <span className="meta">{r.sub}</span>
        </button>
      ))}
      {!q && !all && rows.length > 4 && (
        <button type="button" className="link-btn" style={{ marginTop: 4 }} onClick={() => setAll(true)}>
          Show more
        </button>
      )}
    </div>
  );
}
