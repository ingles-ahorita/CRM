/**
 * POST /api/manychat — dedicated route so Vercel invokes this function for POST (avoids 405 on catch-all).
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/manychat.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
