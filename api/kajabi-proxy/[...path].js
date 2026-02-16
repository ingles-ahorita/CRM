/**
 * Vercel serverless proxy to api.kajabi.com (avoids CORS in production).
 * GET /api/kajabi-proxy/v1/customers?page[number]=1 → https://api.kajabi.com/v1/customers?page[number]=1
 *
 * On Vercel, use env var KAJABI_ACCESS_TOKEN (VITE_* may not be available in serverless).
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prefer KAJABI_ACCESS_TOKEN on server (Vercel may not expose VITE_* to serverless)
  const token = process.env.KAJABI_ACCESS_TOKEN || process.env.VITE_KAJABI_ACCESS_TOKEN;
  if (!token) {
    console.error('Kajabi proxy: missing KAJABI_ACCESS_TOKEN (set in Vercel project env)');
    return res.status(503).json({ error: 'Kajabi proxy: missing token. Set KAJABI_ACCESS_TOKEN in Vercel.' });
  }

  // Vercel catch-all: req.query.path is the path segments array e.g. ['v1', 'customers']
  const pathSegments = req.query.path;
  const pathPart = Array.isArray(pathSegments) ? pathSegments.join('/') : (pathSegments || 'v1');
  // Forward all other query params (e.g. page[number], page[size], sort) to Kajabi
  const queryCopy = { ...req.query };
  delete queryCopy.path;
  const search = Object.keys(queryCopy).length
    ? '?' + new URLSearchParams(queryCopy).toString()
    : '';
  const upstreamPath = pathPart.startsWith('v1') ? pathPart : `v1/${pathPart}`;
  const url = `https://api.kajabi.com/${upstreamPath}${search}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.api+json',
      },
    });
    const text = await response.text();
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html') || text.trim().startsWith('<')) {
      console.error('Kajabi proxy: upstream returned HTML', url, response.status);
      return res.status(502).json({
        error: 'Kajabi proxy received HTML instead of JSON',
        hint: 'Check KAJABI_ACCESS_TOKEN in Vercel env and that the token is valid.',
      });
    }
    res.status(response.status).setHeader('Content-Type', contentType || 'application/json');
    return res.send(text);
  } catch (err) {
    console.error('Kajabi proxy error:', err);
    return res.status(502).json({ error: 'Kajabi proxy failed', details: err.message });
  }
}
