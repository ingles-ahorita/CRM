// API endpoint to cancel a Calendly event
import { createClient } from '@supabase/supabase-js';

const CALENDLY_PAT = process.env.CALENDLY_PAT;
const BASE_URL = 'https://api.calendly.com';

/** Extract the Calendly scheduled-event UUID from an event URI. */
function extractEventUuid(eventUri) {
  // Format: https://api.calendly.com/scheduled_events/{event_uuid}
  const match = String(eventUri || '').match(/\/scheduled_events\/([^/]+)/);
  return match ? match[1] : null;
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // GET → read-only status check (mirrors /api/google-event GET). Used by the
  // useCalendlyEventStatus hook to lock the Confirmed dropdown when an event is
  // cancelled. Fail-open: any error other than "not found" reports not cancelled.
  if (req.method === 'GET') {
    const eventUri = String(req.query?.eventUri || '').trim();
    if (!eventUri) {
      return res.status(400).json({ error: 'Missing required field: eventUri' });
    }
    const eventUuid = extractEventUuid(eventUri);
    if (!eventUuid) {
      return res.status(400).json({ error: 'Invalid event URI format' });
    }

    try {
      const response = await fetch(`${BASE_URL}/scheduled_events/${eventUuid}`, {
        headers: { Authorization: `Bearer ${CALENDLY_PAT}` },
      });

      // 404/410 → event no longer exists → treat as cancelled.
      if (response.status === 404 || response.status === 410) {
        return res.status(200).json({ found: false, canceled: true });
      }
      if (!response.ok) {
        // Fail-open on auth/rate-limit/server errors so the dropdown stays usable.
        return res.status(200).json({ found: false, canceled: false });
      }

      const data = await response.json().catch(() => ({}));
      const status = data?.resource?.status;
      return res.status(200).json({ found: true, canceled: status === 'canceled' });
    } catch (error) {
      console.error('Error checking Calendly event status:', error);
      return res.status(200).json({ found: false, canceled: false });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method not allowed ${req.method}` + 'full request: ' + JSON.stringify(req) });
  }

  const { eventUri } = req.body;

  if (!eventUri) {
    return res.status(400).json({ error: 'Missing required field: eventUri' });
  }

  try {
    const eventUuid = extractEventUuid(eventUri);
    if (!eventUuid) {
      return res.status(400).json({ error: 'Invalid event URI format' });
    }

    // Cancel the event directly
    const response = await fetch(`${BASE_URL}/scheduled_events/${eventUuid}/cancellation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CALENDLY_PAT}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      if (error.includes('Event is already canceled')) {
        await markCallCancelled(eventUri);
        return res.status(200).json({ success: true, data: { message: 'Event is already canceled' } });
      }
      throw new Error(`Calendly API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    await markCallCancelled(eventUri);
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Error canceling Calendly event:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function markCallCancelled(eventUri) {
  if (!eventUri) return;
  try {
    const { data, error } = await supabase
      .from('calls')
      .update({ cancelled: true, confirmed: false })
      .eq('calendly_id', eventUri)
      .eq('cancelled', false)
      .select('id');
    if (error) {
      console.error('[cancel-calendly] Failed to update calls:', error.message);
    } else {
      console.log(`[cancel-calendly] set cancelled=true on ${data?.length ?? 0} call(s) for ${eventUri}`);
    }
  } catch (err) {
    console.error('[cancel-calendly] Unexpected error updating calls:', err.message);
  }
}
