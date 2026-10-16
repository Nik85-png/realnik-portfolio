// Downloads the Google Fonts woff2 files this site uses and writes them into
// public/fonts/, regenerating src/styles/fonts.css with local URLs. Run it only
// when the font families or weights in Layout.astro change.
//
//   node scripts/self-host-fonts.mjs

import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const url = 'https://fonts.googleapis.com/css2?family=Azeret+Mono:ital,wght@0,300..700;1,300..700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap';
const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

const outDir = 'public/fonts';
fs.mkdirSync(outDir, { recursive: true });

const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');
const faces = [];
let localCss = `/* Self-hosted fonts — mirrored byte-for-byte from the Google Fonts CDN files
   that Layout.astro used to request, so rendering is unchanged but the page no
   longer makes a third-party request (and no visitor IP goes to Google).
   Regenerate with scripts/self-host-fonts.mjs, not by hand. */

`;

for (const block of css.split('@font-face').slice(1)) {
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
  const style = block.match(/font-style:\s*([^;]+);/)?.[1]?.trim() || 'normal';
  const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
  const urlMatch = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!family || !urlMatch) continue;

  const subset = /U\+0000-00FF/.test(range || '') ? 'latin' : 'latin-ext';
  const weightLabel = weight.includes(' ') ? weight.replace(/\s+/g, '-') : weight;
  const name = `${slug(family)}-${style}-${weightLabel}-${subset}.woff2`;

  const buf = Buffer.from(await (await fetch(urlMatch, { headers: { 'User-Agent': UA } })).arrayBuffer());
  fs.writeFileSync(path.join(outDir, name), buf);
  faces.push({ family, weight, style, subset, name, bytes: buf.length });

  localCss += `@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url('/fonts/${name}') format('woff2');
  unicode-range: ${range};
}
`;
}

// Two consumers, one set of rules: the Astro bundle imports src/styles/fonts.css,
// while the standalone viewer under public/cards-viewer/ links the static copy.
fs.writeFileSync('src/styles/fonts.css', localCss);
fs.writeFileSync(path.join(outDir, 'fonts.css'), localCss.replace(/\/\/fonts\//g, '/fonts/'));

const total = faces.reduce((s, f) => s + f.bytes, 0);
console.log(`downloaded ${faces.length} woff2 files, ${(total / 1024).toFixed(0)} KB total`);
const bySubset = faces.reduce((m, f) => ((m[f.subset] = (m[f.subset] || 0) + f.bytes), m), {});
console.log('  latin subset total:', (bySubset.latin / 1024).toFixed(0), 'KB (what an English page actually loads)');
console.log('  latin-ext total:', ((bySubset['latin-ext'] || 0) / 1024).toFixed(0), 'KB');
for (const f of faces) console.log(`  ${f.name}  ${(f.bytes / 1024).toFixed(1)} KB`);
