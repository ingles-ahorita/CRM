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
      const error = await response.json();
      throw new Error(error.error || 'Failed to update Manychat');
    }

    const data = await response.json();
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
    callData.setter = lead.setters.name;
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