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

    const lead = dataState.leads[0];
    const leadSource = lead.leads?.source || 'organic';
    const leadMedium = lead.leads?.medium;
    const isAds = leadSource.toLowerCase().includes('ad') || leadSource.toLowerCase().includes('ads');
    
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}>← Back</button> 
        <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto', background: 'white', padding: 20, borderRadius: 8, color: '#000000' }}>
          <h1 style={{ fontSize: 20, marginBottom: '8px' }}>
            {lead.name}
          </h1>
          
          {/* Lead Source Information */}
          <div style={{ 
            display: 'flex', 
            gap: '16px', 
            alignItems: 'center',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Source:</span>
              <span style={{ 
                fontSize: '14px', 
                color: isAds ? '#2563eb' : '#059669',
                fontWeight: '600',
                padding: '4px 12px',
                borderRadius: '4px',
                backgroundColor: isAds ? '#dbeafe' : '#d1fae5'
              }}>
                {isAds ? 'Ads' : 'Organic'}
              </span>
            </div>
            
            {isAds && leadMedium && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Medium:</span>
                <span style={{ 
                  fontSize: '14px', 
                  color: leadMedium.toLowerCase() === 'tiktok' ? '#ec4899' : '#8b5cf6',
                  fontWeight: '600',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  backgroundColor: leadMedium.toLowerCase() === 'tiktok' ? '#fce7f3' : '#f3e8ff',
                  textTransform: 'capitalize'
                }}>
                  {leadMedium}
                </span>
              </div>
            )}
          </div>
          
          {dataState.leads.map((call) => (
            <LeadItem
            key={call.id}
            lead={call}
            setterMap={dataState.setterMap}
            closerMap={dataState.closerMap}
            mode={localStorage.getItem('userRole')}/>
          ))}
        </div>
      </div>
    );
  };