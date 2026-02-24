/**
 * POST /api/cancel-calendly — dedicated route so Vercel accepts POST (avoids 405 on catch-all).
 */
import handler from '../lib/api-handlers/cancel-calendly.js';
export default handler;
