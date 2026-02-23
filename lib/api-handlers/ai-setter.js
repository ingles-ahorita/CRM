/** Stub: AI setter handler not implemented; returns 503. */
export default async function handler(req, res) {
  return res.status(503).json({
    error: 'AI setter handler not available',
    details: 'Missing implementation or environment',
  });
}
