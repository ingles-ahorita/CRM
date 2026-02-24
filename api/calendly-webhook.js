/**
 * POST /api/calendly-webhook — dedicated route so Vercel accepts POST.
 */
import handler from '../lib/api-handlers/calendly-webhook.js';
export default handler;
