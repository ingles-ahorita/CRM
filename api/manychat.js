const API_KEY = '1237190:108ada6f750c8dba23c7702931473162';
const BASE_URL = 'https://api.manychat.com/fb/subscriber';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscriberId, fieldId, value } = req.body;

  if (!subscriberId || !fieldId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const payload = {
    subscriber_id: subscriberId,
    field_id: fieldId,
    field_value: value
  };

  try {
    const response = await fetch(`${BASE_URL}/setCustomField`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Manychat error: ${error}`);
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Manychat update error:', error);
    return res.status(500).json({ error: error.message });
  }
}