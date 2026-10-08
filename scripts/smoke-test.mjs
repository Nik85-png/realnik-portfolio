// Smoke test for the production server and the built output.
//
//   npm run build && npm test
//
// It boots server.mjs on a throwaway port, exercises the behaviour that is easy
// to regress (compression, ETag revalidation, cache policy, the 404 fallback,
// the generated sitemap, the contact guards) and exits non-zero on any failure.
// Contact posts are always spam-shaped, so the test never sends real email.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(port) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 75 && !/serving on port/.test(log); i++) await wait(200);
  if (!/serving on port/.test(log)) throw new Error(`server did not start on ${port}: ${log}`);
  return { proc, base: `http://127.0.0.1:${port}` };
}

if (!fs.existsSync('dist/index.html')) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const { proc, base } = await startServer(4571);

// `fetch` transparently decodes the body, so wire size comes from Content-Length.
async function probe(p, opts = {}) {
  const r = await fetch(base + p, opts);
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    decoded: buf.length,
    wire: Number(r.headers.get('content-length') || 0),
    headers: r.headers,
    body: buf.toString('utf8'),
  };
}

async function post(payload, origin = 'https://realnik.co.uk') {
  const r = await fetch(`${base}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

console.log('--- compression ---');
const data = await probe('/data/card_analysis_data.json', { headers: { 'Accept-Encoding': 'gzip, br' } });
check('dataset is served brotli', data.headers.get('content-encoding') === 'br', `enc=${data.headers.get('content-encoding')}`);
check('dataset wire size is far below its decoded size', data.wire > 0 && data.wire < data.decoded / 4, `${(data.wire / 1024).toFixed(0)} KB wire vs ${(data.decoded / 1048576).toFixed(2)} MB decoded`);
const gz = await probe('/data/card_analysis_data.json', { headers: { 'Accept-Encoding': 'gzip' } });
check('gzip served to clients without brotli', gz.headers.get('content-encoding') === 'gzip', `${(gz.wire / 1024).toFixed(0)} KB`);
const plain = await probe('/data/card_analysis_data.json', { headers: { 'Accept-Encoding': 'identity' } });
check('no-encoding client still receives complete JSON', JSON.parse(plain.body).analysis_types.length === 9);
const html = await probe('/', { headers: { 'Accept-Encoding': 'gzip, br' } });
check('HTML is compressed', Boolean(html.headers.get('content-encoding')), `${(html.wire / 1024).toFixed(0)} KB`);
const png = await probe('/hf-risk/assets/shap_bar.png', { headers: { 'Accept-Encoding': 'gzip, br' } });
check('already-compressed PNG is left alone', !png.headers.get('content-encoding'));
const font = await probe('/fonts/dm-mono-normal-400-latin.woff2', { headers: { 'Accept-Encoding': 'gzip, br' } });
check('woff2 is left alone and reachable', font.status === 200 && !font.headers.get('content-encoding'));

console.log('--- caching and revalidation ---');
const cssPath = html.body.match(/\/_astro\/[^"']+\.css/)?.[0];
const css = await probe(cssPath);
check('hashed _astro asset is immutable for a year', (css.headers.get('cache-control') || '').includes('immutable'), css.headers.get('cache-control'));
check('dataset revalidates after an hour', (data.headers.get('cache-control') || '').includes('must-revalidate'), data.headers.get('cache-control'));
check('HTML stays no-cache', html.headers.get('cache-control') === 'no-cache');
check('ETag present on the dataset', Boolean(data.headers.get('etag')));
check('ETag present on images', Boolean((await probe('/images/nikunj-profile.jpg')).headers.get('etag')));
const revalidated = await probe('/data/card_analysis_data.json', { headers: { 'If-None-Match': data.headers.get('etag') } });
check('repeat visit revalidates to an empty 304', revalidated.status === 304 && revalidated.decoded === 0, `status=${revalidated.status}`);
check('HEAD is supported', (await fetch(base + '/', { method: 'HEAD' })).status === 200);

console.log('--- security headers ---');
for (const [header, want] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'SAMEORIGIN'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
]) {
  check(`${header} on HTML`, html.headers.get(header) === want, html.headers.get(header) || '(absent)');
}
check('X-Frame-Options is not DENY (the Card Lab page frames /cards-viewer/)', html.headers.get('x-frame-options') !== 'DENY');
check('404 responses carry the headers too', (await probe('/no-such-page')).headers.get('x-content-type-options') === 'nosniff');

console.log('--- 404 and sitemap ---');
const nf = await probe('/no-such-page');
check('unknown URL returns the designed 404 page', nf.status === 404 && /This page isn't/.test(nf.body), `status=${nf.status}`);
check('404 page is noindex', /content="noindex/.test(nf.body));
const smIndex = await probe('/sitemap-index.xml');
check('sitemap-index.xml is served as XML', smIndex.status === 200 && (smIndex.headers.get('content-type') || '').includes('xml'));
const childName = (smIndex.body.match(/sitemap-\d+\.xml/) || [])[0];
const child = await probe('/' + childName);
const locs = (child.body.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.replace(/<\/?loc>/g, ''));
check('sitemap lists the five real pages', locs.length === 5, `${locs.length} urls`);
check('sitemap omits the 404 page', !locs.some((l) => l.includes('404')));
check('sitemap dates come from the build', (child.body.match(/<lastmod>/g) || []).length === locs.length);
check('robots.txt points at the generated sitemap', /sitemap-index\.xml/.test((await probe('/robots.txt')).body));

console.log('--- page markup ---');
for (const p of ['/', '/info/', '/projects/', '/hf-risk/', '/cards-analysis/']) {
  const r = await probe(p);
  check(`${p} has a <main> landmark and skip link`, /<main[^>]*id="main"/.test(r.body) && /class="skip-link" href="#main"/.test(r.body));
}
const home = await probe('/');
check('contact status is an aria-live region', /role="status" aria-live="polite"/.test(home.body));
check('honeypot is present, untabbable and aria-hidden', /class="form-honey" aria-hidden="true"/.test(home.body) && /name="_gotcha" tabindex="-1"/.test(home.body));
check('the info page form has the honeypot too', /name="_gotcha"/.test((await probe('/info/')).body));
check('fonts are self-hosted', !/fonts\.(googleapis|gstatic)\.com/.test(home.body) && fs.existsSync('dist/fonts'));
check('first-screen fonts are preloaded', (home.body.match(/rel="preload"/g) || []).length === 2);
check('the standalone viewer uses the local fonts too', /href="\/fonts\/fonts\.css"/.test(fs.readFileSync('dist/cards-viewer/index.html', 'utf8')));
const strayFonts = [];
for (const f of ['dist/index.html', 'dist/info/index.html', 'dist/projects/index.html', 'dist/hf-risk/index.html', 'dist/cards-analysis/index.html', 'dist/404.html', 'dist/cards-viewer/index.html']) {
  if (/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, 'utf8'))) strayFonts.push(f);
}
check('no page or viewer still calls Google Fonts', strayFonts.length === 0, strayFonts.join(' ') || 'clean');
check('the static font stylesheet declares local files', /url\('\/fonts\//.test(fs.readFileSync('dist/fonts/fonts.css', 'utf8')));
const hfRisk = await probe('/hf-risk/');
const imgs = hfRisk.body.match(/<img[^>]*>/g) || [];
const dimless = imgs.filter((t) => !/width="/.test(t) || !/height="/.test(t));
check('every HF-RISK chart declares width and height (lightbox excepted)', dimless.length === 1 && /lbImg/.test(dimless[0]), `${imgs.length} imgs, ${dimless.length} without`);
check('Card Lab dataset ships minified', fs.statSync('dist/data/card_analysis_data.json').size < fs.statSync('public/data/card_analysis_data.json').size);
check('no duplicate root-level HF-RISK charts', !fs.existsSync('public/hf-risk/shap_beeswarm.png') && fs.existsSync('public/hf-risk/assets/shap_beeswarm.png'));
check('page count in dist is six', fs.readdirSync('dist').filter((f) => fs.statSync(path.join('dist', f)).isDirectory()).length >= 6);

console.log('--- contact endpoint guards ---');
check('cross-origin post is rejected', (await post({ name: 'x', email: 'x@y.com', message: 'hi' }, 'https://evil.example')).status === 403);
const honey = await post({ name: 'x', email: 'x@y.com', message: 'hi', _gotcha: 'http://spam' });
check('filled honeypot is accepted silently without sending', honey.status === 200 && honey.json?.ok === true);
check('empty fields are rejected', (await post({ name: '', email: '', message: '' })).status === 400);
check('a malformed email is rejected', (await post({ name: 'A', email: 'nope', message: 'hi' })).status === 400);
check('malformed JSON is rejected', (await post('{oops')).status === 400);
check('GET on the endpoint is rejected', (await fetch(`${base}/api/contact`)).status === 405);
check('path traversal is refused', [403, 404].includes((await probe('/../../package.json')).status));

// The rate limiter counts per process, so it needs a clean instance.
proc.kill();
await wait(400);
const fresh = await startServer(4572);
const burst = [];
for (let i = 0; i < 6; i++) {
  const r = await fetch(`${fresh.base}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://realnik.co.uk' },
    body: JSON.stringify({ _gotcha: 'bot' }),
  });
  burst.push(r.status);
}
check('five messages allowed, the sixth is rate-limited', burst.slice(0, 5).every((s) => s === 200) && burst[5] === 429, `statuses ${burst.join(',')}`);
fresh.proc.kill();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
