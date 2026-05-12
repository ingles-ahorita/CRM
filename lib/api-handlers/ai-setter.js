import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, state, history } = req.body || {};
  
  if (!message) {
    return res.status(400).json({ error: 'Missing required field: message' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not set' });
  }

  const openai = new OpenAI({ apiKey });

  try {
    // 1. Fetch system prompt from DB
    const { data: promptData, error: promptError } = await supabase
      .from('ai_prompts')
      .select('prompt')
      .eq('id', 1)
      .single();

    if (promptError) throw new Error(`Failed to fetch prompt: ${promptError.message}`);

    // 2. Prepare conversation
    const messages = [
      { 
        role: 'system', 
        content: promptData.prompt + "\n\nIMPORTANT: You must respond in JSON format with 'reply', 'action', and 'updated_context' keys." 
      },
      ...(history || []),
      { 
        role: 'user', 
        content: JSON.stringify({
          message,
          state: state || {},
          context: history ? 'See history above' : 'No previous context'
        })
      }
    ];

    // 3. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' }
    });

    const responseContent = JSON.parse(completion.choices[0].message.content);

    // 4. Return response
    return res.status(200).json({
      success: true,
      response: responseContent
    });

  } catch (error) {
    console.error('AI Setter Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
