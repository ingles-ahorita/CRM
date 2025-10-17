import { supabase } from '../lib/supabaseClient';






export async function fetchAll(searchTerm, activeTab = 'all' , sortField = 'book_date', order, setDataState, closerId, setterId, filters)  {



  const updateDataState = (updates) => {
  setDataState(prev => ({ ...prev, ...updates }));
};

updateDataState({ loading: true });

  
  // Fetch leads
let query = supabase
  .from('calls')
  .select(`
    *,
    closers (id, name),
    setters (id, name)
  `)
  .order(sortField, { ascending: order === 'asc', nullsFirst: false });



  // Filter by date based on active tab
  if (activeTab !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    if (activeTab === 'today') {
      query = query
        .gte(sortField, today.toISOString())
        .lt(sortField, tomorrow.toISOString());
    } else if (activeTab === 'yesterday') {
      query = query
        .gte(sortField, yesterday.toISOString())
        .lt(sortField, today.toISOString());
    } else if (activeTab === 'tomorrow') {
      query = query
        .gte(sortField, tomorrow.toISOString())
        .lt(sortField, dayAfterTomorrow.toISOString());
    }

   
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

  // Only apply limit if no email filter and showing 'all'
  if (!searchTerm && activeTab === 'all') {
    query = query.limit(100);
  }
console.log('Sorting:', sortField, 'order:', order, 'ascending:', order === 'asc');
  const { data: leadsData, error: leadsError } = await query;

  if (leadsError) {
    console.error('Error fetching leads:', leadsError);
    updateDataState({ leads: []})
  } else {
    const counts = {
      booked: leadsData?.length || 0,
    confirmed: leadsData?.filter(lead => lead.confirmed).length || 0,
    cancelled: leadsData?.filter(lead => lead.confirmed === false).length || 0,
        noPickup: leadsData?.filter(lead => lead.picked_up === false).length || 0,
    noShow: leadsData?.filter(lead => lead.showed_up).length || 0

  };
    updateDataState({ leads: leadsData || [], counts: counts});
  }
  
  const { data: settersData, error: settersError } = await supabase
    .from('setters')
    .select('id, name');
  if (!settersError && settersData) {
    const map = {};
    settersData.forEach(s => { map[s.id] = s.name; });
    updateDataState({ setterMap: map });
  }
    console.log("Fetching closers");
  // Fetch closers
  const { data: closersData, error: closersError } = await supabase
    .from('closers')
    .select('id, name');
  if (!closersError && closersData) {
    const map = {};
    closersData.forEach(c => { map[c.id] = c.name; });
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

  return query;
}