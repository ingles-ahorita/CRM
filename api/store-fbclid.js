/**
 * POST /api/store-fbclid — dedicated route so Vercel accepts POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/store-fbclid.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
