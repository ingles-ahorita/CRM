/**
 * POST /api/n8n-webhook — dedicated route so Vercel invokes this function for POST (avoids 405 on catch-all).
 */
import handler from '../lib/api-handlers/n8n-webhook.js';
export default handler;
