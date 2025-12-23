import { createClient } from '@supabase/supabase-js';

// CRM app Supabase client (for offers table)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Academic app API URL
const ACADEMIC_APP_URL = 'https://academic.inglesahorita.com';

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

  try {
    const payload = req.body;
    
    console.log('Kajabi webhook received:', JSON.stringify(payload, null, 2));

    // Store the entire payload in webhook_inbounds table for monitoring
    try {
      await supabase
        .from('webhook_inbounds')
        .insert({
          payload: payload
        });
    } catch (logError) {
      console.error('Error storing webhook payload:', logError);
      // Continue processing even if logging fails
    }

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

