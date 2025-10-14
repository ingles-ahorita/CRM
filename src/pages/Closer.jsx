import LeadItem from './components/LeadItem';

import { supabase } from '../lib/supabaseClient';
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';

  export default function Closer() {

    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [setters, setSetters] = useState([]);
    const { closer } = useParams();   // 👈 this is the “best way” to get it
    const navigate = useNavigate();




    



  // Fetch leads from Supabase on component mount
  useEffect(() => {
    fetchLeads();
  }, []);

    async function fetchLeads() {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('closer_id', closer)
      .order('book_date', { ascending: false, nullsFirst: false})
      .limit(50); // Limit to 1000 for performance
    
    if (error) {
      console.error('Error fetching leads:', error);
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  }


    if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>
    );
  }





  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '70%', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Closer: {closer}
            </h1>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leads.map((lead) => (
              <LeadItem key={lead.call_uuid} lead={lead} setters={setters}/>
            ))}
          </div>
        </div>
      </div>
    );
}


