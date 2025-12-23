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

// Function to store RAW payload - stores exactly what was received, no transformation
// NEVER fails due to structure - stores whatever is passed, even null/undefined
async function storePayload(rawPayload) {
  console.log('🔵 STORE PAYLOAD CALLED');
  console.log('🔵 Supabase URL:', SUPABASE_URL);
  console.log('🔵 Service Role Key exists:', !!SUPABASE_SERVICE_ROLE_KEY);
  console.log('🔵 supabaseStorage client exists:', !!supabaseStorage);
  console.log('🔵 Raw payload type:', typeof rawPayload);
  console.log('🔵 Raw payload:', JSON.stringify(rawPayload, null, 2));

  if (!supabaseStorage) {
    console.error('❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY not set - cannot store payload');
    console.error('❌ SUPABASE_URL:', SUPABASE_URL);
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'EXISTS' : 'MISSING');
    return null;
  }

  if (!SUPABASE_URL) {
    console.error('❌ CRITICAL: SUPABASE_URL not set');
    return null;
  }

  // Store the raw payload exactly as received - no transformation, no wrapping
  // If it's null, store null. If it's an object, store the object. If it's a string, store the string.
  // The database JSONB field will handle it.
  
  // Retry logic: try up to 3 times
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`🔵 Storage attempt ${attempt}/3`);
    try {
      const insertData = {
        payload: rawPayload, // Store raw, exactly as received
        created_at: new Date().toISOString()
      };
      
      console.log('🔵 Inserting data:', JSON.stringify(insertData, null, 2));
      
      const { data: storedPayload, error: storeError } = await supabaseStorage
        .from('webhook_inbounds')
        .insert(insertData)
        .select('id')
        .single();

      console.log('🔵 Supabase response - data:', storedPayload);
      console.log('🔵 Supabase response - error:', storeError);

      if (storeError) {
        lastError = storeError;
        console.error(`❌ Attempt ${attempt}/3: Error storing webhook payload:`, JSON.stringify(storeError, null, 2));
        console.error(`❌ Error details:`, {
          message: storeError.message,
          details: storeError.details,
          hint: storeError.hint,
          code: storeError.code
        });
        if (attempt < 3) {
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      } else {
        console.log('✅✅✅ Raw payload stored successfully in webhook_inbounds:', storedPayload?.id);
        return storedPayload?.id;
      }
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt}/3: Unexpected error storing webhook payload:`, error);
      console.error(`❌ Error stack:`, error.stack);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
    }
  }

  // If all retries failed, log critical error but don't throw
  console.error('❌❌❌ CRITICAL: Failed to store payload after 3 attempts');
  console.error('❌ Last error:', JSON.stringify(lastError, null, 2));
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

  // CRITICAL: Store RAW request body FIRST, no matter what
  // Store exactly what was received - no transformation, no wrapping
  // This happens BEFORE any processing or validation
  const rawBody = req.body; // Could be null, undefined, object, string, anything
  
  console.log('📨📨📨 INBOUND REQUEST RECEIVED');
  console.log('📨 Request method:', req.method);
  console.log('📨 Request URL:', req.url);
  console.log('📨 Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('📨 Raw body exists:', rawBody != null);
  console.log('📨 Raw body type:', typeof rawBody);
  console.log('📨 Raw body is array:', Array.isArray(rawBody));
  console.log('📨 Raw body content:', JSON.stringify(rawBody, null, 2));

  // Store the RAW body exactly as received - structure doesn't matter
  // THIS MUST HAPPEN BEFORE ANYTHING ELSE
  console.log('📨 CALLING storePayload NOW...');
  const storedPayloadId = await storePayload(rawBody);
  
  if (!storedPayloadId) {
    console.error('❌❌❌ CRITICAL WARNING: Raw payload storage FAILED after retries');
    console.error('❌ This should NEVER happen - storage must succeed!');
  } else {
    console.log('✅✅✅ Raw payload stored successfully with ID:', storedPayloadId);
    console.log('✅ Proceeding with processing logic...');
  }

  // Now extract payload for processing (if it exists)
  const payload = req.body || {};

  // IMPORTANT: Storage has already happened above. Now we process.
  // Even if processing fails, we've already stored the raw request.
  
  try {
    // Extract customer information from Kajabi payload
    // Structure: { id, event, payload: { member_email, member_name, offer_id, ... } }
    if (!payload.payload || !payload.payload.member_email) {
      console.error('⚠️ Missing member_email in payload - but request was already stored');
      return res.status(400).json({ 
        error: 'Missing member_email in payload',
        received: Object.keys(payload),
        stored: !!storedPayloadId,
        stored_id: storedPayloadId
      });
    }

    const memberEmail = payload.payload.member_email.toLowerCase().trim();
    const firstName = payload.payload.member_first_name || '';
    const lastName = payload.payload.member_last_name || '';
    const memberName = payload.payload.member_name || '';
    const customerName = memberName || `${firstName} ${lastName}`.trim() || memberEmail;

    // Get offer_id from payload
    const offerId = payload.payload.offer_id;
    
    console.log('Extracted offer_id:', offerId, 'Type:', typeof offerId);
    
    // Check if offer_id exists (null/undefined check, but allow 0 as valid)
    if (offerId == null || offerId === '') {
      console.error('⚠️ Missing offer_id in payload - but request was already stored');
      console.error('Payload structure:', {
        hasPayload: !!payload.payload,
        payloadKeys: payload.payload ? Object.keys(payload.payload) : [],
        offerId: offerId
      });
      return res.status(400).json({ 
        error: 'Missing offer_id in payload',
        received_offer_id: offerId,
        payload_structure: payload.payload ? Object.keys(payload.payload) : [],
        stored: !!storedPayloadId,
        stored_id: storedPayloadId
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
      console.error(`⚠️ Offer not found for kajabi_id: ${offerId} - but request was already stored`);
      return res.status(404).json({ 
        error: `Offer not found for kajabi_id: ${offerId}`,
        stored: !!storedPayloadId,
        stored_id: storedPayloadId
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

