import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getDayBoundsLocal } from '../utils/dateHelpers';
import { subDays, addDays } from 'date-fns';

export function useRealtimeLeads(dataState, setDataState, activeTab = 'all', setterId = null, closerId = null, dateFilterField = 'book_date') {
  const subscriptionRef = useRef(null);

  useEffect(() => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    // Create new subscription
    const subscription = supabase
      .channel('calls_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'calls'
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          
          // Handle different event types
          if (payload.eventType === 'INSERT') {
            handleInsert(payload.new);
          } else if (payload.eventType === 'UPDATE') {
            handleUpdate(payload.old, payload.new);
          } else if (payload.eventType === 'DELETE') {
            handleDelete(payload.old);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = subscription;

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [activeTab, setterId, closerId, dateFilterField]);

  const handleInsert = async (newLead) => {
    // Check if the new lead should be included based on current filters
    if (shouldIncludeLead(newLead)) {
      // Fetch the full lead with relations since real-time insert doesn't include them
      try {
        const { data: fullLead, error } = await supabase
          .from('calls')
          .select(`
            *,
            closers (id, name, mc_api_key),
            setters (id, name),
            leads (phone, name, source, medium, mc_id)
          `)
          .eq('id', newLead.id)
          .single();
        
        if (error || !fullLead) {
          console.error('Error fetching full lead data for insert:', error);
          // Fallback: add the lead without relations (better than nothing)
          setDataState(prevState => ({
            ...prevState,
            leads: [newLead, ...prevState.leads]
          }));
          return;
        }
        
        // Add the lead with full relations
        setDataState(prevState => ({
          ...prevState,
          leads: [fullLead, ...prevState.leads]
        }));
      } catch (fetchError) {
        console.error('Error in handleInsert:', fetchError);
        // Fallback: add the lead without relations
        setDataState(prevState => ({
          ...prevState,
          leads: [newLead, ...prevState.leads]
        }));
      }
    }
  };

  const handleUpdate = (oldLead, newLead) => {
    setDataState(prevState => {
      const updatedLeads = prevState.leads.map(lead => {
        if (lead.id === newLead.id) {
          // Preserve relations - real-time updates from 'calls' table don't include relations
          return { 
            ...lead, 
            ...newLead,
            // Keep existing relations (they don't change often)
            closers: lead.closers,
            setters: lead.setters,
            leads: lead.leads
          };
        }
        return lead;
      });

      // Check if the lead should still be included after update
      const shouldInclude = shouldIncludeLead(newLead);
      const wasIncluded = prevState.leads.some(lead => lead.id === newLead.id);

      if (shouldInclude && !wasIncluded) {
        // Lead should be added
        return {
          ...prevState,
          leads: [newLead, ...updatedLeads.filter(lead => lead.id !== newLead.id)]
        };
      } else if (!shouldInclude && wasIncluded) {
        // Lead should be removed
        return {
          ...prevState,
          leads: updatedLeads.filter(lead => lead.id !== newLead.id)
        };
      } else {
        // Lead should be updated
        return {
          ...prevState,
          leads: updatedLeads
        };
      }
    });
  };

  const handleDelete = (deletedLead) => {
    setDataState(prevState => ({
      ...prevState,
      leads: prevState.leads.filter(lead => lead.id !== deletedLead.id)
    }));
  };

  const shouldIncludeLead = (lead) => {
    // Apply the same filtering logic as fetchAll - use dateFilterField (call_date or book_date)
    // and local timezone day bounds for tab filtering
    const dateValue = lead[dateFilterField];
    if (!dateValue) return false;

    const now = new Date();
    const { dayStart: todayStart, dayEnd: todayEnd } = getDayBoundsLocal(now);
    const { dayStart: yesterdayStart, dayEnd: yesterdayEnd } = getDayBoundsLocal(subDays(now, 1));
    const { dayStart: tomorrowStart, dayEnd: tomorrowEnd } = getDayBoundsLocal(addDays(now, 1));
    const { dayStart: dayAfterTomorrowStart, dayEnd: dayAfterTomorrowEnd } = getDayBoundsLocal(addDays(now, 2));

    // Filter by user type
    if (setterId && lead.setter_id !== setterId) return false;
    if (closerId && lead.closer_id !== closerId) return false;

    // Filter by date based on active tab (use same local timezone boundaries as fetchAll)
    if (activeTab === 'today') {
      return dateValue >= todayStart.toISOString() && dateValue <= todayEnd.toISOString();
    } else if (activeTab === 'yesterday') {
      return dateValue >= yesterdayStart.toISOString() && dateValue <= yesterdayEnd.toISOString();
    } else if (activeTab === 'tomorrow') {
      return dateValue >= tomorrowStart.toISOString() && dateValue <= tomorrowEnd.toISOString();
    } else if (activeTab === 'tomorrow + 1') {
      return dateValue >= dayAfterTomorrowStart.toISOString() && dateValue <= dayAfterTomorrowEnd.toISOString();
    }

    // For 'all' tab, include all leads
    return true;
  };

  return null; // This hook doesn't return anything, it just manages subscriptions
}
