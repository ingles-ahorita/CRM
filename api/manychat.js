const API_KEY = '1237190:108ada6f750c8dba23c7702931473162';
const BASE_URL = 'https://api.manychat.com/fb/subscriber';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscriberId, fieldId, value, updates, first_name, last_name, whatsapp_phone, action, apiKey, fieldsByName } = req.body;

  // Handle set custom fields by name action
  if (action === 'set-fields-by-name') {
    // Validate required fields
    if (!subscriberId || !fieldsByName || !Array.isArray(fieldsByName)) {
      return res.status(400).json({ error: 'Missing required fields: subscriberId and fieldsByName (array)' });
    }

    // Use provided API key or fallback to default
    const manychatApiKey = apiKey || API_KEY;

    const results = [];
    const errors = [];

    // Loop through each field and set it
    for (const field of fieldsByName) {
      if (!field.name || field.value === undefined) {
        errors.push({ field: field.name || 'unknown', error: 'Missing field name or value' });
        continue;
      }

      try {
        const payload = {
          subscriber_id: subscriberId,
          field_name: field.name,
          field_value: field.value
        };

        const response = await fetch(`${BASE_URL}/setCustomFieldByName`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${manychatApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const error = await response.text();
          errors.push({ field: field.name, error: error });
        } else {
          const data = await response.json();
          results.push({ field: field.name, success: true, data });
        }
      } catch (error) {
        errors.push({ field: field.name, error: error.message });
      }
    }

    // Return results and any errors
    return res.status(200).json({ 
      success: errors.length === 0, 
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  // Handle create user action
  if (action === 'create-user') {
    // Validate required fields
    if (!first_name || !whatsapp_phone) {
      return res.status(400).json({ error: 'Missing required fields: first_name and whatsapp_phone' });
    }

    // Use provided API key or fallback to default
    const manychatApiKey = apiKey || API_KEY;

    // Prepare payload for ManyChat API
    const payload = {
      first_name: first_name,
      last_name: last_name || '',
      whatsapp_phone: whatsapp_phone
    };

    try {
      const response = await fetch(`${BASE_URL}/createSubscriber`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${manychatApiKey}`,
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
      console.error('Manychat create user error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Support multiple fields update (new format)
  if (updates && Array.isArray(updates)) {
    if (!subscriberId) {
      return res.status(400).json({ error: 'Missing required fields: subscriberId' });
    }

    // Transform updates to ManyChat format
    const fields = updates
      .filter(update => update.fieldId && update.value !== undefined && update.value !== null)
      .map(update => ({
        field_id: update.fieldId,
        field_value: update.value
      }));

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const payload = {
      subscriber_id: subscriberId,
      fields: fields
    };

    try {
      const response = await fetch(`${BASE_URL}/setCustomFields`, {
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
  // Support single field update (backward compatibility)
  else {
    if (!subscriberId || !fieldId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload = {
      subscriber_id: subscriberId,
      fields: [
        {
          field_id: fieldId,
          field_value: value
        }
      ]
    };

    try {
      const response = await fetch(`${BASE_URL}/setCustomFields`, {
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
}