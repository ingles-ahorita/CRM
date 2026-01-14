import crypto from 'crypto';

/**
 * Get Zoom OAuth access token using client credentials
 * @returns {Promise<string>} Access token
 */
async function getZoomAccessToken() {
  const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
    throw new Error('Zoom credentials not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET');
  }

  // Create Basic Auth header (base64 encode client_id:client_secret)
  const credentials = Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64');

  try {
    const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zoom token request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('No access token in Zoom response');
    }

    console.log('Zoom access token obtained successfully');
    return data.access_token;
  } catch (error) {
    console.error('Error getting Zoom access token:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  // Zoom recordings webhook endpoint
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event, payload, download_token } = req.body;
  console.log('req.body', req.body);

  // Handle Zoom webhook validation
  if (event === 'endpoint.url_validation') {
    const plainToken = payload?.plainToken;
    
    if (!plainToken) {
      return res.status(400).json({ error: 'Missing plainToken' });
    }

    // Get Zoom webhook secret token from environment variable
    const zoomSecretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    
    if (!zoomSecretToken) {
      console.error('ZOOM_WEBHOOK_SECRET_TOKEN environment variable not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Encrypt the plainToken using HMAC-SHA256
    const encryptedToken = crypto
      .createHmac('sha256', zoomSecretToken)
      .update(plainToken)
      .digest('hex');

    // Return the encrypted token for validation
    return res.status(200).json({
      plainToken: encryptedToken,
      encryptedToken: encryptedToken
    });
  }

  // Handle phone.recording_completed event
  if (event === 'phone.recording_completed') {
    const accessToken = await getZoomAccessToken();
    console.log('Access token:', accessToken);
    // According to Zoom docs: payload.object.recordings[0].download_url
    const downloadUrl = payload?.object?.recordings?.[0]?.download_url;
    
    console.log('Phone recording completed - Download URL:', downloadUrl);
    console.log('Download token:', download_token);


    return res.status(200).json({ 
      message: 'Recording completed event processed',
      received: true
    });
  }

  // Handle other webhook events
  console.log('Zoom webhook received:', { event, payload });

  return res.status(200).json({ 
    message: 'Webhook received',
    received: true
  });
}


