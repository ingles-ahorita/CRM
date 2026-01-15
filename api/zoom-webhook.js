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
 * Download Zoom recording from download URL with retry logic
 * @param {string} downloadUrl - The Zoom recording download URL
 * @param {string} accessToken - The Zoom OAuth access token
 * @param {number} maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} initialDelay - Initial delay in milliseconds (default: 2000)
 * @returns {Promise<Buffer>} Recording file buffer
 */
async function downloadZoomRecording(downloadUrl, accessToken, maxRetries = 5, initialDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Downloading recording (attempt ${attempt}/${maxRetries}) from:`, downloadUrl);
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': '*/*' // Accept any content type for audio files
        }
      });

      if (response.status === 404) {
        // Recording not ready yet, wait and retry
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Recording not available yet (404). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          lastError = new Error(`Recording not available (404). Attempt ${attempt}/${maxRetries}`);
          continue;
        } else {
          throw new Error(`Recording not available after ${maxRetries} attempts. The file may not exist or is still being processed.`);
        }
      }

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
      lastError = error;
      
      // If it's a 404 and we have retries left, continue the loop
      if (error.message.includes('404') && attempt < maxRetries) {
        continue;
      }
      
      // For other errors or last attempt, throw immediately
      if (attempt === maxRetries || !error.message.includes('404')) {
        console.error(`Error downloading Zoom recording (attempt ${attempt}/${maxRetries}):`, error);
        throw error;
      }
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Failed to download recording after all retries');
}

/**
 * Transcribe audio using OpenAI Whisper API
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {string} filename - Optional filename (defaults to 'audio.mp3')
 * @returns {Promise<string>} Transcription text
 */
async function transcribeAudioWithWhisper(audioBuffer, filename = 'audio.mp3') {
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  try {
    console.log('Sending audio to OpenAI Whisper API...');
    console.log('Audio buffer size:', audioBuffer.length, 'bytes');

    // Create FormData for multipart/form-data request
    // Using global FormData (available in Node.js 18+ and Vercel)
    const formData = new FormData();
    
    // Create a Blob from the buffer
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'es'); // Hardcoded to Spanish
    
    // formData.append('prompt', ''); // Optional: provide context/prompt
    // formData.append('response_format', 'json'); // Default is json, can also use 'text', 'srt', 'verbose_json', 'vtt'

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`
        // Don't set Content-Type header - let fetch set it with boundary for multipart/form-data
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.text) {
      throw new Error('No transcription text in OpenAI response');
    }

    console.log('Transcription completed successfully');
    console.log('Transcription length:', data.text.length, 'characters');
    console.log('Transcription preview:', data.text.substring(0, 200) + '...');
    
    return data.text;
  } catch (error) {
    console.error('Error transcribing audio with Whisper:', error);
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
    try {
      // According to Zoom docs: payload.object.recordings[0].download_url
      const recording = payload?.object?.recordings?.[0];
      const downloadUrl = recording?.download_url;
      const recordingId = recording?.id;
      const callId = recording?.call_id;
      
      console.log('Phone recording completed event received');
      console.log('Recording ID:', recordingId);
      console.log('Call ID:', callId);
      console.log('Download URL:', downloadUrl);
      console.log('Full recording object:', JSON.stringify(recording, null, 2));

      if (!downloadUrl) {
        console.error('No download URL found in payload');
        return res.status(400).json({ 
          error: 'No download URL found',
          received: false
        });
      }

      // Wait a bit before attempting download (recording might need processing time)
      console.log('Waiting 3 seconds before attempting download...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get access token (use provided token or fetch new one)
      const accessToken = download_token || await getZoomAccessToken();
      console.log('Using access token:', download_token ? 'Token provided' : 'Fetched new token');

      // Download the recording with retry logic
      const recordingBuffer = await downloadZoomRecording(downloadUrl, accessToken);
      console.log('Recording downloaded successfully. Buffer size:', recordingBuffer.length);

      // Transcribe the audio using OpenAI Whisper
      let transcription = null;
      try {
        const recordingId = payload?.object?.recordings?.[0]?.id || 'recording';
        const filename = `${recordingId}.mp3`;
        transcription = await transcribeAudioWithWhisper(recordingBuffer, filename);
        console.log('Transcription completed:', transcription);
      } catch (transcriptionError) {
        console.error('Failed to transcribe audio:', transcriptionError);
        // Continue even if transcription fails - we still want to process the recording
      }

      // TODO: Save recording to storage (Supabase, S3, etc.)
      // TODO: Save transcription to database
      
      return res.status(200).json({ 
        message: 'Recording completed event processed',
        received: true,
        downloaded: true,
        size: recordingBuffer.length,
        transcribed: transcription !== null,
        transcription: transcription || null
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


