/**
 * The family tree: people, who their parents are and who they married.
 * Brothers and sisters are worked out from shared parents, and every relationship
 * ("Niece", "Second cousin", "Sister-in-law") is worked out from those two links.
 */

export interface TreePerson {
  id: string;
  name: string;
  sex?: 'f' | 'm' | null;
  /** Up to two ids. */
  parents?: string[];
  spouses?: string[];
  /** Their cook on the recipe list, so the tree can show their recipes. */
  contributorId?: string | null;
  born?: string | null;
  note?: string | null;
  /** A parent we know exists but whose name hasn't been added yet. */
  unknown?: boolean;
}

/** The person the tree is centered on. It was her idea. */
export const FOCUS = 'jeanette';

export const SEED: TreePerson[] = [
  { id: 'jeanette', name: 'Jeanette Russell', sex: 'f', parents: ['jeanette-mom', 'jeanette-dad'], contributorId: 'jeanette' },
  { id: 'jeanette-mom', name: '', sex: 'f', unknown: true, spouses: ['jeanette-dad'] },
  { id: 'jeanette-dad', name: '', sex: 'm', unknown: true, spouses: ['jeanette-mom'] },
  { id: 'elaine-sister', name: 'Elaine', sex: 'f', parents: ['jeanette-mom', 'jeanette-dad'] },
  { id: 'sharon-sister', name: 'Sharon', sex: 'f', parents: ['jeanette-mom', 'jeanette-dad'] },
  { id: 'luke', name: 'Luke Dunigan', sex: 'm', parents: ['jeanette'] },
];

export type People = Record<string, TreePerson>;

export const byId = (list: TreePerson[]): People => Object.fromEntries(list.map((p) => [p.id, p]));

const g = (sex: TreePerson['sex'], f: string, m: string, n: string) => (sex === 'f' ? f : sex === 'm' ? m : n);

export const parentsOf = (P: People, id: string) => (P[id]?.parents || []).filter((x) => P[x]);
export const spousesOf = (P: People, id: string) => (P[id]?.spouses || []).filter((x) => P[x]);
export const childrenOf = (P: People, id: string) => Object.values(P).filter((p) => p.parents?.includes(id)).map((p) => p.id);
export function siblingsOf(P: People, id: string) {
  const mine = parentsOf(P, id);
  if (!mine.length) return [];
  return Object.values(P)
    .filter((p) => p.id !== id && p.parents?.some((x) => mine.includes(x)))
    .map((p) => p.id);
}

const first = (p: TreePerson) => p.name.trim().split(/\s+/)[0];

/** "Jeanette's mom" for a parent whose name hasn't been added yet. */
export function displayName(P: People, p: TreePerson) {
  if (!p.unknown && p.name.trim()) return p.name.trim();
  const kid = childrenOf(P, p.id).map((id) => P[id]).find((k) => k && !k.unknown);
  const role = g(p.sex, 'mom', 'dad', 'parent');
  return kid ? `${first(kid)}’s ${role}` : g(p.sex, 'Mother', 'Father', 'Parent');
}
export const shortName = (P: People, p: TreePerson) => (p.unknown || !p.name.trim() ? displayName(P, p) : first(p));

/** Each ancestor (and the person themselves, at 0) with how many generations up they are. */
function ancestors(P: People, id: string) {
  const out = new Map<string, number>([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const p of parentsOf(P, cur)) {
      if (!out.has(p)) {
        out.set(p, out.get(cur)! + 1);
        queue.push(p);
      }
    }
  }
  return out;
}

/** Closest shared ancestor: how far up from a, and from b. */
function blood(P: People, a: string, b: string): [number, number] | null {
  const A = ancestors(P, a);
  const B = ancestors(P, b);
  let best: [number, number] | null = null;
  for (const [id, da] of A) {
    const db = B.get(id);
    if (db === undefined) continue;
    if (!best || da + db < best[0] + best[1]) best = [da, db];
  }
  return best;
}

const greats = (n: number) => (n > 0 ? 'Great-' + 'great-'.repeat(n - 1) : '');
const lowerFirst = (s: string) => s.replace(/^Great-/, 'great-').replace(/^./, (c) => c.toLowerCase());
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times'];

/** What b is to a, by blood ("Niece", "Grandmother", "Second cousin once removed"). */
function bloodLabel(da: number, db: number, sex: TreePerson['sex']): string {
  if (da === 0 && db === 0) return 'Self';
  if (da === 0) {
    if (db === 1) return g(sex, 'Daughter', 'Son', 'Child');
    return greats(db - 2) + (db - 2 ? 'grand' : 'Grand') + g(sex, 'daughter', 'son', 'child');
  }
  if (db === 0) {
    if (da === 1) return g(sex, 'Mother', 'Father', 'Parent');
    return greats(da - 2) + (da - 2 ? 'grand' : 'Grand') + g(sex, 'mother', 'father', 'parent');
  }
  if (da === 1 && db === 1) return g(sex, 'Sister', 'Brother', 'Sibling');
  if (da === 1) {
    const base = g(sex, 'niece', 'nephew', 'niece or nephew');
    if (db === 2) return base[0].toUpperCase() + base.slice(1);
    return greats(db - 3) + (db - 3 ? 'grand' : 'Grand') + base;
  }
  if (db === 1) {
    const base = g(sex, 'aunt', 'uncle', 'aunt or uncle');
    if (da === 2) return base[0].toUpperCase() + base.slice(1);
    return greats(da - 2) + base;
  }
  const degree = Math.min(da, db) - 1;
  const removed = Math.abs(da - db);
  return `${ORD[degree] || degree + 'th'} cousin` + (removed ? ` ${TIMES[removed] || removed + ' times'} removed` : '');
}

