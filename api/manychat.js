const API_KEY = '1237190:108ada6f750c8dba23c7702931473162';
const BASE_URL = 'https://api.manychat.com/fb/subscriber';

export default async function handler(req, res) {
  try {
    // Set CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Log all requests for debugging
    console.log('📨 API Request received:', {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    });

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
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
    if (!first_name || !whatsapp_phone || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: first_name, whatsapp_phone, and apiKey' });
    }

    try {
      // Step 1: Try to create the user
      const createResponse = await fetch(`${BASE_URL}/createSubscriber`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name,
          last_name: last_name || '',
          whatsapp_phone
        })
      });

      if (createResponse.ok) {
        const createData = await createResponse.json();
        const subscriberId = createData.data?.id || createData.id;
        return res.status(200).json({ success: true, subscriberId, found: false });
      }

      // Step 2: If creation fails, user already exists - get custom fields to find phone field ID
      console.log('⚠️ User creation failed, user likely exists. Finding by phone...');
      
      const customFieldsResponse = await fetch('https://api.manychat.com/fb/page/getCustomFields', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!customFieldsResponse.ok) {
        throw new Error(`Failed to get custom fields: ${customFieldsResponse.status}`);
      }

      const customFieldsData = await customFieldsResponse.json();
      const phoneField = customFieldsData.data?.find(field => field.name === 'phone');
      
      if (!phoneField || !phoneField.id) {
        throw new Error('Phone field not found in custom fields');
      }

      // Step 3: Find subscriber by phone using the phone field ID
      const findResponse = await fetch(`${BASE_URL}/findByCustomField?field_id=${phoneField.id}&field_value=${encodeURIComponent(whatsapp_phone)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (!findResponse.ok) {
        throw new Error(`Failed to find subscriber: ${findResponse.status}`);
      }

      const findData = await findResponse.json();
      const subscriberId = findData.data?.id || findData.id;
      
      if (!subscriberId) {
        throw new Error('Subscriber ID not found in response');
      }

      return res.status(200).json({ success: true, subscriberId, found: true });

    } catch (error) {
      console.error('❌ Manychat create user error:', error);
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
      console.log('📤 Calling ManyChat setCustomFields (single):', { payload, apiKey: API_KEY ? 'present' : 'missing' });
      
      const response = await fetch(`${BASE_URL}/setCustomFields`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('📥 ManyChat setCustomFields (single) response:', {
        status: response.status,
        body: responseText
      });

      if (!response.ok) {
        throw new Error(`Manychat error (${response.status}): ${responseText}`);
      }

      const data = responseText ? JSON.parse(responseText) : {};
      return res.status(200).json({ success: true, data });

    } catch (error) {
      console.error('❌ Manychat update error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

    // If no action matches, return error
    console.warn('⚠️ No matching action handler:', { action, hasSubscriberId: !!subscriberId });
    return res.status(400).json({ error: 'Invalid action or missing required parameters' });
    
  } catch (error) {
    // Global error handler - ensure we always return valid JSON
    console.error('❌ Unhandled error in API handler:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}