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
 * Ensure req.body is a parsed object for JSON POST/PUT/PATCH.
 * On Vercel, the catch-all receives the request; body may be a stream or unparsed.
 */
async function ensureBodyParsed(req) {
  const method = (req.method || '').toUpperCase();
  // Parse body for POST/PUT/PATCH, or when method is missing (Vercel catch-all can omit it)
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== '') return;

  // Already a plain object (e.g. Express or Vercel already parsed)
  if (req.body != null && typeof req.body === 'object' && !(req.body instanceof Buffer) && typeof req.body.pipe !== 'function') {
    return;
  }

  // Web API Request (e.g. Request with .json())
  if (typeof req.json === 'function') {
    try {
      req.body = await req.json();
    } catch {
      req.body = {};
    }
    return;
  }

  // Node IncomingMessage: read stream once and parse JSON
  if (typeof req.on === 'function') {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
  }
}

/**
 * Normalize req so sub-handlers always see method. On Vercel catch-all, req.method can be missing.
 */
function normalizeReq(originalReq) {
  let method = originalReq.method;
  if (!method || typeof method !== 'string') {
    // Infer POST when body was sent (already parsed by ensureBodyParsed)
    method = originalReq.body && typeof originalReq.body === 'object' && Object.keys(originalReq.body).length > 0 ? 'POST' : 'GET';
  }
  method = method.toUpperCase();
  return Object.assign({}, originalReq, { method, query: originalReq.query ?? {}, headers: originalReq.headers ?? {} });
}

export default async function handler(req, res) {
  const route = getRouteFromRequest(req);
  const h = route ? ROUTES[route] : null;
  if (!h) {
    if (!route || route === '') {
      return res.status(200).json({ ok: true, message: 'API base. Use e.g. /api/academic-stats, /api/test' });
    }
    return res.status(404).json({ error: 'Not found', path: route });
  }

  await ensureBodyParsed(req);
  const normalizedReq = normalizeReq(req);
  return h(normalizedReq, res);
}
