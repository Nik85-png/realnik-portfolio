// Netlify function: contact form -> Resend -> prajapatinick85@gmail.com
// Reachable at /.netlify/functions/contact, and at /api/contact via the
// redirect rule in netlify.toml.
//
// All validation, spam checks and delivery live in lib/contact-core.mjs, which
// the Heroku server imports too — this file is only the Netlify-shaped adapter.
import { handleContact } from '../../lib/contact-core.mjs';

const json = (status, payload) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const headers = event.headers || {};
  const { status, body } = await handleContact({
    payload: event.body,
    origin: headers.origin || headers.Origin,
    ip: headers['x-nf-client-connection-ip'] || headers['client-ip'] || headers['x-forwarded-for'],
  });

  return json(status, body);
};
