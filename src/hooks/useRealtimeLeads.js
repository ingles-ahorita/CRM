import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealtimeLeads(dataState, setDataState, activeTab = 'all', setterId = null, closerId = null) {
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
  }, [activeTab, setterId, closerId]);

  const handleInsert = (newLead) => {
    // Check if the new lead should be included based on current filters
    if (shouldIncludeLead(newLead)) {
      setDataState(prevState => ({
        ...prevState,
        leads: [newLead, ...prevState.leads]
      }));
    }
  };

  const handleUpdate = (oldLead, newLead) => {
    setDataState(prevState => {
      const updatedLeads = prevState.leads.map(lead => 
        lead.id === newLead.id ? { ...lead, ...newLead } : lead
      );

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
    // Apply the same filtering logic as your fetchAll function
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Filter by user type
    if (setterId && lead.setter_id !== setterId) return false;
    if (closerId && lead.closer_id !== closerId) return false;

    // Filter by date based on active tab
    if (activeTab === 'today') {
      return lead.book_date >= today.toISOString() && lead.book_date < tomorrow.toISOString();
    } else if (activeTab === 'yesterday') {
      return lead.book_date >= yesterday.toISOString() && lead.book_date < today.toISOString();
    } else if (activeTab === 'tomorrow') {
      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
      return lead.book_date >= tomorrow.toISOString() && lead.book_date < dayAfterTomorrow.toISOString();
    }
    
    // For 'all' tab, include all leads
    return true;
  };

  return null; // This hook doesn't return anything, it just manages subscriptions
}
