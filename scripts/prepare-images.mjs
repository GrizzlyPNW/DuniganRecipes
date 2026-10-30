// Turns the full-size card scans in originals/ into phone-sized JPEGs in public/cards/,
// writes src/data/recipes.json pointing at them, and draws the app icons.
// Run with: npm run images
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = JSON.parse(await fs.readFile(path.join(root, 'design/recipes.json'), 'utf8'));
const outDir = path.join(root, 'public/cards');
await fs.mkdir(outDir, { recursive: true });

const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let before = 0, after = 0;

for (const r of src.recipes) {
  const out = [];
  for (const p of r.cardImages) {
    const file = path.join(root, 'originals', path.basename(p));
    const name = slug(path.basename(p, path.extname(p))) + '.jpg';
    const dest = path.join(outDir, name);
    before += (await fs.stat(file)).size;
    await sharp(file).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(dest);
    after += (await fs.stat(dest)).size;
    out.push('/cards/' + name);
  }
  r.cardImages = out;
  delete r.typed;
}

await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
await fs.writeFile(path.join(root, 'src/data/recipes.json'), JSON.stringify(src, null, 2));
console.log(`Card photos: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);

const icon = await fs.readFile(path.join(root, 'public/icon.svg'));
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(icon, { density: 300 }).resize(size, size).png().toFile(path.join(root, 'public', file));
}
console.log('Icons written.');
