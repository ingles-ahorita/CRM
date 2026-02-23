import { createClient } from '@supabase/supabase-js';

// In Vercel serverless functions, use the raw env var names
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);


export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { action } = req.body;
        if (action === 'start') {
            return await handleStartShift(res, req);
        } else if (action === 'end') {
            return await handleEndShift(res, req);
        }
    }
    return res.status(405).json({ error: 'Method not allowed' });
}



const handleStartShift = async (res, req) => {
    try {
      // Check if there's already an open shift
      const { data: existingShift } = await supabase
        .from('ruben')
        .select('*')
        .eq('status', 'open')
        .maybeSingle();

      if (existingShift) {
        return res.status(400).json({ error: 'You already have an active shift. Please end it before starting a new one.' });
      }

      const { data, error } = await supabase
        .from('ruben')
        .insert({
          start_time: new Date().toISOString(),
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, message: 'Shift started successfully!', shift: data });
    } catch (err) {
      console.error('Error starting shift:', err);
      return res.status(500).json({ success: false, error: 'Failed to start shift. Please try again.' });
    }
  };

  const handleEndShift = async (res, req) => {
    try {
    const { data: currentShift, error: currentShiftError } = await supabase
        .from('ruben')
        .select('*')
        .eq('status', 'open')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentShiftError) throw currentShiftError;
      if (!currentShift) return res.status(400).json({ success: false, error: 'No active shift found.' });

      const { data, error } = await supabase
        .from('ruben')
        .update({
          end_time: new Date().toISOString(),
          status: 'closed'
        })
        .eq('id', currentShift.id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Shift ended successfully!', shift: data });
    } catch (err) {
      console.error('Error ending shift:', err);
      return res.status(500).json({ success: false, error: 'Failed to end shift. Please try again.' });
    }
  };