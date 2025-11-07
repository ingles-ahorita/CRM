// manychatService.js

const FIELD_MAP = {
  picked_up: 13238831,
  confirmed: 13312466,
  showed_up: 13238842,
  purchased: 13238837,
  setter_id: 13239191,
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