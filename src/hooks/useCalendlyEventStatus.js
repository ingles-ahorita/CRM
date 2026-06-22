import { useEffect, useState } from 'react';
import { getCalendlyEventUri, isCalendlyLead } from '../lib/iclosedBooking';
import { supabase } from '../lib/supabaseClient';

const statusCache = new Map();

function cacheKey(lead) {
  const eventUri = getCalendlyEventUri(lead?.calendly_id);
  return eventUri ? `${lead?.id}:${eventUri}` : null;
}

/**
 * Check whether a Calendly scheduled event is cancelled (fail-open on API errors).
 * Mirrors useGoogleEventStatus / useIclosedEventCallStatus. When the event is
 * cancelled but the CRM row is not yet flagged, it best-effort syncs
 * calls.cancelled = true and calls.confirmed = false.
 */
export function useCalendlyEventStatus({ lead, enabled = true }) {
  const [state, setState] = useState(() => {
    if (lead?.cancelled === true) {
      return { loading: false, canceled: true, found: true, error: null };
    }
    return { loading: false, canceled: false, found: false, error: null };
  });

  useEffect(() => {
    if (!enabled || !isCalendlyLead(lead)) {
      setState({ loading: false, canceled: false, found: false, error: null });
      return undefined;
    }

    if (lead?.cancelled === true) {
      setState({ loading: false, canceled: true, found: true, error: null });
      return undefined;
    }

    const eventUri = getCalendlyEventUri(lead?.calendly_id);
    if (!eventUri) {
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
          `/api/cancel-calendly?eventUri=${encodeURIComponent(eventUri)}`,
        );
        if (cancelled) return;

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            loading: false,
            canceled: false,
            found: false,
            error: data?.error || 'Could not verify Calendly call status',
          });
          return;
        }

        const next = {
          canceled: data?.canceled === true,
          found: data?.found === true,
        };
        if (key) statusCache.set(key, next);

        // Keep the CRM in sync: if Calendly says cancelled but our row isn't
        // flagged, mark it cancelled and force Confirmed → NO.
        if (next.canceled && lead?.cancelled !== true && lead?.id) {
          supabase
            .from('calls')
            .update({ cancelled: true, confirmed: false })
            .eq('id', lead.id)
            .then(({ error }) => {
              if (error) console.warn('[useCalendlyEventStatus] cancelled sync failed:', error.message);
            });
        }

        setState({ loading: false, ...next, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          canceled: false,
          found: false,
          error: err?.message || 'Could not verify Calendly call status',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, lead?.id, lead?.calendly_id, lead?.reschedule_link, lead?.cancelled]);

  return state;
}