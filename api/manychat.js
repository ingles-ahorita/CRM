/**
 * POST /api/manychat — dedicated route so Vercel invokes this function for POST (avoids 405 on catch-all).
 */
import handler from '../lib/api-handlers/manychat.js';
export default handler;
