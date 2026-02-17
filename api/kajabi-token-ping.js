/**
 * Debug ping: confirms the serverless function runs and logs appear in Vercel.
 * GET /api/kajabi-token-ping → { ok: true }
 * Then check Vercel → Project → Logs (Runtime) for "[Kajabi token] PING".
 */

export default async function handler(req, res) {
  const isVercel = !!process.env.VERCEL;
  // Use console.warn so it shows in Vercel Runtime Logs even if log level is high
  console.warn('[Kajabi token] PING', { isVercel, at: new Date().toISOString() });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, msg: 'ping', isVercel, at: new Date().toISOString() });
}
