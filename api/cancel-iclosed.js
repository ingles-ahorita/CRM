/**
 * POST /api/cancel-iclosed — dedicated route so Vercel accepts POST (avoids 405 on catch-all).
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/cancel-iclosed.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
