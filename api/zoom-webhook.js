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
    // Request scopes needed for phone recording downloads
    const scopes = 'phone:read:call_recording:admin phone:read:call_recording';
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}&scope=${encodeURIComponent(scopes)}`;
    
    const response = await fetch(tokenUrl, {
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
    console.log('Token scopes:', data.scope || 'Not specified in response');
    
    return data.access_token;
  } catch (error) {
    console.error('Error getting Zoom access token:', error);
    throw error;
  }
}

/**
 * Download Zoom recording from download URL
 * @param {string} downloadUrl - The Zoom recording download URL
 * @param {string} accessToken - The Zoom OAuth access token
 * @returns {Promise<Buffer>} Recording file buffer
 */
async function downloadZoomRecording(downloadUrl, accessToken) {
  try {
    console.log('Downloading recording from:', downloadUrl);
    
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download recording: ${response.status} ${errorText}`);
    }

    // Get the file as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`Recording downloaded successfully. Size: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error('Error downloading Zoom recording:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  // Zoom recordings webhook endpoint
  
  // Test endpoint: GET /api/zoom-webhook?test=true
  if (req.method === 'GET' && req.query.test === 'true') {
    try {
      const testDownloadUrl = 'https://zoom.us/v2/phone/recording/download/4387sv2-Tq61TEIiiwioRQ';
      const testAccessToken = 'eyJzdiI6IjAwMDAwMiIsImFsZyI6IkhTNTEyIiwidiI6IjIuMCIsImtpZCI6ImNiYTMwZmMwLWMwNjEtNGNiMC1iZTIzLTE4NGI2ZDU3YzA1NCJ9.eyJhdWQiOiJodHRwczovL29hdXRoLnpvb20udXMiLCJ1aWQiOiJ0LV9VRnpMaFNZeVNiQ3FiMjVFeFFRIiwidmVyIjoxMCwiYXVpZCI6ImM2ZmNhZWNhOWE2YzE5NTFlYjJiYTZiNjM1ZDMyYjNlN2E3N2ZkOTJlZWM3YzY2YzgxMzc2Mzc1YjZhMjQwYWMiLCJuYmYiOjE3Njg0ODg1MDgsImNvZGUiOiJhbjVlMGNWWlRSaWQtT20zUmROeklnTFRRTmdscloyRnAiLCJpc3MiOiJ6bTpjaWQ6dTg1U0ZIWHZURHVoRVBTSHZFRWRZQSIsImdubyI6MCwiZXhwIjoxNzY4NDkyMTA4LCJ0eXBlIjozLCJpYXQiOjE3Njg0ODg1MDgsImFpZCI6IjdmNTQxd1ZpU1VpLUdjN1dJelBKSEEifQ.qCCCTKncTiTHvMqS9zAMWHuNn1L3KveBynhiHq31LvZLyxchaQYY_NTnTGqVlIEz2gj0A3L6MiAl2Cf_4fRB9Q';
      
      console.log('Testing download with provided URL and token...');
      const recordingBuffer = await downloadZoomRecording(testDownloadUrl, testAccessToken);
      
      return res.status(200).json({ 
        success: true,
        message: 'Recording downloaded successfully',
        size: recordingBuffer.length,
        note: 'Recording buffer obtained. Add storage logic to save it.'
      });
    } catch (error) {
      console.error('Test download failed:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message
      });
    }
  }
  
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
    try {
      // According to Zoom docs: payload.object.recordings[0].download_url
      const downloadUrl = payload?.object?.recordings?.[0]?.download_url;
      
      console.log('Phone recording completed - Download URL:', downloadUrl);
      console.log('Download token:', download_token);

      if (!downloadUrl) {
        console.error('No download URL found in payload');
        return res.status(400).json({ 
          error: 'No download URL found',
          received: false
        });
      }

      // Get access token (use provided token or fetch new one)
      const accessToken = download_token || await getZoomAccessToken();
      console.log('Using access token:', accessToken ? 'Token provided' : 'Fetched new token');

      // Download the recording
      const recordingBuffer = await downloadZoomRecording(downloadUrl, accessToken);
      
      // TODO: Save recording to storage (Supabase, S3, etc.)
      // For now, just log that we got it
      console.log('Recording downloaded successfully. Buffer size:', recordingBuffer.length);

      return res.status(200).json({ 
        message: 'Recording completed event processed',
        received: true,
        downloaded: true,
        size: recordingBuffer.length
      });
    } catch (error) {
      console.error('Error processing recording:', error);
      return res.status(500).json({ 
        error: 'Failed to process recording',
        message: error.message,
        received: true
      });
    }
  }

  // Handle other webhook events
  console.log('Zoom webhook received:', { event, payload });

  return res.status(200).json({ 
    message: 'Webhook received',
    received: true
  });
}


