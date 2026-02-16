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

  // req.url can be path-only (/api/kajabi-proxy/v1/...) or full URL (https://...)
  const rawUrl = req.url || '';
  const pathAndSearch = rawUrl.startsWith('http') ? new URL(rawUrl).pathname + (new URL(rawUrl).search || '') : rawUrl;
  const prefix = '/api/kajabi-proxy/';
  const suffix = pathAndSearch.startsWith(prefix)
    ? pathAndSearch.slice(prefix.length)
    : (Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || 'v1')) + (req.url && req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
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
