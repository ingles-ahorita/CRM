import { supabase } from '../lib/supabaseClient';
import { runAnalysis } from '../pages/reactionTime'; 






export async function fetchAll(searchTerm, activeTab = 'all' ,
   sortField = 'book_date', order = 'desc', 
   setDataState,
    closerId, setterId, 
    filters, leadId, startDate, endDate, setterFilter, closerFilter)  {



  const updateDataState = (updates) => {
  setDataState(prev => ({ ...prev, ...updates }));
};

updateDataState({ loading: true });

if (filters?.purchased) {
  sortField = 'purchased_at';
}
  
  // Fetch leads
  // Use inner join for follow ups tab to ensure we get calls with outcome_log entries
  // Use regular join for others
  // Note: A call can only have ONE outcome_log entry, so it's either 'follow_up' OR 'lock_in'
  const outcomeLogSelect = activeTab === 'follow ups' 
    ? `outcome_log!inner!call_id (id, outcome)`
    : `outcome_log!call_id (id, outcome)`;

let query = supabase
  .from('calls')
  .select(`
    *,
    closers (id, name, mc_api_key),
    setters (id, name),
    leads (phone, source, medium, mc_id),
    ${outcomeLogSelect}
  `)
  .order(sortField, { ascending: order === 'asc', nullsFirst: false });



  // Filter by date based on active tab
  if (activeTab === 'follow ups') {
    // For follow ups tab, filter at DB level based on lockIn filter:
    // - If lockIn filter is active: show calls with 'lock_in' outcome
    // - Otherwise: show calls with 'follow_up' outcome
    // We filter in JavaScript below to handle edge cases, but DB filter improves performance
    if (filters?.lockIn) {
      query = query.eq('outcome_log.outcome', 'lock_in');
    } else {
      query = query.eq('outcome_log.outcome', 'follow_up');
    }
    
    // Apply date range filtering if provided
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query = query.gte(sortField, start.toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte(sortField, end.toISOString());
    }
  } else if (activeTab !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const dayAfterTomorrowPlusOne = new Date(dayAfterTomorrow);
    dayAfterTomorrowPlusOne.setDate(dayAfterTomorrowPlusOne.getDate() + 1);

    if (activeTab === 'today') {
      query = query
        .gte(sortField, today.toISOString())
        .lt(sortField, tomorrow.toISOString());
        updateDataState({ currentDate: today.toLocaleDateString('en-CA')});
    } else if (activeTab === 'yesterday') {
      console.log('this is yesterday', yesterday);
      query = query
        .gte(sortField, yesterday.toISOString())
        .lt(sortField, today.toISOString());
        updateDataState({ currentDate: yesterday.toLocaleDateString('en-CA')});
    } else if (activeTab === 'tomorrow') {
      query = query
        .gte(sortField, tomorrow.toISOString())
        .lt(sortField, dayAfterTomorrow.toISOString());
        updateDataState({ currentDate: tomorrow.toLocaleDateString('en-CA')});
    } else if (activeTab === 'tomorrow + 1') {
      query = query
        .gte(sortField, dayAfterTomorrow.toISOString())
        .lt(sortField, dayAfterTomorrowPlusOne.toISOString());
        updateDataState({ currentDate: dayAfterTomorrow.toLocaleDateString('en-CA')});
    }
  } else {
    // When viewing 'all', optionally filter by provided date range
    // Use the chosen sortField (book_date or call_date) as the date column
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query = query.gte(sortField, start.toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte(sortField, end.toISOString());
    }
  }

  if(leadId){
    query = query.eq('lead_id', leadId);
    console.log("Filtering by lead: ", leadId);

  }

    // Filter by email if provided
if (searchTerm) {
  const term = searchTerm.trim();
  query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
  console.log("Searching by term:", term);
  
  if (closerId) {
    query = query.eq('closer_id', closerId);
    console.log("Also filtering by closer_id:", closerId);
  }
  
  if (setterId) {
    query = query.eq('setter_id', setterId);
    console.log("Also filtering by setter_id:", setterId);
  }
} else if(closerId){
      query = query.eq('closer_id', closerId);
      console.log("Filtering by closer ID:", closerId);
    } else if(setterId){
      query = query.eq('setter_id', setterId);
      console.log("Filtering by setter ID:", setterId);
    }

    if(filters){
      applyStatusFilters(query, filters)
    }

    // Apply setter and closer filters for all tabs (not just 'all')
    if (setterFilter) {
      query = query.eq('setter_id', setterFilter);
      console.log("Filtering by setter_id:", setterFilter);
    }
    if (closerFilter) {
      query = query.eq('closer_id', closerFilter);
      console.log("Filtering by closer_id:", closerFilter);
    }

  // Only apply limit if no email filter and showing 'all'
  if (!searchTerm && activeTab === 'all') {
    query = query.limit(100);
  }

  // For follow ups, filter results in JavaScript if relationship filter doesn't work
  // This ensures we only show calls with outcome = 'follow_up'
  let shouldFilterFollowUps = activeTab === 'follow ups';
  
  console.log('Fetching leads:', {
    activeTab,
    lockInFilter: filters?.lockIn,
    startDate,
    endDate,
    sortField,
    order
  });
  
  const { data: leadsData, error: leadsError } = await query;

  if (leadsError) {
    console.error('Error fetching leads:', leadsError);
    updateDataState({ leads: []})
  } else {
    const counts = {
      booked: leadsData?.length || 0,
    confirmed: leadsData?.filter(lead => lead.cancelled ? false : lead.confirmed).length || 0,
    cancelled: leadsData?.filter(lead => lead.confirmed === false || lead.cancelled === true ).length || 0,
        noPickup: leadsData?.filter(lead => lead.picked_up === false).length || 0,
    noShow: leadsData?.filter(lead => lead.showed_up).length || 0

  };



  let leadsWithCallTime = leadsData;

  // Filter for follow ups if needed (in case relationship filter didn't work)
  // Note: A call can only have ONE outcome_log entry, so it's either 'follow_up' OR 'lock_in', not both
  if (shouldFilterFollowUps) {
    const beforeFilterCount = leadsWithCallTime.length;
    leadsWithCallTime = leadsWithCallTime.filter(lead => {
      // Normalize outcome_log to always be an array for easier processing
      let outcomeLogs = [];
      if (Array.isArray(lead.outcome_log)) {
        outcomeLogs = lead.outcome_log.filter(ol => ol != null); // Filter out null/undefined entries
      } else if (lead.outcome_log && typeof lead.outcome_log === 'object') {
        outcomeLogs = [lead.outcome_log];
      }
      
      // If lockIn filter is active, show calls with 'lock_in' outcome instead of 'follow_up'
      if (filters?.lockIn) {
        // Check if the outcome_log entry has outcome = 'lock_in'
        const hasLockIn = outcomeLogs.some(ol => ol && ol.outcome === 'lock_in');
        return hasLockIn;
      }
      
      // Otherwise, show calls with 'follow_up' outcome
      const hasFollowUp = outcomeLogs.some(ol => ol && ol.outcome === 'follow_up');
      return hasFollowUp;
    });
    
    console.log('Follow ups filter applied:', {
      beforeCount: beforeFilterCount,
      afterCount: leadsWithCallTime.length,
      lockInFilterActive: filters?.lockIn,
      showing: filters?.lockIn ? 'lock_in' : 'follow_up'
    });
  }

  if (filters?.transferred) {
    leadsWithCallTime = leadsWithCallTime.filter(lead => lead.first_setter_id !== lead.setter_id);
  }

  // Filter for Lock In (calls with outcome = 'lock_in')
  // Only apply this filter if NOT on follow ups tab (follow ups tab handles it above)
  if (filters?.lockIn && !shouldFilterFollowUps) {
    leadsWithCallTime = leadsWithCallTime.filter(lead => {
      // Check if any outcome_log entry has outcome = 'lock_in'
      if (Array.isArray(lead.outcome_log)) {
        return lead.outcome_log.some(ol => ol.outcome === 'lock_in');
      }
      return lead.outcome_log?.outcome === 'lock_in';
    });
  }

  // Filter for leads with no ManyChat ID
  if (filters?.noManychatId) {
    leadsWithCallTime = leadsWithCallTime.filter(lead => {
      const mcId = lead.leads?.mc_id || lead.manychat_user_id;
      return !mcId || mcId === null || mcId === undefined || mcId === '';
    });
  }

  // Recalculate counts after filtering
  const finalCounts = {
    booked: leadsWithCallTime?.length || 0,
    confirmed: leadsWithCallTime?.filter(lead => lead.cancelled ? false : lead.confirmed).length || 0,
    cancelled: leadsWithCallTime?.filter(lead => lead.confirmed === false || lead.cancelled === true ).length || 0,
    noPickup: leadsWithCallTime?.filter(lead => lead.picked_up === false).length || 0,
    noShow: leadsWithCallTime?.filter(lead => lead.showed_up).length || 0
  };

    updateDataState({ leads: leadsWithCallTime || [], counts: finalCounts});
    updateDataState({ loading: false });

    // Set calltime loading state before running analysis
    updateDataState({ calltimeLoading: true });
    const callMap = await runAnalysis(leadsData, endDate);
    leadsWithCallTime = leadsWithCallTime.map(lead => ({...lead, ...callMap[lead.id]}));
    updateDataState({ leads: leadsWithCallTime || [], counts: finalCounts});
    updateDataState({ calltimeLoading: false });
  }

  
  
  // Fetch setters and closers in a single request using Supabase's rpc/multi-table feature, if available;
  // otherwise, use batched fetch. Here's a generic approach using Promise.all:

  const [settersRes, closersRes] = await Promise.all([
    supabase.from('setters').select('id, name'),
    supabase.from('closers').select('id, name')
  ]);

  if (!settersRes.error && settersRes.data) {
    const map = {};
    settersRes.data.forEach(s => { map[s.id] = s.name; });
    updateDataState({ setterMap: map });
  }

  if (!closersRes.error && closersRes.data) {
    const map = {};
    closersRes.data.forEach(c => { map[c.id] = c.name; });
    updateDataState({ closerMap: map });
  }

  updateDataState({ loading: false });

}

// Helper function to apply status filters
function applyStatusFilters(query, filters) {
  // Apply each filter if it's active (true)
  if (filters.confirmed) {
    query = query.eq('confirmed', true);
  }
  
  if (filters.cancelled) {
    query = query.eq('confirmed', false);
  }
  
  if (filters.noShow) {
    query = query.eq('showed_up', false); // Adjust column name to match your DB
  }

  if (filters.noPickUp) {
    query = query.eq('picked_up', false); // Adjust column name to match your DB
  }

  if (filters.rescheduled) {
    query = query.eq('is_reschedule', true); // Adjust column name to match your DB
  }
  if (filters.purchased) {
    query = query.eq('purchased', true);
  }

  return query;
}