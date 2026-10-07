// Netlify function: contact form → Resend → prajapatinick85@gmail.com
// Reachable at /.netlify/functions/contact, and at /api/contact via the
// redirect rule in netlify.toml.

const LEAD_EMAIL_DEFAULT = 'prajapatinick85@gmail.com';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch),
  );

const json = (status, payload) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const raw = JSON.parse(event.body || '{}');

    // The form posts lowercase keys; normalize to the capitalized ones
    // this function (and the bookmycleaners pattern) uses.
    const pick = (...names) => {
      for (const n of names) {
        const hit = Object.keys(raw).find((k) => k.toLowerCase() === n);
        if (hit && String(raw[hit]).trim()) return String(raw[hit]).trim();
      }
      return undefined;
    };
    const body = {
      Name: pick('name'),
      Email: pick('email'),
      Topic: pick('topic', 'subject'),
      Message: pick('message'),
    };
    const { Name, Email, Topic, Message } = body;

    if (!Name || !Email || !Message) {
      return json(400, { error: 'Name, email and message are required.' });
    }

    const leadEmail = process.env.RESEND_EMAIL_TO || LEAD_EMAIL_DEFAULT;

    // No Resend key configured → fall back to FormSubmit (no API key needed).
    if (!process.env.RESEND_API_KEY) {
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
      if (!res.ok) throw new Error('FormSubmit failed');
      return json(200, { ok: true });
    }

    const html = `
      <h2 style="font-family:sans-serif;color:#111;margin:0 0 12px">New lead — Nikunj Prajapati (realnik.co.uk)</h2>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-family:sans-serif;font-size:13px">
        <tr style="background:#f6f6f6"><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:130px">Name</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border-bottom:1px solid #eee"><a href="mailto:${esc(Email)}">${esc(Email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Topic</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Topic) || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Message</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(Message)}</td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:12px;color:#666;margin-top:12px">Sent from <a href="https://realnik.co.uk">realnik.co.uk</a></p>
    `;

    const res = await fetch('https://api.resend.com/emails', {
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

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend error:', res.status, detail);
      return json(500, { error: 'Failed to send email' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('Contact function error:', err);
    return json(500, { error: 'Internal server error' });
  }
};
