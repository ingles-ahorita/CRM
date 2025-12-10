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
    // Validate required fields
    if (!first_name || !whatsapp_phone) {
      return res.status(400).json({ error: 'Missing required fields: first_name and whatsapp_phone' });
    }

    // Use provided API key or fallback to default
    const manychatApiKey = apiKey || API_KEY;
    
    if (!manychatApiKey) {
      console.error('❌ No API key provided and no default API key');
      return res.status(400).json({ error: 'Missing API key' });
    }

    // Prepare payload for ManyChat API
    const payload = {
      first_name: first_name,
      last_name: last_name || '',
      whatsapp_phone: whatsapp_phone
    };

    console.log('📤 Calling ManyChat API:', {
      url: `${BASE_URL}/createSubscriber`,
      payload: payload,
      hasApiKey: !!manychatApiKey
    });

    try {
      // Try to create the user
      const response = await fetch(`${BASE_URL}/createSubscriber`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${manychatApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('📥 ManyChat API response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });

      if (!response.ok) {
        // If creation fails, try to find user by whatsapp_phone
        console.log('⚠️ User creation failed, attempting to find by whatsapp_phone:', whatsapp_phone);
        
        try {
          const findUrl = `${BASE_URL}/findBySystemField?phone=${encodeURIComponent(whatsapp_phone)}`;
          console.log('🔍 Searching for user:', findUrl);
          
          const findResponse = await fetch(findUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${manychatApiKey}`,
              'Content-Type': 'application/json',
            }
          });

          const findResponseText = await findResponse.text();
          console.log('🔍 Find response:', {
            status: findResponse.status,
            body: findResponseText
          });

          if (findResponse.ok) {
            const findData = JSON.parse(findResponseText);
            if (findData.status === 'success' && findData.data) {
              console.log('✅ Found existing user by whatsapp_phone:', findData.data.id);
              return res.status(200).json({ success: true, data: findData.data, found: true });
            }
          }
        } catch (findError) {
          console.error('❌ Error finding user by phone:', findError);
        }

        // If we get here, both create and find failed
        let errorMessage = responseText;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorData.message || responseText;
        } catch (e) {
          // Keep original text if not JSON
        }
        throw new Error(`Manychat API error (${response.status}): ${errorMessage}`);
      }

      const data = JSON.parse(responseText);
      console.log('✅ ManyChat user created successfully');
      console.log('📦 ManyChat API response structure:', JSON.stringify(data, null, 2));
      return res.status(200).json({ success: true, data, found: false });

    } catch (error) {
      console.error('❌ Manychat create user error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
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