/**
 * What person b is to person a, e.g. relation(P, 'jeanette', 'luke') → "Son".
 * Null when they aren't connected in the tree.
 */
export function relation(P: People, a: string, b: string): string | null {
  if (!P[a] || !P[b]) return null;
  if (a === b) return 'Self';
  const sexB = P[b].sex;
  const bl = blood(P, a, b);
  if (bl) return bloodLabel(bl[0], bl[1], sexB);
  if (spousesOf(P, a).includes(b)) return g(sexB, 'Wife', 'Husband', 'Spouse');

  // b married one of a's relatives.
  for (const s of spousesOf(P, b)) {
    const r = blood(P, a, s);
    if (!r) continue;
    const [da, db] = r;
    if (da === 0 && db === 1) return g(sexB, 'Daughter-in-law', 'Son-in-law', 'Child-in-law');
    if (da === 1 && db === 1) return g(sexB, 'Sister-in-law', 'Brother-in-law', 'Sibling-in-law');
    if (da === 1 && db === 0) return g(sexB, 'Stepmother', 'Stepfather', 'Stepparent');
    if (db === 1 && da >= 2) return bloodLabel(da, db, sexB); // an aunt's husband is an uncle
    return `${bloodLabel(da, db, P[s].sex)}’s ${g(sexB, 'wife', 'husband', 'spouse')}`;
  }
  // b is one of a's husband's or wife's relatives.
  for (const s of spousesOf(P, a)) {
    const r = blood(P, s, b);
    if (!r) continue;
    const [da, db] = r;
    if (da === 1 && db === 0) return g(sexB, 'Mother-in-law', 'Father-in-law', 'Parent-in-law');
    if (da === 1 && db === 1) return g(sexB, 'Sister-in-law', 'Brother-in-law', 'Sibling-in-law');
    if (da === 0 && db === 1) return g(sexB, 'Stepdaughter', 'Stepson', 'Stepchild');
    return `${g(P[s].sex, 'Wife', 'Husband', 'Spouse')}’s ${lowerFirst(bloodLabel(da, db, sexB))}`;
  }
  return connected(P, a, b) ? 'Family by marriage' : null;
}

function connected(P: People, a: string, b: string) {
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === b) return true;
    for (const n of [...parentsOf(P, cur), ...spousesOf(P, cur), ...childrenOf(P, cur)]) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

/** Generation of everyone connected to the focus: -1 parents, 0 her generation, 1 children… */
export function generations(P: People, focus: string) {
  const gen = new Map<string, number>([[focus, 0]]);
  const queue = [focus];
  while (queue.length) {
    const cur = queue.shift()!;
    const n = gen.get(cur)!;
    const next: [string, number][] = [
      ...parentsOf(P, cur).map((x) => [x, n - 1] as [string, number]),
      ...childrenOf(P, cur).map((x) => [x, n + 1] as [string, number]),
      ...spousesOf(P, cur).map((x) => [x, n] as [string, number]),
    ];
    for (const [id, v] of next) {
      if (!gen.has(id)) {
        gen.set(id, v);
        queue.push(id);
      }
    }
  }
  return gen;
}

export function generationTitle(n: number, focusName: string) {
  if (n === 0) return `${focusName}’s generation`;
  if (n === -1) return 'Parents';
  if (n === -2) return 'Grandparents';
  if (n < -2) return greats(-n - 2) + 'grandparents';
  if (n === 1) return 'Children';
  if (n === 2) return 'Grandchildren';
  return greats(n - 2) + 'grandchildren';
}

/** Adds a parent to `childId`. Fills in a nameless placeholder parent when there is one. */
export function withParent(P: People, childId: string, parent: TreePerson): TreePerson[] {
  const child = P[childId];
  const mine = parentsOf(P, childId);
  const placeholder = mine.map((id) => P[id]).find((p) => p.unknown && (!parent.sex || !p.sex || p.sex === parent.sex));
  if (placeholder) return [{ ...placeholder, ...parent, id: placeholder.id, unknown: false, parents: placeholder.parents, spouses: placeholder.spouses }];
  if (mine.length >= 2) return [];
  const other = mine[0];
  const out: TreePerson[] = [{ ...parent, spouses: other ? [other] : [] }];
  if (other) out.push({ ...P[other], spouses: [...new Set([...(P[other].spouses || []), parent.id])] });
  // Brothers and sisters who share the one known parent get the new one too.
  const kids = other ? Object.values(P).filter((p) => p.parents?.length === 1 && p.parents[0] === other) : [child];
  for (const k of kids) out.push({ ...k, parents: [...(k.parents || []), parent.id] });
  return out;
}

/** Adds a brother or sister. Gives the person placeholder parents first if they have none. */
export function withSibling(P: People, personId: string, sib: TreePerson, newId: () => string): TreePerson[] {
  const mine = parentsOf(P, personId);
  if (mine.length) return [{ ...sib, parents: mine }];
  const mom: TreePerson = { id: newId(), name: '', sex: 'f', unknown: true };
  const dad: TreePerson = { id: newId(), name: '', sex: 'm', unknown: true };
  mom.spouses = [dad.id];
  dad.spouses = [mom.id];
  return [mom, dad, { ...P[personId], parents: [mom.id, dad.id] }, { ...sib, parents: [mom.id, dad.id] }];
}

export function withSpouse(P: People, personId: string, spouse: TreePerson): TreePerson[] {
  const p = P[personId];
  return [{ ...spouse, spouses: [personId] }, { ...p, spouses: [...new Set([...(p.spouses || []), spouse.id])] }];
}

export function withChild(_P: People, personId: string, child: TreePerson, otherParent: string | null): TreePerson[] {
  return [{ ...child, parents: otherParent ? [personId, otherParent] : [personId] }];
}

