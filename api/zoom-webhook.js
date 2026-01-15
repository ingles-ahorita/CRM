import crypto from 'crypto';
import { createClient } from '@deepgram/sdk';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Supabase client setup
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
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
 * Transcribe audio using Deepgram SDK
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {string} filename - Optional filename (defaults to 'audio.mp3')
 * @returns {Promise<{transcript: string, rawResponse: object}>} Transcription text and raw response
 */
async function transcribeAudioWithDeepgram(audioBuffer, filename = 'audio.mp3') {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

  if (!deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable not set');
  }

  try {
    console.log('Sending audio to Deepgram API...');
    console.log('Audio buffer size:', audioBuffer.length, 'bytes');

    // STEP 1: Create a Deepgram client using the API key
    const deepgram = createClient(deepgramApiKey);

    // STEP 2: Call the transcribeFile method with the audio buffer and options
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      // Pass the audio buffer directly
      audioBuffer,
      // STEP 3: Configure Deepgram options for audio analysis
      {
        model: 'nova-3',
        language: 'es', // Hardcoded to Spanish
        smart_format: true,
        punctuate: true,
        diarize: true, // Set to true if you want speaker diarization
      }
    );

    if (error) {
      throw new Error(`Deepgram API error: ${error.message || JSON.stringify(error)}`);
    }

    // STEP 4: Extract transcription from results
    // Deepgram response structure: results.channels[0].alternatives[0].transcript
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    
    if (!transcript) {
      throw new Error('No transcription text in Deepgram response');
    }

    console.log('Transcription completed successfully');
    console.log('Transcription length:', transcript.length, 'characters');
    console.log('Transcription preview:', transcript.substring(0, 200) + '...');
    
    return {
      transcript,
      rawResponse: result
    };
  } catch (error) {
    console.error('Error transcribing audio with Deepgram:', error);
    throw error;
  }
}

/**
 * Find the most recent call from calls table based on book_date matching the phone number
 * @param {string} phoneNumber - The phone number to match
 * @returns {Promise<number|null>} Call ID or null if not found
 */
async function findMostRecentCallId(phoneNumber) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  if (!phoneNumber) {
    console.error('No phone number provided');
    return null;
  }

  try {
    // Normalize phone number for comparison (remove +, spaces, dashes, etc.)
    const normalizedPhone = phoneNumber.replace(/[\s+\-()]/g, '');
    
    console.log('Searching for most recent call with phone number:', phoneNumber, '(normalized:', normalizedPhone + ')');
    
    // Try exact match first
    let { data, error } = await supabase
      .from('calls')
      .select('id, phone')
      .eq('phone', phoneNumber)
      .order('book_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If exact match not found, try normalized phone number
    if (!data && normalizedPhone !== phoneNumber) {
      const { data: normalizedData, error: normalizedError } = await supabase
        .from('calls')
        .select('id, phone')
        .eq('phone', normalizedPhone)
        .order('book_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (normalizedError) {
        console.error('Error finding most recent call with normalized phone:', normalizedError);
      } else if (normalizedData) {
        console.log('Found call with normalized phone number:', normalizedData);
        return normalizedData.id || null;
      }
    }

    // If still not found, try partial match (phone contains the normalized number)
    if (!data) {
      const { data: partialData, error: partialError } = await supabase
        .from('calls')
        .select('id, phone')
        .ilike('phone', `%${normalizedPhone}%`)
        .order('book_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (partialError) {
        console.error('Error finding most recent call with partial phone match:', partialError);
      } else if (partialData) {
        console.log('Found call with partial phone match:', partialData);
        return partialData.id || null;
      }
    }

    if (error) {
      console.error('Error finding most recent call:', error);
      return null;
    }

    if (data) {
      console.log('Found matching call:', data);
      return data.id || null;
    }

    console.log('No call found matching phone number:', phoneNumber);
    return null;
  } catch (error) {
    console.error('Error finding most recent call:', error);
    return null;
  }
}

/**
 * Save transcription to setter_calls table
 * @param {number} callId - The call ID from calls table
 * @param {string} transcription - The transcription text
 * @param {object} rawResponse - The raw Deepgram response
 * @returns {Promise<boolean>} Success status
 */
async function saveTranscriptionToSetterCalls(callId, transcription, rawResponse) {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  if (!callId) {
    console.error('No call ID provided');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('setter_calls')
      .insert({
        call_id: callId,
        transcription: typeof rawResponse === 'object' ? JSON.stringify(rawResponse) : rawResponse // Store the raw Deepgram response as JSON string
      })
      .select();

    if (error) {
      console.error('Error saving transcription to setter_calls:', error);
      return false;
    }

    console.log('Transcription saved successfully to setter_calls:', data);
    return true;
  } catch (error) {
    console.error('Error saving transcription:', error);
    return false;
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
      const phoneNumber = recording?.callee_number || recording?.caller_number; // Use callee_number (number being called) as primary
      
      console.log('Phone recording completed event received');
      console.log('Recording ID:', recordingId);
      console.log('Call ID:', callId);
      console.log('Phone Number:', phoneNumber);
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

      // Transcribe the audio using Deepgram
      let transcriptionResult = null;
      let transcriptionText = null;
      let rawTranscriptionResponse = null;
      
      try {
        const recordingId = payload?.object?.recordings?.[0]?.id || 'recording';
        const filename = `${recordingId}.mp3`;
        transcriptionResult = await transcribeAudioWithDeepgram(recordingBuffer, filename);
        transcriptionText = transcriptionResult.transcript;
        rawTranscriptionResponse = transcriptionResult.rawResponse;
        console.log('Transcription completed:', transcriptionText);
      } catch (transcriptionError) {
        console.error('Failed to transcribe audio:', transcriptionError);
        // Continue even if transcription fails - we still want to process the recording
      }

      // Save transcription to setter_calls table
      if (transcriptionText && rawTranscriptionResponse) {
        try {
          if (!phoneNumber) {
            console.error('No phone number found in recording payload');
          } else {
            const mostRecentCallId = await findMostRecentCallId(phoneNumber);
            
            if (mostRecentCallId) {
              console.log('Found most recent call ID:', mostRecentCallId, 'for phone number:', phoneNumber);
              const saved = await saveTranscriptionToSetterCalls(
                mostRecentCallId,
                transcriptionText,
                rawTranscriptionResponse
              );
              
              if (saved) {
                console.log('Transcription saved successfully to setter_calls');
              } else {
                console.error('Failed to save transcription to setter_calls');
              }
            } else {
              console.error('Could not find most recent call ID for phone number:', phoneNumber);
            }
          }
        } catch (saveError) {
          console.error('Error saving transcription:', saveError);
        }
      }
      
      return res.status(200).json({ 
        message: 'Recording completed event processed',
        received: true,
        downloaded: true,
        size: recordingBuffer.length,
        transcribed: transcriptionText !== null,
        transcription: transcriptionText || null
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


