import { supabase } from '../lib/supabaseClient';
// manychatService.js

const FIELD_MAP = {
  picked_up: 13238831,
  confirmed: 13312466,
  showed_up: 13238842,
  purchased: 13238837,
  setter_id: 13239191,
  // Custom fields for call information
  call_date: 13195918, // TODO: Add ManyChat field ID
  call_time_local: 13195923, // TODO: Add ManyChat field ID
  local_date: 13360206, // TODO: Add ManyChat field ID
  setter: 13239191, // TODO: Add ManyChat field ID
  closer: 13302221, // TODO: Add ManyChat field ID
  call_link: 13195770, // TODO: Add ManyChat field ID
};

/**
 * Update a single custom field in Manychat for a subscriber
 * @param {string} subscriberId - The Manychat user ID
 * @param {string} fieldKey - The field key from FIELD_MAP (e.g., 'picked_up')
 * @param {any} value - The value to set (true/false/string)
 */
export const updateManychatField = async (subscriberId, fieldKey, value) => {
  console.log('Updating Manychat field:', fieldKey, 'to', value);
  const fieldId = FIELD_MAP[fieldKey];
  
  if (!fieldId) {
    console.error(`Field key ${fieldKey} not found in FIELD_MAP`);
    return;
  }

  // Format value
  let formattedValue;
  if (value === "YES" || value === true) {
    formattedValue = true;
  } else if (value === "NO" || value === false) {
    formattedValue = false;
  } else if (value === "" || value === "TBD" || value === null) {
    console.log("⏩ Skipping update: empty or TBD.");
    return;
  } else {
    formattedValue = value;
  }

  try {
    // Call YOUR backend API instead of Manychat directly
    const response = await fetch('/api/manychat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriberId,
        fieldId,
        value: formattedValue
      })
    });

    if (!response.ok) {
      let errorMessage = `Failed to update Manychat (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // If response isn't JSON, try to get text
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch (textError) {
          // Keep default error message
        }
      }
      throw new Error(errorMessage);
    }

    let data;
    try {
      const responseText = await response.text();
      data = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.warn('Response is not valid JSON, using empty object');
      data = {};
    }
    console.log('✅ Manychat field updated:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Error updating Manychat field:', error);
    throw error;
  }
};

/**
 * Build and format callData object from a lead object (from calls table)
 * Formats dates and times appropriately for ManyChat
 * @param {Object} lead - Lead object from calls table
 * @param {Object} lead.call_date - The call date
 * @param {string} lead.timezone - The timezone for local time
 * @param {Object} lead.setters - Setter relation object with {id, name}
 * @param {Object} lead.closers - Closer relation object with {id, name}
 * @param {string} lead.call_link - The call link URL from calls table
 * @returns {Object} Formatted callData object ready for updateManychatCallFields
 */
export const buildCallDataFromLead = (lead) => {
  const callData = {};

  // Helper function to format date as ISO string
  const formatDate = (date) => {
    if (!date) return null;
    return new Date(date).toISOString();
  };

  // Helper function to format time in local timezone
  const formatTime = (date, timezone) => {
    if (!date) return null;
    const d = new Date(date);
    if (timezone) {
      return d.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true, 
        timeZone: timezone 
      });
    }
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Call date (ISO string)
  if (lead.call_date) {
    callData.callDate = formatDate(lead.call_date);
  }

  // Call time local (formatted with timezone if available)
  if (lead.call_date) {
    callData.callTimeLocal = formatTime(lead.call_date, lead.timezone);
  }

  // Local date (formatted as ISO date string)
  if (lead.call_date) {
    // Local date in DD/MM/YYYY in their local timezone
    if (lead.call_date) {
      const d = new Date(lead.call_date);
      if (lead.timezone) {
        // Use Intl.DateTimeFormat for local timezone
        callData.localDate = new Intl.DateTimeFormat('en-GB', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          timeZone: lead.timezone 
        }).format(d);
      } else {
        // Fallback to browser local timezone
        callData.localDate = new Intl.DateTimeFormat('en-GB', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit'
        }).format(d);
      }
    }
  }

  // Setter name (from join)
  if (lead.setters?.name) {
    callData.setter = lead.setters.name.charAt(0).toUpperCase() + lead.setters.name.slice(1).toLowerCase();
  }

  // Closer name (from join)
  if (lead.closers?.name) {
    callData.closer = lead.closers.name;
  }

  // Call link (from calls table)
  if (lead.call_link) {
    callData.callLink = lead.call_link;
  }

  return callData;
};

/**
 * Update multiple custom fields in Manychat for a subscriber
 * Sets call date, call time local, local date, setter, closer, and call link
 * @param {string} subscriberId - The Manychat user ID
 * @param {Object} callData - Object containing call information
 * @param {string|Date} callData.callDate - The call date
 * @param {string|Date} callData.callTimeLocal - The call time in local timezone
 * @param {string|Date} callData.localDate - The local date
 * @param {string} callData.setter - The setter name
 * @param {string} callData.closer - The closer name
 * @param {string} callData.callLink - The call link URL
 */
export const updateManychatCallFields = async (subscriberId, callData) => {
  console.log('Updating Manychat call fields for subscriber:', subscriberId, callData);

  const updates = [];

  // Prepare updates for each field (data is already formatted from buildCallDataFromLead)
  if (callData.callDate && FIELD_MAP.call_date) {
    updates.push({
      fieldId: FIELD_MAP.call_date,
      value: callData.callDate
    });
  }

  if (callData.callTimeLocal && FIELD_MAP.call_time_local) {
    updates.push({
      fieldId: FIELD_MAP.call_time_local,
      value: callData.callTimeLocal
    });
  }

  if (callData.localDate && FIELD_MAP.local_date) {
    updates.push({
      fieldId: FIELD_MAP.local_date,
      value: callData.localDate
    });
  }

  if (callData.setter && FIELD_MAP.setter) {
    updates.push({
      fieldId: FIELD_MAP.setter,
      value: callData.setter
    });
  }

  if (callData.closer && FIELD_MAP.closer) {
    updates.push({
      fieldId: FIELD_MAP.closer,
      value: callData.closer
    });
  }

  if (callData.callLink && FIELD_MAP.call_link) {
    updates.push({
      fieldId: FIELD_MAP.call_link,
      value: callData.callLink
    });
  }

  if (updates.length === 0) {
    console.log('⏩ No fields to update');
    return;
  }

  try {
    // Call backend API to update multiple fields
    const response = await fetch('/api/manychat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriberId,
        updates // Array of {fieldId, value} objects
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update Manychat fields');
    }

    const data = await response.json();
    console.log('✅ Manychat call fields updated:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Error updating Manychat call fields:', error);
    throw error;
  }
};

/**
 * Create a new user in ManyChat
 * This function will be called when a lead is confirmed
 * @param {Object} leadData - Lead data object containing user information
 * @param {string} leadData.name - User full name (will be split into first_name and last_name)
 * @param {string} leadData.phone - Phone number (will be sent as whatsapp_phone)
 * @param {string} leadData.apiKey - ManyChat API key from the closer
 * @param {Array} leadData.fieldsToSet - Array of objects with {name: string, value: any} to set after creation
 * @returns {Promise<Object>} Response from ManyChat API with subscriber ID
 */
export const sendToCloserMC = async (leadData) => {
  console.log('Creating ManyChat user for lead:', leadData);
  
  // Step 1 - Validate required fields (name and phone)
  if (!leadData.name || !leadData.phone) {
    throw new Error('Name and phone are required to create ManyChat user');
  }

  // Step 2 - Split name into first_name and last_name
  const nameParts = leadData.name.trim().split(/\s+/);
  const first_name = nameParts[0] || '';
  const last_name = nameParts.slice(1).join(' ') || '';

  // Step 3 - Prepare user data payload (only name and whatsapp_phone)
  const payload = {
    first_name: first_name,
    last_name: last_name,
    whatsapp_phone: leadData.phone
  };

  console.log('Sending payload to ManyChat:', payload);
  
  try {
    // Step 4 - Call ManyChat API to create user
    const response = await fetch('/api/manychat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-user',
        apiKey: leadData.apiKey,
        ...payload
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create ManyChat user');
    }

    // Step 5 - Handle response and get subscriber ID
    const data = await response.json();

    // Store the subscriber ID in the field 'closer_mc_id' in the database if possible
    const subscriberId = data?.data?.data?.id;
    if (subscriberId && leadData.id) {
      console.log('Storing subscriber ID in DB:', subscriberId, 'for lead_id:', leadData.id);
      try {
        await supabase
          .from('calls')
          .update({ closer_mc_id: subscriberId })
          .eq('id', leadData.id);
        console.log('✅ closer_mc_id updated in DB:', subscriberId, 'for lead_id:', leadData.id);
        console.log('✅ Confirmation: subscriberId successfully stored in closer_mc_id');
      } catch (dbError) {
        console.error('❌ Failed to update closer_mc_id in DB:', dbError);
      }
    }
    console.log('✅ ManyChat user created:', data);
    
    // Step 6 - Set custom fields by name if provided
    if (leadData.fieldsToSet && Array.isArray(leadData.fieldsToSet) && leadData.fieldsToSet.length > 0) {
      // Extract subscriber_id from response (adjust based on actual response structure)   
      // Always attempt to set custom fields: fetch closer_mc_id from the database using calls.id (NOT by lead_id, but just id)
      let finalSubscriberId = null;
      if (leadData.id) {
        try {
          const { data: dbRow, error: dbError } = await supabase
            .from('calls')
            .select('closer_mc_id')
            .eq('id', leadData.id)
            .maybeSingle();

          if (dbError) {
            console.warn('⚠️ Could not fetch closer_mc_id from calls by id:', leadData.id, dbError);
          } else if (dbRow && dbRow.closer_mc_id) {
            finalSubscriberId = dbRow.closer_mc_id;
            console.log('🔄 Loaded closer_mc_id from calls.id:', finalSubscriberId);
          } else {
            console.warn('⚠️ No closer_mc_id found for calls.id:', leadData.id);
          }
        } catch (lookupError) {
          console.warn('⚠️ Exception while loading closer_mc_id from calls by id:', leadData.id, lookupError);
        }
      }
      if (finalSubscriberId) {
        try {
          await setManychatFieldsByName(subscriberId, leadData.fieldsToSet, leadData.apiKey);
          console.log('✅ ManyChat custom fields set successfully');
        } catch (fieldError) {
          console.error('⚠️ User created but failed to set custom fields:', fieldError);
          // Don't throw - user was created successfully
        }
      } else {
        console.warn('⚠️ Could not extract subscriber_id from response to set custom fields');
      }
    }
    
    return data;
    
  } catch (error) {
    // Step 7 - Error handling
    console.error('❌ Error creating ManyChat user:', error);
    throw error;
  }
};

/**
 * Set multiple custom fields in ManyChat by field name
 * @param {string} subscriberId - The ManyChat subscriber ID
 * @param {Array} fields - Array of objects with {name: string, value: any}
 * @param {string} apiKey - ManyChat API key
 * @returns {Promise<Object>} Response from ManyChat API
 */
export const setManychatFieldsByName = async (subscriberId, fields, apiKey) => {
  console.log('Setting ManyChat fields by name:', { subscriberId, fields });
  
  if (!subscriberId || !fields || !Array.isArray(fields)) {
    throw new Error('subscriberId and fields array are required');
  }

  if (fields.length === 0) {
    console.log('⏩ No fields to update');
    return { success: true, results: [] };
  }

  try {
    const response = await fetch('/api/manychat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'set-fields-by-name',
        subscriberId: subscriberId,
        fieldsByName: fields,
        apiKey: apiKey
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to set ManyChat fields');
    }

    const data = await response.json();
    console.log('✅ ManyChat fields set:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Error setting ManyChat fields:', error);
    throw error;
  }
};