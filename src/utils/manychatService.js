// manychatService.js

const API_KEY = '1237190:108ada6f750c8dba23c7702931473162';
const BASE_URL = 'https://api.manychat.com/fb/subscriber';

const FIELD_MAP = {
  picked_up: 13238831,   // pickUp
  confirmed: 13312466,   // confirmed
  showed_up: 13238842,  // showUp
  purchased: 13238837,  // purchase
};

/**
 * Update a single custom field in Manychat for a subscriber
 * @param {string} subscriberId - The Manychat user ID
 * @param {number} fieldKey - The field key from FIELD_MAP (e.g., 6 for pickUp)
 * @param {any} value - The value to set (true/false/string)
 */
export const updateManychatField = async (subscriberId, fieldKey, value) => {
  const fieldId = FIELD_MAP[fieldKey];
  
  if (!fieldId) {
    console.error(`Field key ${fieldKey} not found in FIELD_MAP`);
    return;
  }

  // Format value like your Google Script does
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

  const url = `${BASE_URL}/setCustomField`;
  const payload = {
    subscriber_id: subscriberId,
    field_id: fieldId,
    field_value: formattedValue
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Manychat API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log('✅ Manychat field updated:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Error updating Manychat field:', error);
    throw error;
  }
};
