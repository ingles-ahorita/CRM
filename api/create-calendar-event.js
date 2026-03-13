/**
 * POST /api/create-calendar-event — Vercel serverless route.
 */
import { withParsedBody } from './_parse-body.js';
import handler from '../lib/api-handlers/create-calendar-event.js';

export default async function (req, res) {
  const reqWithBody = await withParsedBody(req);
  return handler(reqWithBody, res);
}
