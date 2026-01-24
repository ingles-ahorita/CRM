import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Supabase client for database operations
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Lazy initialization - only create client when needed
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY environment variable is not set');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')));
    throw new Error('OPENAI_API_KEY environment variable is not set. Please add it to .env.local file.');
  }
  return new OpenAI({
    apiKey: apiKey,
  });
}

// Fetch system prompt from Supabase
async function getSystemPrompt() {

   const defaultPrompt = `I want you to display the current state of the conversation like a list with checkboxes for each item.
- Masterclass sent
- Watched masterclass
- Booking sent
- Human handled`;

  if (!supabase) {
    // Fallback to default if Supabase is not configured
    return defaultPrompt;
  }

  try {
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('prompt')
      .eq('id', 1)
      .single();

    if (error || !data) {
      // Return default if not found
      return defaultPrompt;
    }

    return data.prompt;
  } catch (error) {
    console.error('Error fetching system prompt:', error);
    // Return default on error
    return defaultPrompt;
  }
}

export default async function handler(req, res) {
  try {
    console.log('AI Setter webhook received!');
    console.log('Method:', req.method);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, state, previous_response_id } = req.body;

    // Fetch system prompt from Supabase
    const systemPrompt = await getSystemPrompt();

    console.log('System prompt:', systemPrompt);

    // TODO: Add webhook processing logic here
    const openai = getOpenAIClient();
    const completion = await openai.responses.parse({
      model: "gpt-4o-mini",
      ...(previous_response_id ? { previous_response_id } : {}),
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        },
        {
            role: "developer",
            content: `Current state: ${JSON.stringify(state, null, 2)}`  // State as separate context
          }
      ],
      text: {
        format: {
        name: "setter_response",
          type: "json_schema",
          schema: {
                "type": "object",
                "properties": {
                    "reply": {
                        "type": "string",
                        "description": "la respuesta de la IA"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["SEND_VIDEO", "SEND_BOOKING", "HANDOFF_HUMAN", "CONTINUE_CONVERSATION"],
                        "description": "la acción a realizar"
                    },
                    detected_state: {
                        "type": "object",
                        "description": "los estados detectados",
                        "properties": {
                            "video_watched": {
                                "type": "boolean",
                                "description": "detectar si el lead ya vio el video"
                            },
                            "call_booked": {
                                "type": "boolean",
                                "description": "detectar si el lead ya agendo una llamada con nosotros"
                            }
                        },
                        "required": ["video_watched", "call_booked"],
                        "additionalProperties": false
                    }
                },
                "required": ["reply", "action", "detected_state"],
                "additionalProperties": false
            }
        }
      }   
    });

    // Responses API returns parsed output directly
    const parsedResponse = completion.output_parsed;

    return res.status(200).json({ 
      success: true,
      response: parsedResponse,
      response_id: completion.id,
      system_prompt: systemPrompt
    });

  } catch (error) {
    console.error('Error processing AI Setter webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
