// Heroku web dyno: serve the static build in dist/ and run the contact
// API at POST /api/contact (same handler logic as netlify/functions/contact.mjs).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

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
};

// ---------- contact endpoint (Resend with FormSubmit fallback) ----------
const LEAD_EMAIL_DEFAULT = 'prajapatinick85@gmail.com';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch),
  );

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

async function handleContact(req, res, rawBody) {
  try {
    const raw = JSON.parse(rawBody || '{}');
    const pick = (...names) => {
      for (const n of names) {
        const hit = Object.keys(raw).find((k) => k.toLowerCase() === n);
        if (hit && String(raw[hit]).trim()) return String(raw[hit]).trim();
      }
      return undefined;
    };
    const Name = pick('name');
    const Email = pick('email');
    const Topic = pick('topic', 'subject');
    const Message = pick('message');

    if (!Name || !Email || !Message) {
      return sendJson(res, 400, { error: 'Name, email and message are required.' });
    }

    const leadEmail = process.env.RESEND_EMAIL_TO || LEAD_EMAIL_DEFAULT;

    if (!process.env.RESEND_API_KEY) {
      const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(leadEmail)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Name, Email,
          Topic: Topic || '—', Message,
          _subject: 'New lead — Nikunj Prajapati (realnik.co.uk)',
          _replyto: Email,
        }),
      });
      if (!r.ok) throw new Error('FormSubmit failed');
      return sendJson(res, 200, { ok: true });
    }

    const html = `
      <h2 style="font-family:sans-serif;color:#111;margin:0 0 12px">New lead — Nikunj Prajapati (realnik.co.uk)</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-family:sans-serif;font-size:13px">
        <tr style="background:#f6f6f6"><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:130px">Name</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border-bottom:1px solid #eee"><a href="mailto:${esc(Email)}">${esc(Email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Topic</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Topic) || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Message</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Message)}</td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:12px;color:#666;margin-top:12px">Sent from realnik.co.uk</p>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_EMAIL_FROM || 'Nikunj Prajapati <onboarding@resend.dev>',
        to: leadEmail,
        reply_to: Email,
        subject: `New lead — ${Name} — realnik.co.uk`,
        html,
      }),
    });

    if (!r.ok) {
      console.error('Resend error:', r.status, await r.text());
      return sendJson(res, 500, { error: 'Failed to send email' });
    }
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('Contact API error:', err);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ---------- static server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/contact') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => handleContact(req, res, body));
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  try {
    // /info -> /info/index.html (Astro directory format)
    let filePath = normalize(join(DIST, pathname));
    if (!filePath.startsWith(normalize(DIST))) {
      res.writeHead(403); return res.end('Forbidden');
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
      if (altStat) { filePath = alt; data = altStat; }
    }
    if (!data) {
      // SPA-ish fallback to 404 page if present, else plain 404
      const notFound = await stat(join(DIST, '404.html')).catch(() => null);
      if (notFound) {
        const buf = await readFile(join(DIST, '404.html'));
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(buf);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    else headers['Cache-Control'] = 'public, max-age=3600';

    const buf = await readFile(filePath);
    res.writeHead(200, headers);
    res.end(buf);
  } catch (err) {
    console.error('Static serve error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
});

server.listen(PORT, () => console.log(`realnik.co.uk serving on port ${PORT}`));
