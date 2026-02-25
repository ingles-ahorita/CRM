/**
 * POST /api/ruben-shift-toggle — dedicated route so Vercel accepts POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/ruben-shift-toggle.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
