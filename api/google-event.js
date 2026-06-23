/**
 * /api/google-event — dedicated route so Vercel accepts GET + POST.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/google-event.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
