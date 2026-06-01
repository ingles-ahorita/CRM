/**
 * POST /api/iclosed-webhook — Vercel route (raw body kept for signature verification).
 */
import handler from '../lib/api-handlers/iclosed-webhook.js';

async function readRawBody(req) {
  if (typeof req.text === 'function') {
    return req.text();
  }
  if (typeof req.on === 'function') {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  return '';
}

export default async function (req, res) {
  const rawBody = await readRawBody(req);
  let body = {};
  try {
    body = rawBody && rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const reqWithBody = Object.assign({}, req, {
    method: (req.method || 'POST').toString().toUpperCase(),
    body,
    rawBody,
    headers: req.headers || {},
  });

  return handler(reqWithBody, res);
}
