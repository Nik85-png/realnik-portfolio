// Post-build step: compact the JSON that ships to the browser.
//
// public/data/*.json is pretty-printed in the repo so the dataset can be
// reviewed in a diff, but those indentation characters cost megabytes on the
// wire. The copy under dist/ is what the static server actually serves, so it
// is re-serialised without whitespace. Compression (gzip/brotli) then does the
// rest at response time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../dist/data', import.meta.url));

if (!fs.existsSync(dataDir)) {
  console.log('minify-data: no dist/data directory, nothing to do');
  process.exit(0);
}

let before = 0;
let after = 0;

for (const name of fs.readdirSync(dataDir)) {
  if (!name.endsWith('.json')) continue;
  const file = path.join(dataDir, name);
  const raw = fs.readFileSync(file, 'utf8');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`minify-data: ${name} is not valid JSON — left untouched`);
    console.error(err.message);
    process.exitCode = 1;
    continue;
  }

  const compact = JSON.stringify(parsed);
  before += raw.length;
  after += compact.length;

  if (compact.length < raw.length) fs.writeFileSync(file, compact);
}

const mb = (n) => (n / 1048576).toFixed(2);
console.log(
  `minify-data: ${mb(before)} MB -> ${mb(after)} MB (saved ${mb(before - after)} MB)`,
);
