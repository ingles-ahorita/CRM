/**
 * POST /api/meta-conversion — dedicated route so Vercel accepts POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/meta-conversion.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
