  import LeadItem from './components/LeadItem';
  import { supabase } from '../lib/supabaseClient';
  import { useState, useEffect, use } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  
  
  export default function LeadDetail() {
    const { leadID } = useParams();   // 👈 this is the “best way” to get it
    const navigate = useNavigate();

    
    const [calls, setCalls] = useState(null);
  const [loading, setLoading] = useState(true);
    const [setterMap, setSetterMap] = useState({});
    const [closerMap, setCloserMap] = useState({});

    
  
    

useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    // Fetch leads
    const { data: leadsData, error: leadsError } = await supabase
      .from('calls')
      .select('*')
      .order('book_date', { ascending: false, nullsFirst: false })
      .eq('lead_id', leadID);
    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      setCalls([]);
    } else {
      setCalls(leadsData || []);
    }
    // Fetch setters
    const { data: settersData, error: settersError } = await supabase
      .from('setters')
      .select('id, name');
    if (!settersError && settersData) {
      const map = {};
      settersData.forEach(s => { map[s.id] = s.name; });
      setSetterMap(map);
    }
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


    console.log('calls', calls);

    if (loading) return <div style={{ height: '100vh', margin: '0 auto', padding: 60, backgroundColor: '#f9fafb', color: '#6b7280' }}><h2>Loading lead...</h2></div>;
    if (!calls || calls.length === 0) return <div style={{ padding: 24 }}>Lead not found.</div>;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', background: 'white', padding: 20, borderRadius: 8, color: '#000000' }}>
          <button onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>← Back</button>
          <h1 style={{ fontSize: 20 }}>{calls[0].name}</h1>
          {calls.map((call) => (
            <LeadItem
            key={call.id}
            lead={call}
            setterMap={setterMap}
            closerMap={closerMap}/>
          ))}
        </div>
      </div>
    );
  };