import { supabase } from '../lib/supabaseClient';






export async function fetchAll(leadEmail, activeTab = 'all' , sortField = 'book_date', order = 'asc', setLeads, setSetterMap, setCloserMap, setLoading, closerId, setterId)  {
  setLoading(true);


  
  // Fetch leads
  let query = supabase
    .from('calls')
    .select(
    closerId
      ? `*, closers (id, name)`
      : setterId
      ? `*, setters (id, name)`
      : '*'
  )
    .order(sortField, { ascending: order === 'desc', nullsFirst: false});



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
  if (leadEmail) {
    query = query.eq('email', leadEmail);
    console.log("Filtering by email:", leadEmail);
  } else if(closerId){
      query = query.eq('closer_id', closerId);
      console.log("Filtering by closer ID:", closerId);
    } else if(setterId){
      query = query.eq('setter_id', setterId);
      console.log("Filtering by setter ID:", setterId);
    }

  // Only apply limit if no email filter and showing 'all'
  if (!leadEmail && activeTab === 'all') {
    query = query.limit(50);
  }

  const { data: leadsData, error: leadsError } = await query;

  if (leadsError) {
    console.error('Error fetching leads:', leadsError);
    setLeads([]);
  } else {
    setLeads(leadsData || []);
  }
  
  if(setSetterMap){
    console.log("Fetching setters");
  // Fetch setters
  const { data: settersData, error: settersError } = await supabase
    .from('setters')
    .select('id, name');
  if (!settersError && settersData) {
    const map = {};
    settersData.forEach(s => { map[s.id] = s.name; });
    setSetterMap(map);
  }
}

if(setCloserMap){
    console.log("Fetching closers");
  // Fetch closers
  const { data: closersData, error: closersError } = await supabase
    .from('closers')
    .select('id, name');
  if (!closersError && closersData) {
    const map = {};
    closersData.forEach(c => { map[c.id] = c.name; });
    setCloserMap(map);
  }
  setLoading(false);
}

}