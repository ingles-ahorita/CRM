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
  'manychat': manychat,
  'meta-conversion': metaConversion,
  'n8n-webhook': n8nWebhook,
  'ruben-shift-toggle': rubenShiftToggle,
  'store-fbclid': storeFbclid,
  'zoom-webhook': zoomWebhook,
};

function getRouteFromRequest(req) {
  const segments = req.query?.route ?? req.query?.slug ?? [];
  let route = Array.isArray(segments) ? segments[0] : segments;
  if (!route && req.url) {
    try {
      const pathname = new URL(req.url, 'http://x').pathname;
      const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      route = parts[0] || null;
    } catch (_) {}
  }
  return route || null;
}

export default async function handler(req, res) {
  const route = getRouteFromRequest(req);
  const h = route ? ROUTES[route] : null;
  if (!h) {
    return res.status(404).json({ error: 'Not found', path: route || '/api' });
  }
  return h(req, res);
}
