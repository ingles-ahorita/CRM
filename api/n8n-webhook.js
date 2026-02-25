/**
 * POST /api/n8n-webhook — dedicated route so Vercel invokes this function for POST (avoids 405 on catch-all).
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/n8n-webhook.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
