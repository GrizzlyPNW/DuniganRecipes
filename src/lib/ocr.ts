/**
 * Reads a recipe card photo on the phone (Tesseract OCR, no server, no account)
 * and sorts the text into a title, ingredients and steps for someone to check.
 */

export type CardText = {
  title: string;
  temp: string;
  makes: string;
  note: string;
  ingredients: string[];
  steps: string[];
  raw: string;
};

/** Gets a saved photo. If the phone's offline copy can't be opened, asks the server for a fresh one. */
async function load(url: string): Promise<Blob> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {
    /* try a fresh copy */
  }
  const fresh = url + (url.includes('?') ? '&' : '?') + 'read=' + Date.now();
  const res = await fetch(fresh, { cache: 'no-store' });
  if (!res.ok) throw new Error('Photo not found');
  return res.blob();
}

/** Shrinks and sharpens a photo so OCR is faster and more accurate. */
async function prepare(src: Blob | string): Promise<HTMLCanvasElement> {
  const blob = typeof src === 'string' ? await load(src) : src;
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  // Grayscale with a contrast boost: faded ink on cream card reads much better.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 150));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Text from one or more photos (front, back). `progress` gets 0–1. */
export async function readCard(photos: (Blob | string)[], progress?: (p: number) => void): Promise<CardText> {
  const { createWorker } = await import('tesseract.js');
  let done = 0;
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') progress?.((done + m.progress) / photos.length);
    },
  });
  try {
    const texts: string[] = [];
    let title = '';
    for (const p of photos) {
      const { data } = await worker.recognize(await prepare(p), {}, { text: true, blocks: true });
      const text = keepThisRecipe(columnText(data as unknown as OcrPage), title);
      if (!title) title = sortCard(text).title;
      texts.push(text);
      done++;
    }
    return sortCard(texts.join('\n'));
  } finally {
    await worker.terminate();
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; bbox: Box };
export type OcrPage = { text: string; blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null };

/**
 * Text in reading order for a card with two columns (ingredients beside steps). OCR reads
 * straight across, mixing the columns, so this finds the empty strip between them and reads
 * the left column before the right. Cards without columns come back as they were read.
 */
export function columnText(page: OcrPage) {
  const lines = (page.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => l.words.filter((w) => w.text.trim()))));
  const rows = lines.filter((ws) => ws.length);
  if (rows.length < 4) return page.text;
  const left = Math.min(...rows.map((ws) => ws[0].bbox.x0));
  const right = Math.max(...rows.map((ws) => ws[ws.length - 1].bbox.x1));
  const width = right - left;
  // How many lines have a wide gap that crosses x, with words on both sides.
  const splitsAt = (ws: OcrWord[], x: number) => {
    const h = Math.max(8, ...ws.map((w) => w.bbox.y1 - w.bbox.y0));
    for (let i = 1; i < ws.length; i++) {
      const a = ws[i - 1].bbox.x1;
      const b = ws[i].bbox.x0;
      if (a < x && b > x && b - a > h * 1.2) return true;
    }
    return false;
  };
  const covers = (ws: OcrWord[], x: number) => ws.some((w) => w.bbox.x0 < x && w.bbox.x1 > x);
  let best = 0;
  let bestX = 0;
  for (let x = left + width * 0.15; x < left + width * 0.7; x += width / 100) {
    const n = rows.filter((ws) => splitsAt(ws, x)).length;
    const crossed = rows.filter((ws) => covers(ws, x)).length;
    if (n - crossed > best) {
      best = n - crossed;
      bestX = x;
    }
  }
  if (best < 4) return page.text;
  // A line split at the strip goes into two columns; a run of them is read left, then right.
  const out: string[] = [];
  let colL: string[] = [];
  let colR: string[] = [];
  const flush = () => {
    out.push(...colL, ...colR);
    colL = [];
    colR = [];
  };
  const join = (ws: OcrWord[]) => ws.map((w) => w.text).join(' ');
  for (const ws of rows) {
    if (covers(ws, bestX)) {
      flush();
      out.push(join(ws));
      continue;
    }
    const l = ws.filter((w) => w.bbox.x1 <= bestX);
    const r = ws.filter((w) => w.bbox.x0 >= bestX);
    // Only one side: a heading or wrapped line. Keep it in its column.
    if (l.length) colL.push(join(l));
    if (r.length) colR.push(join(r));
  }
  flush();
  return out.join('\n');
}

