/**
 * POST /api/kajabi-webhook — dedicated route so Vercel accepts POST.
 */
import handler from '../lib/api-handlers/kajabi-webhook.js';
export default handler;
