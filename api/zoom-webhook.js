/**
 * POST /api/zoom-webhook — dedicated route so Vercel accepts POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/zoom-webhook.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
