import { useEffect, useState } from 'react';
import { getIclosedEventCallId, isIclosedLead } from '../lib/iclosedBooking';
import { supabase } from '../lib/supabaseClient';

const statusCache = new Map();

function cacheKey(lead) {
  const eventCallId = getIclosedEventCallId(lead?.calendly_id);
  return eventCallId ? `${lead?.id}:${eventCallId}` : null;
}

/**
 * Check whether an iClosed event call is cancelled (fail-open on API errors).
 */
export function useIclosedEventCallStatus({ lead, enabled = true }) {
  const [state, setState] = useState(() => {
    if (lead?.cancelled === true) {
      return { loading: false, canceled: true, found: true, error: null };
    }
    return { loading: false, canceled: false, found: false, error: null };
  });

  useEffect(() => {
    if (!enabled || !isIclosedLead(lead)) {
      setState({ loading: false, canceled: false, found: false, error: null });
      return undefined;
    }

    if (lead?.cancelled === true) {
      setState({ loading: false, canceled: true, found: true, error: null });
      return undefined;
    }

    const eventCallId = getIclosedEventCallId(lead?.calendly_id);
    if (!eventCallId) {
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
          `/api/iclosed?resource=event-call-status&eventCallId=${encodeURIComponent(eventCallId)}`,
        );
        if (cancelled) return;

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            loading: false,
            canceled: false,
            found: false,
            error: data?.error || 'Could not verify iClosed call status',
          });
          return;
        }

        const next = {
          canceled: data?.canceled === true,
          found: data?.found === true,
        };
        if (key) statusCache.set(key, next);

        // Fallback sync: the iClosed webhook normally persists cancellations
        // (cancelled=true, confirmed=false). If it was missed, mirror that here
        // when the live API reports the event cancelled.
        if (next.canceled && lead?.cancelled !== true && lead?.id) {
          supabase
            .from('calls')
            .update({ cancelled: true, confirmed: false })
            .eq('id', lead.id)
            .then(({ error }) => {
              if (error) console.warn('[useIclosedEventCallStatus] cancelled sync failed:', error.message);
            });
        }

        setState({ loading: false, ...next, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          canceled: false,
          found: false,
          error: err?.message || 'Could not verify iClosed call status',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, lead?.id, lead?.calendly_id, lead?.reschedule_link, lead?.cancelled]);

  return state;
}
