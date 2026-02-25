/**
 * Shared body parser for POST API routes on Vercel.
 * Use: const reqWithBody = await withParsedBody(req); then handler(reqWithBody, res);
 */
export async function parseBody(req) {
  if (typeof req.json === 'function') {
    try {
      const parsed = await req.json();
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  const b = req.body;
  if (b != null && typeof b === 'object' && !(b instanceof Buffer) && typeof b.pipe !== 'function' && typeof b.getReader !== 'function') {
    return b;
  }
  if (typeof req.on === 'function') {
    try {
      const raw = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      return raw && raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Returns a request-like object with body set (for POST routes). */
export async function withParsedBody(req) {
  const body = await parseBody(req);
  const method = (req.method || 'POST').toString().toUpperCase();
  return Object.assign({}, req, { method, body: body || {} });
}
