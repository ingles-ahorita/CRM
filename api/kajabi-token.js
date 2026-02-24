/**
 * GET /api/kajabi-token — dedicated route so the frontend token fetch works reliably on Vercel.
 */
import handler from '../lib/api-handlers/kajabi-token.js';
export default handler;
