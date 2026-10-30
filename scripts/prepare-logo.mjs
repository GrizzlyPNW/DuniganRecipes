// Makes web-sized copies of design/logo-original.png with the white background made transparent.
// Run with: node scripts/prepare-logo.mjs
import sharp from 'sharp';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'design/logo-original.png');

// Fade pure-white background pixels to transparent (the logo's own cream outline stays).
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  if (min > 250) data[i + 3] = 0;
  else if (min > 238) data[i + 3] = Math.round(((250 - min) / 12) * data[i + 3]);
}
const clean = sharp(data, { raw: info }).trim({ threshold: 1 });
const buf = await clean.png().toBuffer();

for (const [name, width] of [['logo.png', 900], ['logo-header.png', 420]]) {
  await sharp(buf).resize({ width }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(root, 'public', name));
}
for (const [name, width] of [['logo.webp', 900], ['logo-header.webp', 420]]) {
  await sharp(buf).resize({ width }).webp({ quality: 88 }).toFile(path.join(root, 'public', name));
}
console.log('Logo files written.');
