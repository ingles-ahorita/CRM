/**
 * Server-side only: fetch Kajabi access token via OAuth.
 * Caches access_token (and refresh_token if returned); only calls Kajabi when cache is expired.
 * GET /api/kajabi-token → { access_token, expires_in }
 */

const KAJABI_OAUTH_URL = 'https://api.kajabi.com/v1/oauth/token';
const REFRESH_BUFFER_SEC = 60; // treat as expired 60s before actual expiry

let serverTokenCache = null;

function isCacheValid() {
  if (!serverTokenCache || !serverTokenCache.access_token) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return serverTokenCache.expiresAtSec > nowSec + REFRESH_BUFFER_SEC;
}

async function requestToken(bodyParams) {
  const body = new URLSearchParams(bodyParams);
  const response = await fetch(KAJABI_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }
  const accessToken = data.access_token;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200;
  const refreshToken = data.refresh_token || null;
  if (!accessToken) {
    return { ok: false, status: 502, data: { error: 'response missing access_token' } };
  }
  return {
    ok: true,
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.KAJABI_CLIENT_ID;
  const clientSecret = process.env.KAJABI_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Kajabi token: missing KAJABI_CLIENT_ID or KAJABI_CLIENT_SECRET (set in Vercel/server env)');
    return res.status(503).json({
      error: 'Kajabi token not configured. Set KAJABI_CLIENT_ID and KAJABI_CLIENT_SECRET in project env.',
    });
  }

  try {
    if (isCacheValid()) {
      const expiresIn = serverTokenCache.expiresAtSec - Math.floor(Date.now() / 1000);
      return res.status(200).json({
        access_token: serverTokenCache.access_token,
        expires_in: Math.max(1, expiresIn),
      });
    }

    let result;
    if (serverTokenCache?.refresh_token) {
      result = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: serverTokenCache.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });
      if (!result.ok) {
        serverTokenCache = null;
        result = null;
      }
    }
    if (!result || !result.ok) {
      result = await requestToken({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });
    }

    if (!result.ok) {
      console.error('Kajabi token error:', result.status, result.data);
      return res.status(result.status).json({
        error: 'Kajabi OAuth failed',
        detail: result.data?.errors?.[0]?.detail || result.data?.error_description || JSON.stringify(result.data),
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    serverTokenCache = {
      access_token: result.access_token,
      expiresAtSec: nowSec + result.expires_in,
      refresh_token: result.refresh_token || serverTokenCache?.refresh_token || null,
    };

    return res.status(200).json({
      access_token: result.access_token,
      expires_in: result.expires_in,
    });
  } catch (err) {
    console.error('Kajabi token fetch error:', err);
    return res.status(502).json({ error: 'Failed to fetch Kajabi token', details: err.message });
  }
}
