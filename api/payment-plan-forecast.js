/**
 * GET /api/payment-plan-forecast — dedicated route so the payment-plan forecast works on Vercel.
 */
import handler from '../lib/api-handlers/payment-plan-forecast.js';
export default handler;
