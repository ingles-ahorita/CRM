/**
 * GET /api/kajabi-token → { access_token, expires_in }
 * Uses KAJABI_CLIENT_ID + KAJABI_CLIENT_SECRET (client_credentials). Set in env.
 */
const OAUTH_URL = 'https://api.kajabi.com/v1/oauth/token';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const clientId = process.env.KAJABI_CLIENT_ID;
  const clientSecret = process.env.KAJABI_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: 'Set KAJABI_CLIENT_ID and KAJABI_CLIENT_SECRET in env.' });
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    const r = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      return res.status(r.ok ? 502 : r.status).json({
        error: 'Kajabi OAuth failed',
        detail: data.error_description || data.errors?.[0]?.detail || JSON.stringify(data),
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      access_token: data.access_token,
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : 7200,
    });
  } catch (err) {
    console.error('Kajabi token error:', err);
    return res.status(502).json({ error: 'Token fetch failed', details: err.message });
  }
}
