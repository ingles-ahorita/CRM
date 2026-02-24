/**
 * GET /api/management-series — dedicated route so Vercel serves chart data (including showUpRate split).
 */
import handler from '../lib/api-handlers/management-series.js';
export default handler;
