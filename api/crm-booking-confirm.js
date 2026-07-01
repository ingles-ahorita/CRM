/**
 * POST /api/crm-booking-confirm — dedicated route so Vercel invokes this function for POST (avoids 405 on catch-all).
 * Called by the Supabase DB webhook when a CRM-booked calls row is inserted.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/crm-booking-confirm.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
