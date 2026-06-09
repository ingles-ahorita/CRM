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

    const body = req.body || {};
    const { subscriberId, fieldId, value, updates, first_name, last_name, whatsapp_phone, action, apiKey, fieldsByName } = body;

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

  // Handle find user by phone (used when create fails and client retries with find)
  if (action === 'find-user-by-phone') {
    const { whatsapp_phone: findPhone, apiKey: findApiKey } = body;
    if (!findPhone || !findApiKey) {
      return res.status(400).json({ error: 'Missing required fields: whatsapp_phone and apiKey' });
    }
    try {
      const customFieldsResponse = await fetch('https://api.manychat.com/fb/page/getCustomFields', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${findApiKey}`,
          'Content-Type': 'application/json',
        }
      });
      if (!customFieldsResponse.ok) {
        const errText = await customFieldsResponse.text();
        throw new Error(`Failed to get custom fields: ${customFieldsResponse.status} - ${errText}`);
      }
      const customFieldsData = await customFieldsResponse.json();
      const dataFields = customFieldsData.data || [];
      const phoneField = dataFields.find(f => f.name === 'phone') || dataFields.find(f => f.name === 'whatsapp_phone');
      if (!phoneField?.id) {
        return res.status(404).json({ error: 'Phone field not found in ManyChat custom fields' });
      }
      // Try both the original phone and the version with leading + stripped,
      // since ManyChat may store the custom field value in either format.
      const findVariants = [...new Set([
        findPhone.replace(/^\+/, ''),
        findPhone,
      ].filter(Boolean))];

      let subscriberId = null;
      for (const phoneVal of findVariants) {
        const findUrl = `${BASE_URL}/findByCustomField?field_id=${phoneField.id}&field_value=${encodeURIComponent(phoneVal)}`;
        const findResponse = await fetch(findUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${findApiKey}`,
            'Content-Type': 'application/json',
          }
        });
        if (!findResponse.ok) continue;
        const findData = await findResponse.json();
        subscriberId = findData.data?.[0]?.id;
        if (subscriberId) break;
      }

      if (!subscriberId) {
        return res.status(404).json({ error: 'Subscriber not found for this phone number' });
      }
      return res.status(200).json({ success: true, subscriberId, found: true });
    } catch (error) {
      console.error('❌ find-user-by-phone error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Handle create user action
  if (action === 'create-user') {
    if (!first_name || !whatsapp_phone || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: first_name, whatsapp_phone, and apiKey' });
    }

    const debug = { steps: [] };
    
    try {
      // Step 1: Try to create the user
      debug.steps.push({ step: 1, action: 'createSubscriber', phone: whatsapp_phone });
      console.log('📤 Step 1: Creating subscriber with phone:', whatsapp_phone);
      
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

      const createResponseText = await createResponse.text();
      console.log('📥 Create response:', {
        status: createResponse.status,
        statusText: createResponse.statusText,
        body: createResponseText
      });
      debug.steps.push({ step: 1, status: createResponse.status, response: createResponseText });

      if (createResponse.ok) {
        const createData = JSON.parse(createResponseText);
        const subscriberId = createData.data?.id || createData.id;
        console.log('✅ User created, subscriberId:', subscriberId);
        return res.status(200).json({ success: true, subscriberId, found: false, debug });
      }

      // Step 2: If creation fails, user already exists - get custom fields to find phone field ID
      console.log('⚠️ Step 2: User creation failed, getting custom fields...');
      debug.steps.push({ step: 2, action: 'getCustomFields' });
      
      const customFieldsResponse = await fetch('https://api.manychat.com/fb/page/getCustomFields', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      const customFieldsText = await customFieldsResponse.text();
      console.log('📥 Custom fields response:', {
        status: customFieldsResponse.status,
        body: customFieldsText
      });
      debug.steps.push({ step: 2, status: customFieldsResponse.status, response: customFieldsText });

      if (!customFieldsResponse.ok) {
        throw new Error(`Failed to get custom fields: ${customFieldsResponse.status}`);
      }

      const customFieldsData = JSON.parse(customFieldsText);
      console.log('📋 Custom fields data:', customFieldsData);
      const dataFields = customFieldsData.data || [];
      const phoneField = dataFields.find(f => f.name === 'phone') || dataFields.find(f => f.name === 'whatsapp_phone');
      console.log('📞 Phone field found:', phoneField);
      debug.steps.push({ step: 2, phoneField });
      
      if (!phoneField || !phoneField.id) {
        throw new Error('Phone field not found in custom fields (tried "phone" and "whatsapp_phone")');
      }

      // Step 3: Find subscriber by phone using the phone field ID.
      // Try multiple phone formats to handle the common ManyChat WhatsApp storage patterns:
      //   - waIdFromError: digits-only wa_id from the "already exists" error (e.g. 5493814436226)
      //   - +waIdFromError: same wa_id with + prefix, matching the "+{{WhatsApp ID}}" pattern
      //     used in ManyChat's "Set phone" automation (e.g. +5493814436226)
      //   - phone with leading + stripped (e.g. 543814436226)
      //   - original phone as-is (e.g. +543814436226)
      let waIdFromError = null;
      try {
        const createErrBody = JSON.parse(createResponseText);
        const waMsg = createErrBody?.details?.messages?.wa_id?.message?.[0];
        if (waMsg) {
          const match = waMsg.match(/already exists:\s*(\d+)/);
          waIdFromError = match?.[1] || null;
        }
      } catch (_) {}

      const phoneVariants = [...new Set([
        waIdFromError,
        waIdFromError ? '+' + waIdFromError : null,
        whatsapp_phone.replace(/^\+/, ''),
        whatsapp_phone,
      ].filter(Boolean))];

      console.log('🔍 Step 3: Trying findByCustomField variants:', phoneVariants);
      debug.steps.push({ step: 3, action: 'findByCustomField', variants: phoneVariants });

      let subscriberId = null;
      for (const phoneVal of phoneVariants) {
        const findUrl = `${BASE_URL}/findByCustomField?field_id=${phoneField.id}&field_value=${encodeURIComponent(phoneVal)}`;
        const findResponse = await fetch(findUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }
        });
        const findResponseText = await findResponse.text();
        debug.steps.push({ step: 3, variant: phoneVal, status: findResponse.status, response: findResponseText });
        if (findResponse.ok) {
          const findData = JSON.parse(findResponseText);
          subscriberId = findData.data?.[0]?.id;
          if (subscriberId) {
            console.log(`✅ Found subscriber with variant "${phoneVal}":`, subscriberId);
            break;
          }
        }
      }

      if (!subscriberId) {
        throw new Error('Subscriber ID not found in response');
      }

      // Use subscriber/updateSubscriber to update first and last name
      await fetch(`${BASE_URL}/updateSubscriber`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          first_name: first_name || body.first_name || '',
          last_name: last_name || body.last_name || ''
        })
      });


      return res.status(200).json({ success: true, subscriberId, found: true, debug });

    } catch (error) {
      console.error('❌ Manychat create user error:', error);
      debug.steps.push({ error: error.message, stack: error.stack });
      return res.status(500).json({ error: error.message, debug });
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