/** A printed "Page Break" or a row of dashes or dots. */
const BREAK = /page\s*break|^[\s\-–—_.:oe°]{8,}$/i;
const words = (s: string) => s.toLowerCase().match(/[a-z]{4,}/g) || [];

/**
 * A photo of a printed page can show the end of the page before it and the top of the next
 * recipe. Keeps only the parts, between page breaks, that belong to this recipe.
 */
export function keepThisRecipe(text: string, title: string) {
  const parts: string[][] = [[]];
  for (const l of text.split('\n')) {
    if (BREAK.test(l.trim()) && l.trim().length > 6) parts.push([]);
    else parts[parts.length - 1].push(l);
  }
  const chunks = parts.map((p) => p.join('\n')).filter((p) => /[A-Za-z]{4,}/.test(p));
  if (chunks.length <= 1) return chunks[0] || '';
  const tw = words(title).filter((w) => !['with', 'from', 'back'].includes(w));
  // The part with this recipe's name (or "(back)") on it, if we can tell.
  const mine = (c: string) => {
    const cw = new Set(words(c.split('\n').slice(0, 6).join(' ')));
    // Most of the name, so "Apple Slaw with Cider Dressing" isn't taken for "Apple Cider Pulled Pork".
    return tw.length ? tw.filter((w) => cw.has(w)).length >= Math.max(1, Math.ceil(tw.length * 0.75)) : /\(back\)/i.test(c);
  };
  const keep = chunks.filter(mine);
  return (keep.length ? keep : [chunks.reduce((a, b) => (b.length > a.length ? b : a))]).join('\n');
}

const FRACTIONS: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛' };
const UNITS =
  /\b(c|cups?|tsp|t|tbsp|tbs|tbl|T|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|pkgs?|packages?|cans?|sticks?|pints?|qts?|quarts?|gal|pinch|dash|cloves?|slices?|dozen|jars?|boxe?s?|bunch|handful|envelopes?)\b\.?/i;

