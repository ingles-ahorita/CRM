import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Table name for storing fbclid data
const TABLE_NAME = 'fbclid_tracking';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { fbclid, calendly_event_uri } = req.body;

    // Validate required fields
    if (!fbclid || !calendly_event_uri) {
      return res.status(400).json({ 
        error: 'Missing required fields: fbclid and calendly_event_uri are required' 
      });
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        fbclid,
        calendly_event_uri,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing fbclid to Supabase:', error);
      return res.status(500).json({ 
        error: 'Failed to store data',
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true,
      data,
      message: 'Data stored successfully'
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
