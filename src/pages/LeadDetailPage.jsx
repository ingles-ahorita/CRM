  import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
  import { useState, useEffect, use } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  
  
  export default function LeadDetail() {
    const { leadID } = useParams();   // 👈 this is the “best way” to get it
    const navigate = useNavigate();

    
      const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  setterMap: {},
  closerMap: {}
});

    
  
    

useEffect(() => {
  fetchAll(
    undefined, undefined, undefined, undefined,
    setDataState,
    null, null, null, leadID
  );
}, []);


    if (dataState.loading) return <div style={{ height: '100vh', margin: '0 auto', padding: 60, backgroundColor: '#f9fafb', color: '#6b7280' }}><h2>Loading lead...</h2></div>;
    if (!dataState.leads || dataState.leads.length === 0) return <div style={{ padding: 24 }}>Lead not found.</div>;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}>← Back</button> 
        <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto', background: 'white', padding: 20, borderRadius: 8, color: '#000000' }}>
          <h1 style={{ fontSize: 20 }}>{dataState.leads[0].name}</h1>
          {dataState.leads.map((call) => (
            <LeadItem
            key={call.id}
            lead={call}
            setterMap={dataState.setterMap}
            closerMap={dataState.closerMap}
            mode={"view"}/>
          ))}
        </div>
      </div>
    );
  };