import { useEffect, useState } from 'react';
import { getGoogleEventId, isGoogleLead } from '../lib/iclosedBooking';
import { supabase } from '../lib/supabaseClient';

const statusCache = new Map();

function cacheKey(lead) {
  const eventId = getGoogleEventId(lead?.calendly_id);
  return eventId ? `${lead?.id}:${eventId}` : null;
}

/**
 * Check whether a recovered (Google Calendar) event is cancelled (fail-open on API errors).
 * Mirrors useIclosedEventCallStatus. When the event is cancelled but the CRM row is not yet
 * flagged, it best-effort syncs calls.cancelled = true.
 */
export function useGoogleEventStatus({ lead, enabled = true }) {
  const [state, setState] = useState(() => {
    if (lead?.cancelled === true) {
      return { loading: false, canceled: true, found: true, error: null };
    }
    return { loading: false, canceled: false, found: false, error: null };
  });

  useEffect(() => {
    if (!enabled || !isGoogleLead(lead)) {
      setState({ loading: false, canceled: false, found: false, error: null });
      return undefined;
    }

    if (lead?.cancelled === true) {
      setState({ loading: false, canceled: true, found: true, error: null });
      return undefined;
    }

    const eventId = getGoogleEventId(lead?.calendly_id);
    if (!eventId) {
      setState({ loading: false, canceled: false, found: false, error: null });
      return undefined;
    }

    const key = cacheKey(lead);
    if (key && statusCache.has(key)) {
      setState({ loading: false, ...statusCache.get(key), error: null });
      return undefined;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const response = await fetch(
          `/api/google-event?callId=${encodeURIComponent(lead.id)}`,
        );
        if (cancelled) return;

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            loading: false,
            canceled: false,
            found: false,
            error: data?.error || 'Could not verify Google call status',
          });
          return;
        }

        const next = {
          canceled: data?.canceled === true,
          found: data?.found === true,
        };
        if (key) statusCache.set(key, next);

        // Keep the CRM in sync: if Google says cancelled but our row isn't flagged,
        // mark it cancelled and force Confirmed → NO.
        if (next.canceled && lead?.cancelled !== true && lead?.id) {
          supabase
            .from('calls')
            .update({ cancelled: true, confirmed: false })
            .eq('id', lead.id)
            .then(({ error }) => {
              if (error) console.warn('[useGoogleEventStatus] cancelled sync failed:', error.message);
            });
        }

        setState({ loading: false, ...next, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          canceled: false,
          found: false,
          error: err?.message || 'Could not verify Google call status',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, lead?.id, lead?.calendly_id, lead?.reschedule_link, lead?.cancelled]);

  return state;
}