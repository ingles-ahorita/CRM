import { createClient } from '@supabase/supabase-js';

// CRM app Supabase URL
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Supabase client with service role key - ALWAYS use this for storing payloads (bypasses RLS)
const supabaseStorage = SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// CRM app Supabase client (for offers table - can use anon key)
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
);

// Academic app API URL
const ACADEMIC_APP_URL = 'https://academic.inglesahorita.com';

// Function to store payload - MUST succeed or retry
async function storePayload(payload) {
  if (!supabaseStorage) {
    console.error('⚠️ SUPABASE_SERVICE_ROLE_KEY not set - cannot store payload');
    return null;
  }

  // Retry logic: try up to 3 times
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data: storedPayload, error: storeError } = await supabaseStorage
        .from('webhook_inbounds')
        .insert({
          payload: payload,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (storeError) {
        lastError = storeError;
        console.error(`Attempt ${attempt}/3: Error storing webhook payload:`, storeError);
        if (attempt < 3) {
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      } else {
        console.log('✅ Payload stored successfully in webhook_inbounds:', storedPayload?.id);
        return storedPayload?.id;
      }
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/3: Unexpected error storing webhook payload:`, error);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
    }
  }

  // If all retries failed, log critical error but don't throw
  console.error('❌ CRITICAL: Failed to store payload after 3 attempts:', lastError);
  return null;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body;
  
  console.log('📨 Kajabi webhook received:', JSON.stringify(payload, null, 2));

  // CRITICAL: ALWAYS store the inbound request FIRST, no matter what happens later
  // This happens before ANY other processing
  const storedPayloadId = await storePayload(payload);
  
  if (!storedPayloadId) {
    console.error('⚠️ WARNING: Payload storage failed, but continuing with processing...');
  }

  try {
    // Extract customer information from Kajabi payload
    // Structure: { id, event, payload: { member_email, member_name, offer_id, ... } }
    if (!payload.payload || !payload.payload.member_email) {
      console.error('Missing member_email in payload');
      return res.status(400).json({ 
        error: 'Missing member_email in payload',
        received: Object.keys(payload)
      });
    }

    const memberEmail = payload.payload.member_email.toLowerCase().trim();
    const firstName = payload.payload.member_first_name || '';
    const lastName = payload.payload.member_last_name || '';
    const memberName = payload.payload.member_name || '';
    const customerName = memberName || `${firstName} ${lastName}`.trim() || memberEmail;

    // Get offer_id from payload
    const offerId = payload.payload.offer_id;
    
    if (!offerId) {
      console.error('Missing offer_id in payload');
      return res.status(400).json({ 
        error: 'Missing offer_id in payload'
      });
    }

    // Look up the offer in the offers table by kajabi_id
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('kajabi_id, weekly_classes')
      .eq('kajabi_id', offerId)
      .maybeSingle();

    if (offerError) {
      console.error('Error fetching offer:', offerError);
      return res.status(500).json({ 
        error: 'Failed to fetch offer',
        details: offerError.message
      });
    }

    if (!offer) {
      console.error(`Offer not found for kajabi_id: ${offerId}`);
      return res.status(404).json({ 
        error: `Offer not found for kajabi_id: ${offerId}`
      });
    }

    const weeklyClasses = offer.weekly_classes || 0;

    console.log(`Found offer: kajabi_id=${offerId}, weekly_classes=${weeklyClasses}`);

    // Call academic-app API to create student
    const academicApiUrl = `${ACADEMIC_APP_URL}/api/create-student`;
    
    const studentData = {
      email: memberEmail,
      name: customerName,
      weekly_classes: weeklyClasses
    };

    console.log('Calling academic-app API:', academicApiUrl);
    console.log('Student data:', studentData);

    const academicResponse = await fetch(academicApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(studentData)
    });

    const academicResponseData = await academicResponse.json();

    if (!academicResponse.ok) {
      console.error('Academic app API error:', academicResponseData);
      return res.status(academicResponse.status).json({ 
        error: 'Failed to create student in academic app',
        details: academicResponseData
      });
    }

    console.log('Student created successfully in academic app:', academicResponseData);

    return res.status(200).json({ 
      message: 'Student created successfully',
      student: academicResponseData.student,
      offer: {
        kajabi_id: offerId,
        weekly_classes: weeklyClasses
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}

