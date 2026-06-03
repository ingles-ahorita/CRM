/**
 * GET/POST /api/iclosed — narrow server-side proxy for iClosed reads.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/iclosed.js';

export default async function (req, res) {
  const reqWithBody = req.method === 'POST' ? await withParsedBody(req) : req;
  return handler(reqWithBody, res);
}
