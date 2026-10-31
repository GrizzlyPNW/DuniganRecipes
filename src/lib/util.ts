import type { Contributor } from '../types';

/** Avatar background/text colors for a contributor hue (60 = the neutral "unsigned" one). */
export function avatarColors(hue: number): [string, string] {
  return hue === 60 ? ['#e6ded0', '#5f554c'] : [`oklch(0.87 0.06 ${hue})`, `oklch(0.38 0.09 ${hue})`];
}

/** Minutes mentioned in a step ("12 min", "1 hour", "1¼ hrs", "½ hr"), or null. */
export function timerMins(t: string): number | null {
  if (/½\s*hrs?\b/i.test(t)) return 30;
  if (/1¼\s*hrs?\b/i.test(t)) return 75;
  if (/1½\s*hrs?\b/i.test(t)) return 90;
  const m = t.match(/(\d+)(?:\s*(?:–|-|to)\s*\d+)?\s*(min|mins|minutes|hours?|hrs?)\b/i);
  if (!m) return null;
  return /^h/i.test(m[2]) ? +m[1] * 60 : +m[1];
}

export function minsLabel(m: number) {
  if (m >= 60) {
    const h = m / 60;
    return (Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')) + ' hr';
  }
  return m + ' min';
}

export function ago(ts: number) {
  const d = Math.round((Date.now() - ts) / 60000);
  if (d < 1) return 'just now';
  if (d < 60) return d + ' min ago';
  if (d < 1440) return Math.round(d / 60) + ' hr ago';
  if (d < 1440 * 7) return Math.round(d / 1440) + (Math.round(d / 1440) === 1 ? ' day ago' : ' days ago');
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function makeContributor(name: string, taken: Record<string, Contributor>): Contributor {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cook';
  let id = base;
  for (let i = 2; taken[id]; i++) id = base + '-' + i;
  const first = name.trim().split(/\s+/)[0];
  // Spread hues so new cooks get a color that isn't already in use.
  const used = new Set(Object.values(taken).map((c) => c.hue));
  let hue = 0;
  for (const h of [340, 100, 230, 280, 180, 10, 140, 320, 270]) if (!used.has(h)) { hue = h; break; }
  return { id, name: name.trim(), short: first, ini: initials(name), hue: hue || 330 };
}

/* ---------- "Are you this person?" name matching ---------- */

const nameWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/'/g, ''))
    .filter(Boolean);

function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** 1 = same word, lower = close (a typo, a short form like Jeff/Jeffrey), 0 = different. */
function wordLike(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // "D." on the card stands for any last name starting with D.
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  const dist = editDistance(a, b);
  const len = Math.max(a.length, b.length);
  if (dist === 1 && len >= 4) return 0.8;
  if (dist === 2 && len >= 6) return 0.6;
  return 0;
}

/**
 * Cooks on the family list whose name is close to "first last", best first.
 * A first-name match alone still counts (people's last names change), just lower.
 */
export function likelyMatches<T extends { id: string; name: string; short?: string }>(first: string, last: string, people: T[]) {
  const f = nameWords(first)[0] || '';
  const l = nameWords(last).pop() || '';
  return people
    .map((p) => {
      const words = nameWords(p.name);
      const pf = words[0] || '';
      const pl = words.length > 1 ? words[words.length - 1] : '';
      const firstScore = Math.max(wordLike(f, pf), wordLike(f, nameWords(p.short || '')[0] || ''));
      const lastScore = pl ? wordLike(l, pl) : 0.5;
      return { person: p, score: firstScore * 0.6 + lastScore * 0.4, firstScore };
    })
    .filter((m) => m.firstScore >= 0.8 && m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.person);
}

export const newId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Lines from a textarea, trimmed, blanks dropped, leading "1." / "-" bullets removed. */
export function lines(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);
}

// Lines like "Method" or "Ingredients:" that only repeat the form's own labels.
const LABEL_ONLY = /^(method|instructions|directions|steps|preparation|ingredients)\s*:?$/i;
const heading = (t: string) => '## ' + t.replace(/^#+\s*/, '').replace(/:\s*$/, '').trim();

/** Ingredient lines. "## Topping" or "Topping:" becomes a section heading. */
export function parseIngredients(text: string) {
  return lines(text)
    .filter((l) => !LABEL_ONLY.test(l))
    .map((l) => (/^#/.test(l) || (/:$/.test(l) && l.length <= 50) ? heading(l) : l));
}

/**
 * Step lines. Section titles pasted in with the steps ("Apple filling", "Caramel sauce:")
 * become headings instead of numbered steps: a "## " line, a short line ending in ":",
 * or a short title-like line with no sentence punctuation and no numbers.
 */
export function parseSteps(text: string) {
  const looksLikeTitle = (l: string) =>
    l.length <= 40 && l.split(/\s+/).length <= 5 && /^[A-Z]/.test(l) && !/[.!?)]$/.test(l) && !/\d/.test(l);
  return lines(text)
    .filter((l) => !LABEL_ONLY.test(l))
    .map((l) => (/^#/.test(l) || (/:$/.test(l) && l.length <= 50) || looksLikeTitle(l) ? heading(l) : l));
}
