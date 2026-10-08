// Heroku web dyno: serve the static build in dist/ and run the contact
// API at POST /api/contact. The contact logic itself lives in
// lib/contact-core.mjs so the Netlify function cannot drift away from it.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { handleContact } from './lib/contact-core.mjs';

const DIST = new URL('./dist', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1'); // strip leading slash from file:// URL on Windows
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml']);

// Anything below this stays uncompressed — the framing overhead is not worth it.
const MIN_COMPRESS_BYTES = 1024;

// Small cache of compressed bodies so a repeat request for the 5 MB Card Lab
// dataset does not recompress on every hit. Keyed by path + mtime + encoding.
const compressedCache = new Map();
const COMPRESSED_CACHE_MAX = 24;

const sendJson = (res, status, payload, extraHeaders = {}) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(body);
};

// ---------- compression ----------
function pickEncoding(acceptEncoding) {
  const header = (acceptEncoding || '').toLowerCase();
  if (header.includes('br')) return 'br';
  if (header.includes('gzip')) return 'gzip';
  return null;
}

function compress(buf, encoding, cacheKey) {
  const cached = compressedCache.get(cacheKey);
  if (cached) return cached;
  let out;
  try {
    out = encoding === 'br' ? brotliCompressSync(buf) : gzipSync(buf);
  } catch (err) {
    console.error('Compression failed:', err);
    return null;
  }
  if (compressedCache.size >= COMPRESSED_CACHE_MAX) {
    compressedCache.delete(compressedCache.keys().next().value);
  }
  compressedCache.set(cacheKey, out);
  return out;
}

function cacheControlFor(pathname, ext) {
  if (ext === '.html') return 'no-cache';
  // Astro's build emits content-hashed filenames here — safe to pin forever.
  if (pathname.startsWith('/_astro/')) return 'public, max-age=31536000, immutable';
  // Everything else (charts, the Card Lab dataset, the CV) changes only on
  // deploy: hold it for an hour, then revalidate against the ETag for free.
  return 'public, max-age=3600, must-revalidate';
}

// Applies to every response. X-Frame-Options stays SAMEORIGIN rather than DENY
// because the Card Lab page frames /cards-viewer/ from the same origin.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

// ---------- contact endpoint ----------
async function onContact(req, res, rawBody) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : '') ||
    req.socket.remoteAddress;

  const { status, body } = await handleContact({
    payload: rawBody,
    origin: req.headers.origin,
    ip: ip.trim(),
  });

  return sendJson(res, status, body, SECURITY_HEADERS);
}

// ---------- static server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/contact') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' }, SECURITY_HEADERS);
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => onContact(req, res, body));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Method not allowed');
  }

  const headOnly = req.method === 'HEAD';
  const pathname = decodeURIComponent(url.pathname);

  try {
    // /info -> /info/index.html (Astro directory format)
    let filePath = normalize(join(DIST, pathname));
    if (!filePath.startsWith(normalize(DIST))) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end('Forbidden');
    }
    let data = await stat(filePath).catch(() => null);
    if (data?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      data = await stat(filePath).catch(() => null);
    }
    if (!data) {
      // fallback: extensionless path -> directory
      const alt = join(filePath, 'index.html');
      const altStat = await stat(alt).catch(() => null);
      if (altStat) {
        filePath = alt;
        data = altStat;
      }
    }
    if (!data) {
      // Custom 404 page if the build produced one, else plain text.
      const notFound = await stat(join(DIST, '404.html')).catch(() => null);
      if (notFound) {
        const buf = await readFile(join(DIST, '404.html'));
        const headers = {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...SECURITY_HEADERS,
        };
        res.writeHead(404, headers);
        return res.end(headOnly ? undefined : buf);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      return res.end('Not found');
    }

    const ext = extname(filePath).toLowerCase();
    const etag = `W/"${data.size}-${Math.floor(data.mtimeMs)}"`;

    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControlFor(pathname, ext),
      ETag: etag,
      ...SECURITY_HEADERS,
    };

    // Revalidation: the browser keeps its copy and we answer with an empty 304.
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    let buf = await readFile(filePath);

    if (COMPRESSIBLE.has(ext) && buf.length >= MIN_COMPRESS_BYTES) {
      const encoding = pickEncoding(req.headers['accept-encoding']);
      headers.Vary = 'Accept-Encoding';
      if (encoding) {
        const packed = compress(buf, encoding, `${filePath}:${etag}:${encoding}`);
        if (packed && packed.length < buf.length) {
          buf = packed;
          headers['Content-Encoding'] = encoding;
        }
      }
    }

    headers['Content-Length'] = String(buf.length);
    res.writeHead(200, headers);
    res.end(headOnly ? undefined : buf);
  } catch (err) {
    console.error('Static serve error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Internal server error');
  }
});

server.listen(PORT, () => console.log(`realnik.co.uk serving on port ${PORT}`));
