import React, { useState, useEffect, useRef } from 'react';
import LeadItem from './components/LeadItem';
import { fetchAll } from '../utils/fetchLeads';
import Header from './components/Header';

export default function LeadsPage() {


      const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  setterMap: {},
  closerMap: {},
  counts: { booked:0, confirmed: 0, cancelled: 0, noShow: 0, noPickup: 0 }
});






 const [headerState, setHeaderState] = useState({
  showSearch: false,
  searchTerm: '',
  activeTab: 'today',
  sortBy: 'book_date',
  sortOrder: 'asc',
  filters: {
    confirmed: false,
    cancelled: false,
    noShow: false,
    noPickUp: false
  }
});



useEffect(() => {
  fetchAll(
    headerState.searchTerm,
    headerState.activeTab,
    headerState.sortBy,
    headerState.sortOrder,
    setDataState,
    null, null,
    headerState.filters
  );
}, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters]);



  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
     <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto' }}>

                      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            Leads Management
          </h1>
        
<Header
  state={headerState}
  setState={setHeaderState}
  mode='full'
/>

<div style={{ 
  display: 'flex', 
  gap: '16px', 
  marginBottom: '16px',
  padding: '12px',
  backgroundColor: '#f3f4f6',
  borderRadius: '8px'
}}>
  <span style={{ fontSize: '14px', color: '#374151' }}>
    <strong>Booked:</strong> {dataState.counts.booked}
  </span>
  <span style={{ fontSize: '14px', color: '#374151' }}>
    <strong>Confirmed:</strong> {dataState.counts.confirmed}
  </span>
  <span style={{ fontSize: '14px', color: '#374151' }}>
    <strong>Cancelled:</strong> {dataState.counts.cancelled}
  </span>
  <span style={{ fontSize: '14px', color: '#374151' }}>
    <strong>No Pick up:</strong> {dataState.counts.noPickup}
  </span>
  <span style={{ fontSize: '14px', color: '#374151' }}>
    <strong>No Shows:</strong> {dataState.counts.noShow}
  </span>
</div>
        


       {dataState.loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {dataState.leads.map((lead) => (
            <LeadItem
              key={lead.id}
              lead={lead}
              setterMap={dataState.setterMap}
              closerMap={dataState.closerMap}
              mode='full'
            />
          ))}


          {(dataState.leads.length === 0 && !dataState.loading) && (
            <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
              No leads found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const toggleFilter = (filterName) => {
  setFilters(prev => ({
    ...prev,
    [filterName]: !prev[filterName]
  }));
};

