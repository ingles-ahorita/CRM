/**
 * GET /api/current-setter — dedicated route so webhooks (Zapier, etc.) hit it reliably on Vercel.
 */
import handler from '../lib/api-handlers/current-setter.js';
export default handler;
