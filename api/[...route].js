/**
 * Single catch-all API route for Vercel (keeps serverless function count ≤ 12).
 * Dispatches to lib/api-handlers by first path segment, e.g. /api/academic-stats → academic-stats.
 */
import academicStats from '../lib/api-handlers/academic-stats.js';
import aiSetter from '../lib/api-handlers/ai-setter.js';
import calendlyWebhook from '../lib/api-handlers/calendly-webhook.js';
import cancelCalendly from '../lib/api-handlers/cancel-calendly.js';
import currentSetter from '../lib/api-handlers/current-setter.js';
import googleAnalytics from '../lib/api-handlers/google-analytics.js';
import kajabiToken from '../lib/api-handlers/kajabi-token.js';
import kajabiWebhook from '../lib/api-handlers/kajabi-webhook.js';
import managementSeries from '../lib/api-handlers/management-series.js';
import manychat from '../lib/api-handlers/manychat.js';
import metaConversion from '../lib/api-handlers/meta-conversion.js';
import n8nWebhook from '../lib/api-handlers/n8n-webhook.js';
import rubenShiftToggle from '../lib/api-handlers/ruben-shift-toggle.js';
import storeFbclid from '../lib/api-handlers/store-fbclid.js';
import zoomWebhook from '../lib/api-handlers/zoom-webhook.js';

const ROUTES = {
  'academic-stats': academicStats,
  'ai-setter': aiSetter,
  'calendly-webhook': calendlyWebhook,
  'cancel-calendly': cancelCalendly,
  'current-setter': currentSetter,
  'google-analytics': googleAnalytics,
  'kajabi-token': kajabiToken,
  'kajabi-webhook': kajabiWebhook,
  'management-series': managementSeries,
  'manychat': manychat,
  'meta-conversion': metaConversion,
  'n8n-webhook': n8nWebhook,
  'ruben-shift-toggle': rubenShiftToggle,
  'store-fbclid': storeFbclid,
  'zoom-webhook': zoomWebhook,
};

const POST_ONLY_ROUTES = new Set([
  'cancel-calendly', 'manychat', 'n8n-webhook', 'calendly-webhook', 'kajabi-webhook',
  'meta-conversion', 'store-fbclid', 'ai-setter', 'ruben-shift-toggle', 'zoom-webhook',
]);

function getRouteFromRequest(req) {
  // 1) Query (Vercel / Next-style catch-all param)
  const segments = req.query?.route ?? req.query?.slug ?? [];
  let route = Array.isArray(segments) ? segments[0] : (typeof segments === 'string' ? segments : null);
  if (route) return route;

  // 2) Path from URL (Vercel often passes full URL or path in req.url)
  const urlRaw = req.url || req.headers?.['x-url'] || req.headers?.['x-invoke-path'] || req.path;
  if (urlRaw) {
    try {
      const pathname = urlRaw.startsWith('/') ? urlRaw : new URL(urlRaw, 'http://x').pathname;
      const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      if (parts[0]) return parts[0];
    } catch (_) {}
  }
  return null;
}

/**
 * Parse body from request. Returns a plain object (or {}).
 * Always tries every way to read body so POST works on Vercel even when req.method is missing/wrong.
 */
async function parseBody(req) {
  // 1) Web API Request: body is a stream, must use .json() (try first so we get body when method is wrong)
  if (typeof req.json === 'function') {
    try {
      const parsed = await req.json();
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  // 2) Already a plain object (Express or Vercel Node with body getter)
  const b = req.body;
  if (b != null && typeof b === 'object' && !(b instanceof Buffer) && typeof b.pipe !== 'function' && typeof b.getReader !== 'function') {
    return b;
  }

  // 3) Node IncomingMessage: read stream once (try even when method looks like GET — Vercel can be wrong)
  if (typeof req.on === 'function') {
    try {
      const raw = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      return raw && raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Build a single normalized request for sub-handlers so they work on both
 * Express (local) and Vercel (Web Request or Node with different shape).
 */
function buildRequest(originalReq, parsedBody) {
  const hasBody = parsedBody && typeof parsedBody === 'object' && Object.keys(parsedBody).length > 0;
  // When we have a body, always send POST so handlers work on Vercel even when req.method is wrong (e.g. GET)
  let method = hasBody ? 'POST' : (originalReq.method || 'GET');
  if (typeof method !== 'string') method = 'GET';
  method = method.toUpperCase();

  return Object.assign({}, originalReq, {
    method,
    body: parsedBody || {},
    query: originalReq.query ?? {},
    headers: originalReq.headers ?? {},
    url: originalReq.url,
    path: originalReq.path,
  });
}

export default async function handler(req, res) {
  const route = getRouteFromRequest(req);
  console.log('[api/route] incoming', {
    method: req.method,
    url: req.url,
    path: req.path,
    route,
    hasJson: typeof req.json === 'function',
    hasOn: typeof req.on === 'function',
    bodyType: req.body == null ? null : typeof req.body,
    bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    queryKeys: Object.keys(req.query || {}),
  });

  const h = route ? ROUTES[route] : null;
  if (!h) {
    if (!route || route === '') {
      return res.status(200).json({ ok: true, message: 'API base. Use e.g. /api/academic-stats, /api/test' });
    }
    return res.status(404).json({ error: 'Not found', path: route });
  }

  const parsedBody = await parseBody(req);
  console.log('[api/route] parsedBody', {
    keys: Object.keys(parsedBody || {}),
    hasBody: parsedBody && typeof parsedBody === 'object' && Object.keys(parsedBody).length > 0,
  });

  let normalizedReq = buildRequest(req, parsedBody);
  // Vercel can send wrong method; for POST-only routes with JSON content-type, force POST
  if (normalizedReq.method !== 'POST' && POST_ONLY_ROUTES.has(route)) {
    const h = normalizedReq.headers;
    const ct = (typeof h?.get === 'function' ? h.get('content-type') : (h?.['content-type'] || h?.['Content-Type'] || '')) || '';
    if (String(ct).toLowerCase().includes('application/json')) {
      normalizedReq = Object.assign({}, normalizedReq, { method: 'POST' });
    }
  }
  console.log('[api/route] normalized', {
    method: normalizedReq.method,
    bodyKeys: Object.keys(normalizedReq.body || {}),
  });

  return h(normalizedReq, res);
}