const tidy = (l: string) =>
  l
    // Stray marks from the card's printed lines and borders at the start of a line.
    .replace(/^[^A-Za-z0-9½¼¾⅓⅔⅛|]+/, '')
    // Round bullets come out as "e", "eo" or "o".
    .replace(/^(?:eo?|oe?|e°)\s+(?=[\d½¼¾⅓⅔⅛A-Z])/, '')
    // Units stuck to the word: "3 gcinnamon", "1.5gginger"; and "0.5 g" read as "0.59".
    .replace(/(\d)g(?=[a-z]{3,})/g, '$1 g ')
    .replace(/(\d) g(?!al|r)(?=[a-z]{3,})/g, '$1 g ')
    .replace(/\b(\d+\.\d)9(?=\s+[a-z])/g, '$1 g')
    // A lone | or l before a word is almost always a 1; ½ often comes out as %.
    .replace(/^[|l!]\s+(?=[a-z])/, '1 ')
    .replace(/\b(\d)%(?=\s*(?:c\b|cups?|tsp|tbsp|t\b|teaspoons?|tablespoons?|lbs?|oz|sticks?))/gi, '$1½')
    .replace(/\bIb(s?)\b/g, 'lb$1')
    .replace(/\b(\d)o\b/g, '$10')
    .replace(/jalape(?:fi|ñ|n)os/gi, 'jalapeños')
    .replace(/[|_~`•■□©®]+/g, ' ')
    .replace(/\s[=<>»«]+(?=\s|$)/g, ' ')
    .replace(/¥/g, '½')
    // Noise from the card's edge before an amount ("Foe! 1 cup…") or a sentence ("vo Butter…").
    .replace(/^\S{1,4}\s+(?=[\d½¼¾⅓⅔⅛]\S*\s+[a-zA-Z])/, '')
    .replace(/^[a-z]{1,3}\s+(?=[A-Z][a-z])/, '')
    // …and after it ("eggnog 2", "syrup :").
    .replace(/(\s+[^\sA-Za-z0-9()]{1,2})+\s*$/, '')
    .replace(/\b(\d)\/(\d)\b/g, (m) => FRACTIONS[m] || m)
    .replace(/(\d) ([½¼¾⅓⅔⅛])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

/** A line that looks like "1 c. sugar", "2 eggs", "½ tsp salt" or "Salt to taste". */
function isIngredient(l: string) {
  if (l.length > 70 || /[a-z][.;] +[A-Z]/.test(l)) return false; // a sentence, so part of the method
  if (/^\d{1,2}[.)]\s+[A-Z]/.test(l)) return false; // "1. Preheat the oven…" is a numbered step
  if (/^[\d½¼¾⅓⅔⅛]/.test(l)) return true;
  if (/^(a |an |one |two |three |few |several )?(pinch|dash|handful)/i.test(l)) return true;
  if (/\bto taste\b/i.test(l) && l.length < 40) return true;
  return UNITS.test(l.split(' ').slice(0, 3).join(' ')) && !/[.!]$/.test(l) && l.split(' ').length <= 8;
}

/** Real words, not OCR noise like "I= Yul" or "LT". */
const hasWords = (l: string) => /[A-Za-z]{4,}/.test(l) || /^[\d½¼¾⅓⅔⅛]+\s+[a-z]{2,}/i.test(l);

// Printed card headings that aren't part of the recipe.
const BOILERPLATE = /^(recipe( for)?|from( the)?( kitchen| desk)?( of)?|ingredients|directions|instructions|method|steps|serves|servings|yield|makes|prep time|cook time)\s*:?\s*$/i;
const FROM_LINE = /^(from|from the kitchen of|from the desk of|recipe from)\b/i;

/** Sorts OCR text into the recipe form's fields. Exported for testing. */
export function sortCard(raw: string): CardText {
  raw = raw
    .split('\n')
    .filter((l) => !BREAK.test(l.trim()))
    .join('\n');
  const sections = bySection(raw);
  const lines = raw
    .split('\n')
    .map(tidy)
    .filter((l) => hasWords(l) && !BOILERPLATE.test(l));

  let temp = '';
  let makes = '';
  // Oven temperature: a 3-digit number near "oven", "bake" or "preheat" (not a candy temperature).
  const flat = raw.replace(/\s+/g, ' ');
  const t =
    flat.match(/\b(\d{3})\s*[°º]?\s*F\b/) ||
    flat.match(/(?:oven|bake|baked|baking|preheat)[^.]{0,40}?\b(\d{3})\b(?!\s*[°º]?\s*C\b)/i) ||
    flat.match(/^\s*(\d{3})\s*(?:°|º|degrees)/im);
  if (t && +t[1] >= 200 && +t[1] <= 550) temp = t[1] + '°';
  const mk = flat.match(/\b(?:makes|yields?)\s+(?:about\s+)?(\d[^.;]{0,30})/i);
  if (mk) makes = mk[1].trim();
  // "Source: Luke's own • Serves 4 with leftovers • Smoke: 7–9 hr" under the title.
  const sv = flat.match(/\bserves\s+(\d[\d\s–-]*(?:\s*(?:with|to|people|as)[A-Za-z ]{0,20})?)/i);
  if (sv && !makes) makes = sv[1].replace(/\s+[A-Z][a-z]*$/, '').trim();

  const rest: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(serves|makes|yield|yields|servings)\s*:?\s*((?:about\s+)?\d.*)$/i);
    if (/^(source|from)\s*:.*(serves|•)/i.test(l)) continue;
    if (m) {
      if (!makes || /^serv/i.test(m[1])) makes = /^serv/i.test(m[1]) && /^\d[\d\s–-]*$/.test(m[2]) ? m[2] + ' servings' : m[2];
      continue;
    }
    if (FROM_LINE.test(l)) continue;
    rest.push(l.replace(/^recipe( for)?\s*:\s*/i, ''));
  }

  // Title: the first short line that isn't an ingredient or a category heading.
  let title = '';
  const ti = rest.findIndex((l, i) => i < 5 && l.length <= 50 && !isIngredient(l) && !isCategory(l));
  if (ti >= 0) title = rest.splice(ti, 1)[0].replace(/[.:]$/, '').replace(/\s*\(back\)\s*$/i, '');

  // A printed card with Ingredients / Steps / Notes headings: trust the headings.
  if (sections) {
    // Headings repeated at the top of the back of the card aren't part of the recipe.
    const tw = words(title).join(' ');
    const extra = (l: string) => isCategory(l) || /\(back\)\s*$/i.test(l) || (!!tw && words(l).join(' ') === tw);
    const clean = (ls: string[]) => ls.map(tidy).filter((l) => l && !extra(l));
    const ingredients = joinWrapped(clean(sections.ingredients).filter(hasWords));
    // A wrapped step line can be all numbers: "107–121 °C (225–250 °F)."
    const steps = splitSteps(clean(sections.steps).filter((l) => /[A-Za-z0-9]{2,}/.test(l)));
    const note = clean(sections.notes).filter(hasWords).join(' ');
    return { title, temp, makes, note, ingredients, steps, raw };
  }

  const ingredients: string[] = [];
  const stepText: string[] = [];
  for (const l of rest) {
    const prev = ingredients[ingredients.length - 1];
    // "4 tablespoons butter or" + "margarine": a wrapped ingredient line.
    if (prev && stepText.length === 0 && /\b(or|and|of|plus|,)$/i.test(prev) && /^[a-z]/.test(l) && l.split(' ').length <= 4) {
      ingredients[ingredients.length - 1] = prev + ' ' + l;
      continue;
    }
    // Once the method starts, everything after it is method (wrapped lines often start with a number).
    if (stepText.length) stepText.push(l);
    else if (isIngredient(l)) ingredients.push(l);
    // A part name like "Filling" or "Topping:" above its ingredients.
    else if (/:$/.test(l) && l.length <= 40) ingredients.push(l);
    else if (/^[A-Z][A-Za-z' &-]*$/.test(l) && l.split(' ').length <= 3) ingredients.push(l + ':');
    else stepText.push(l);
  }

  // "Makes 3 dozen." at the end of the method belongs in Makes, not in a step.
  const steps = splitSteps(stepText)
    .map((s) => s.replace(/\s*\b(?:makes|yields?)\s+(?:about\s+)?\d[^.;]{0,30}\.?\s*$/i, '').trim())
    .filter(Boolean);
  return { title, temp, makes, note: '', ingredients, steps, raw };
}

const isCategory = (l: string) => /^[A-Z&,' ]{4,}$/.test(l.trim()) && l.trim().split(' ').length <= 4;

const HEAD: Record<string, 'ingredients' | 'steps' | 'notes'> = {
  ingredients: 'ingredients',
  steps: 'steps',
  directions: 'steps',
  instructions: 'steps',
  method: 'steps',
  notes: 'notes',
  note: 'notes',
  tips: 'notes',
};
/** Splits text under "INGREDIENTS", "STEPS" and "NOTES" headings. Null if the card has none. */
function bySection(raw: string) {
  const out = { ingredients: [] as string[], steps: [] as string[], notes: [] as string[] };
  let cur: keyof typeof out | null = null;
  let found = 0;
  for (const line of raw.split('\n')) {
    const l = line.trim();
    // OCR often clips the first letters of a heading at the photo's edge ("REDIENTS", "TES").
    const h = l.toLowerCase().replace(/[^a-z]/g, '');
    const key =
      l.length <= 16 && /^[A-Z\s:]+$/.test(l)
        ? HEAD[h] || (h.length >= 5 && 'ingredients'.endsWith(h) ? 'ingredients' : h.length >= 3 && 'notes'.endsWith(h) ? 'notes' : undefined)
        : undefined;
    if (key) {
      cur = key;
      found++;
      continue;
    }
    if (cur) out[cur].push(l);
  }
  return found && (out.ingredients.length || out.steps.length) ? out : null;
}

/** "Apple spice pork" + "seasoning, enough to coat" + "generously": one ingredient. */
function joinWrapped(lines: string[]) {
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const open = prev && (prev.split('(').length > prev.split(')').length || /\b(or|and|of|to|for|plus|with|the|a)$|[,(–-]$/i.test(prev));
    if (prev && (open || /^[a-z(]/.test(l))) out[out.length - 1] = prev + ' ' + l;
    else out.push(l);
  }
  return out;
}

/** Joins wrapped lines back together, then splits on step numbers or sentences. */
function splitSteps(lines: string[]) {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const numbered = text.split(/(?:^|\s)\d{1,2}[.)]\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 2) return numbered;
  return (text.match(/[^.!?]+(?:[.!?]+|$)/g) || [text])
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    // Very short sentences ("Stir.") read better with the one before.
    .reduce<string[]>((out, s) => {
      if (out.length && s.length < 18) out[out.length - 1] += ' ' + s;
      else out.push(s);
      return out;
    }, []);
}
