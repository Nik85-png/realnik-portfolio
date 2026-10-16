// Verifies the deployed site rather than the local preproduction copy.
//
//   npm run check:live
//
// Run it after a deploy: a successful push only means Heroku accepted the code,
// not that the released dyno serves the new build. It also catches the failure
// mode where the live site quietly lags behind the repository.
const ORIGIN = process.env.LIVE_ORIGIN || 'https://realnik.co.uk';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

async function get(path, opts = {}) {
  const r = await fetch(ORIGIN + path, opts);
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    wire: Number(r.headers.get('content-length') || 0),
    decoded: buf.length,
    headers: r.headers,
    body: buf.toString('utf8'),
  };
}

console.log(`--- ${ORIGIN} ---`);
const home = await get('/');
check('home page responds', home.status === 200, `status=${home.status}`);

console.log('--- the deployed build is the current one ---');
check('hero no longer claims "Available from 2026"', !/Available from 2026/.test(home.body));
check('hero shows "Available now"', /Available now/.test(home.body));
check('ships the <main> landmark', /<main[^>]*id="main"/.test(home.body));
check('ships the skip link', /class="skip-link" href="#main"/.test(home.body));
check('ships the honeypot field', /name="_gotcha"/.test(home.body));

console.log('--- compression ---');
const data = await get('/data/card_analysis_data.json', { headers: { 'Accept-Encoding': 'gzip, br' } });
check('dataset is compressed in production', ['br', 'gzip'].includes(data.headers.get('content-encoding')), `enc=${data.headers.get('content-encoding')}, ${(data.wire / 1024).toFixed(0)} KB on the wire (was 5.41 MB)`);
check('dataset JSON still parses', JSON.parse(data.body).analysis_types.length === 9);
check('HTML is compressed', Boolean((await get('/', { headers: { 'Accept-Encoding': 'gzip, br' } })).headers.get('content-encoding')));

console.log('--- caching ---');
const etag = data.headers.get('etag');
check('dataset sends an ETag', Boolean(etag), etag || '(none)');
check('dataset revalidates', (data.headers.get('cache-control') || '').includes('must-revalidate'), data.headers.get('cache-control') || '');
if (etag) {
  const revalidated = await get('/data/card_analysis_data.json', { headers: { 'If-None-Match': etag } });
  check('repeat request returns an empty 304', revalidated.status === 304, `status=${revalidated.status}`);
}
const css = (home.body.match(/\/_astro\/[^"']+\.css/) || [])[0];
const cssRes = css ? await get(css) : null;
check('hashed CSS is immutable', Boolean(cssRes && (cssRes.headers.get('cache-control') || '').includes('immutable')), cssRes ? cssRes.headers.get('cache-control') : 'no css found');

console.log('--- security headers ---');
for (const [header, want] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'SAMEORIGIN'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
]) {
  check(`${header} is set`, home.headers.get(header) === want, home.headers.get(header) || '(absent)');
}

console.log('--- robots, sitemap, 404 ---');
const robots = await get('/robots.txt');
check('/robots.txt is served (was a 404)', robots.status === 200 && /sitemap-index\.xml/.test(robots.body), `status=${robots.status}`);
const sitemap = await get('/sitemap-index.xml');
check('/sitemap-index.xml is served (was a 404)', sitemap.status === 200 && (sitemap.headers.get('content-type') || '').includes('xml'), `status=${sitemap.status}`);
const childName = (sitemap.body.match(/sitemap-\d+\.xml/) || [])[0];
if (childName) {
  const child = await get('/' + childName);
  const locs = (child.body.match(/<loc>/g) || []).length;
  check('sitemap lists the five pages', locs === 5, `${locs} urls`);
}
const missing = await get('/this-page-does-not-exist');
check('unknown URL serves the designed 404', missing.status === 404 && /This page isn't/.test(missing.body), `status=${missing.status}`);

console.log('--- self-hosted fonts ---');
check('no page calls Google Fonts', !/fonts\.(googleapis|gstatic)\.com/.test(home.body));
const font = await get('/fonts/dm-mono-normal-400-latin.woff2');
check('a font file is served from our own origin', font.status === 200 && font.decoded > 1000, `status=${font.status}, ${(font.decoded / 1024).toFixed(1)} KB`);

console.log('--- pages and the embedded viewer ---');
for (const p of ['/info/', '/projects/', '/hf-risk/', '/cards-analysis/']) {
  const r = await get(p);
  check(`${p} returns 200 with a main landmark`, r.status === 200 && /<main[^>]*id="main"/.test(r.body), `status=${r.status}`);
}
const viewer = await get('/cards-viewer/index.html');
check('the viewer uses the local font stylesheet', /href="\/fonts\/fonts\.css"/.test(viewer.body));

console.log('--- contact endpoint (spam-shaped only, no real email) ---');
async function post(body, origin = ORIGIN) {
  const r = await fetch(`${ORIGIN}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
check('cross-origin POST is refused', (await post({ name: 'x', email: 'x@y.com', message: 'hi' }, 'https://evil.example')).status === 403);
check('filled honeypot is accepted without delivery', (await post({ _gotcha: 'bot' })).status === 200);
check('empty submission is refused', (await post({ name: '', email: '', message: '' })).status === 400);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
