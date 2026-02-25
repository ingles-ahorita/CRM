/**
 * POST /api/ai-setter — dedicated route so Vercel accepts POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/ai-setter.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
