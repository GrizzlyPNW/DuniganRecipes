/**
 * Reads a recipe card photo on the phone (Tesseract OCR, no server, no account)
 * and sorts the text into a title, ingredients and steps for someone to check.
 */

export type CardText = {
  title: string;
  temp: string;
  makes: string;
  ingredients: string[];
  steps: string[];
  raw: string;
};

/** Shrinks and sharpens a photo so OCR is faster and more accurate. */
async function prepare(src: Blob | string): Promise<HTMLCanvasElement> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
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
    for (const p of photos) {
      const { data } = await worker.recognize(await prepare(p));
      texts.push(data.text);
      done++;
    }
    return sortCard(texts.join('\n'));
  } finally {
    await worker.terminate();
  }
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
    .replace(/(\d)%/g, '$1½')
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

  const rest: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(serves|makes|yield|yields|servings)\s*:?\s*(.+)$/i);
    if (m) {
      if (!makes || /^serv/i.test(m[1])) makes = /^serv/i.test(m[1]) && /^\d[\d\s–-]*$/.test(m[2]) ? m[2] + ' servings' : m[2];
      continue;
    }
    if (FROM_LINE.test(l)) continue;
    rest.push(l.replace(/^recipe( for)?\s*:\s*/i, ''));
  }

  // Title: the first short line that isn't an ingredient.
  let title = '';
  const ti = rest.findIndex((l, i) => i < 4 && l.length <= 50 && !isIngredient(l));
  if (ti >= 0) title = rest.splice(ti, 1)[0].replace(/[.:]$/, '');

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
  return { title, temp, makes, ingredients, steps, raw };
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
