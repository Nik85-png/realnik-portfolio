// Shared contact-form handler for both deploy targets.
//
// server.mjs (the Heroku dyno) and netlify/functions/contact.mjs both import
// this module, so the two hosts cannot drift apart the way two copies would.

export const LEAD_EMAIL_DEFAULT = 'prajapatinick85@gmail.com';

// Origins allowed to post the form. The site is served from realnik.co.uk;
// localhost is here so `node server.mjs` and `astro dev` can be tested.
const ALLOWED_HOSTS = new Set([
  'realnik.co.uk',
  'www.realnik.co.uk',
  'localhost',
  '127.0.0.1',
]);

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

/** Per-instance sliding-window limit: 5 submissions per IP per 10 minutes. */
export function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing without bound on a long-lived dyno.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

/** Reject cross-origin posts. A missing Origin (curl, server-to-server) is allowed. */
export function isOriginAllowed(origin) {
  if (!origin) return true;
  try {
    return ALLOWED_HOSTS.has(new URL(origin).host);
  } catch {
    return false;
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch),
  );

function pick(raw, ...names) {
  for (const n of names) {
    const hit = Object.keys(raw).find((k) => k.toLowerCase() === n);
    if (hit && String(raw[hit]).trim()) return String(raw[hit]).trim();
  }
  return undefined;
}

export function buildEmailHtml({ Name, Email, Topic, Message, siteUrl }) {
  return `
      <h2 style="font-family:sans-serif;color:#111;margin:0 0 12px">New lead — Nikunj Prajapati (realnik.co.uk)</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-family:sans-serif;font-size:13px">
        <tr style="background:#f6f6f6"><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:130px">Name</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border-bottom:1px solid #eee"><a href="mailto:${esc(Email)}">${esc(Email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Topic</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Topic) || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Message</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Message).replace(/\n/g, '<br>')}</td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:12px;color:#666;margin-top:12px">Sent from <a href="${esc(siteUrl)}">realnik.co.uk</a></p>`;
}

/**
 * Validate and deliver one contact submission.
 * @returns {Promise<{status: number, body: Record<string, unknown>}>}
 */
export async function handleContact({
  payload,
  origin,
  ip,
  env = {},
  siteUrl = 'https://realnik.co.uk',
}) {
  if (!isOriginAllowed(origin)) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if (isRateLimited(ip)) {
    return { status: 429, body: { error: 'Too many messages — please try again later.' } };
  }

  let raw;
  try {
    raw = typeof payload === 'string' ? JSON.parse(payload || '{}') : payload || {};
  } catch {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  // Honeypot: the field is off-screen and untabbable, so only a bot fills it.
  // Answer 200 so the script gets no signal that it was caught.
  if (String(raw._gotcha ?? '').trim()) {
    return { status: 200, body: { ok: true } };
  }

  const Name = pick(raw, 'name');
  const Email = pick(raw, 'email');
  const Topic = pick(raw, 'topic', 'subject');
  const Message = pick(raw, 'message');

  if (!Name || !Email || !Message) {
    return { status: 400, body: { error: 'Name, email and message are required.' } };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email)) {
    return { status: 400, body: { error: 'Please enter a valid email address.' } };
  }

  const leadEmail = env.RESEND_EMAIL_TO || LEAD_EMAIL_DEFAULT;

  try {
    // No Resend key configured → FormSubmit fallback (no API key needed).
    if (!env.RESEND_API_KEY) {
      const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(leadEmail)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Name,
          Email,
          Topic: Topic || '—',
          Message,
          _subject: 'New lead — Nikunj Prajapati (realnik.co.uk)',
          _replyto: Email,
        }),
      });
      if (!res.ok) throw new Error(`FormSubmit failed: ${res.status}`);
      return { status: 200, body: { ok: true } };
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_EMAIL_FROM || 'Nikunj Prajapati <onboarding@resend.dev>',
        to: leadEmail,
        reply_to: Email,
        subject: `New lead — ${Name} — realnik.co.uk`,
        html: buildEmailHtml({ Name, Email, Topic, Message, siteUrl }),
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', res.status, await res.text());
      return { status: 500, body: { error: 'Failed to send email' } };
    }
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('Contact delivery error:', err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}
