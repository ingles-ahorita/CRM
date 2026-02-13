/**
 * Vercel serverless proxy to api.kajabi.com (avoids CORS in production).
 * GET /api/kajabi-proxy/v1/transactions?... → https://api.kajabi.com/v1/transactions?...
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.VITE_KAJABI_ACCESS_TOKEN || process.env.KAJABI_ACCESS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Kajabi proxy: missing token' });
  }

  // req.url is e.g. /api/kajabi-proxy/v1/transactions?page[number]=1
  const prefix = '/api/kajabi-proxy/';
  const suffix = (req.url || '').startsWith(prefix) ? req.url.slice(prefix.length) : (req.query.path || []).join('/') || 'v1';
  const url = `https://api.kajabi.com/${suffix}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.api+json',
      },
    });
    const text = await response.text();
    res.status(response.status).setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');
    return res.send(text);
  } catch (err) {
    console.error('Kajabi proxy error:', err);
    return res.status(502).json({ error: 'Kajabi proxy failed', details: err.message });
  }
}
