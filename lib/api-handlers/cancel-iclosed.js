// POST /api/cancel-iclosed — cancel an iClosed event call (numeric id from calls.calendly_id via Zapier)
const ICLOSED_API_BASE_URL =
  process.env.ICLOSED_API_BASE_URL || 'https://public.api.iclosed.io';

function formatIclosedErrorMessage(data, responseText, statusText) {
  if (typeof data === 'string') return data;
  if (data?.error && typeof data.error === 'string') return data.error;
  if (data?.message) {
    return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
  }
  return responseText || statusText || 'Unknown iClosed error';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method not allowed: ${req.method}` });
  }

  const apiKey = process.env.ICLOSED_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ICLOSED_API_KEY is not configured' });
  }

  const { eventCallId, cancelReason } = req.body || {};
  if (!eventCallId) {
    return res.status(400).json({ error: 'Missing required field: eventCallId' });
  }

  const rawId = String(eventCallId).trim();
  if (!/^\d+$/.test(rawId)) {
    return res.status(400).json({
      error: 'iClosed cancel requires a numeric event call id in calls.calendly_id.',
    });
  }

  const cancelPayload = {
    id: Number(rawId),
    cancelReason: cancelReason || 'Cancelled from CRM',
  };

  const iclosedUrl = `${ICLOSED_API_BASE_URL}/v1/eventCalls/cancel`;

  try {
    const response = await fetch(iclosedUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cancelPayload),
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      const message = formatIclosedErrorMessage(data, responseText, response.statusText);
      if (/already cancel/i.test(message)) {
        return res.status(200).json({ success: true, data: { message: 'Event is already canceled' } });
      }
      return res.status(response.status).json({
        error: `iClosed API error: ${response.status} ${message}`,
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
