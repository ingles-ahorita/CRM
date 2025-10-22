import React, { useState, useEffect, useRef, Navigate } from 'react';
import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
import { fetchAll } from '../utils/fetchLeads';
import Header from './components/Header';
import { useSimpleAuth } from '../useSimpleAuth'; 
import {useSearchParams} from 'react-router-dom';
import { EndShiftModal } from './components/EndShiftModal';

export default function LeadsPage() {



      const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  setterMap: {},
  closerMap: {},
  counts: { booked:0, confirmed: 0, cancelled: 0, noShow: 0, noPickup: 0 }
});

  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);






const [searchParams, setSearchParams] = useSearchParams();

const [headerState, setHeaderState] = useState({
  showSearch: false,
  searchTerm: searchParams.get('search') || '',                    // Read from URL
  activeTab: searchParams.get('tab') || 'today',                  // Read from URL
  sortBy: searchParams.get('sortBy') || 'book_date',              // Read from URL
  sortOrder: searchParams.get('sortOrder') || 'desc',             // Read from URL
  startDate: searchParams.get('start') || '',
  endDate: searchParams.get('end') || '',
  firstSetterFilter: searchParams.get('firstSetter') || '',
  setterFilter: searchParams.get('setter') || '',
  filters: {
    confirmed: searchParams.get('confirmed') === 'true',          // Read from URL
    cancelled: searchParams.get('cancelled') === 'true',          // Read from URL
    noShow: searchParams.get('noShow') === 'true',                // Read from URL
    noPickUp: searchParams.get('noPickUp') === 'true',            // Read from URL
    rescheduled: searchParams.get('rescheduled') === 'true',      // Read from URL
    transferred: searchParams.get('transferred') === 'true'        // Read from URL
  },
  onEndShift: () => setIsEndShiftModalOpen(true)
});


useEffect(() => {
  console.log('Updating URL with headerState:', headerState);
  const params = new URLSearchParams();
  
  if (headerState.searchTerm) params.set('search', headerState.searchTerm);
  if (headerState.activeTab !== 'today') params.set('tab', headerState.activeTab);
  if (headerState.sortBy !== 'book_date') params.set('sortBy', headerState.sortBy);
  if (headerState.sortOrder !== 'desc') params.set('sortOrder', headerState.sortOrder);
  if (headerState.startDate) params.set('start', headerState.startDate);
  if (headerState.endDate) params.set('end', headerState.endDate);
  if (headerState.firstSetterFilter) params.set('firstSetter', headerState.firstSetterFilter);
  if (headerState.setterFilter) params.set('setter', headerState.setterFilter);
  if (headerState.transferred) params.set('transferred', headerState.transferred);
  // Add filters
  Object.entries(headerState.filters).forEach(([key, value]) => {
    if (value) params.set(key, 'true');
  });
  
  setSearchParams(params);
}, [headerState, setSearchParams]); // Only runs when headerState changes





useEffect(() => {
  fetchAll(
    headerState.searchTerm,
    headerState.activeTab,
    headerState.sortBy,
    headerState.sortOrder,
    setDataState,
    null, null,
    headerState.filters,
    undefined,
    headerState.startDate,
    headerState.endDate,
    headerState.firstSetterFilter,
    headerState.setterFilter
  );
}, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters, headerState.startDate, headerState.endDate, headerState.firstSetterFilter, headerState.setterFilter, headerState.transferred]);



  return (

    
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>


     <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto' }}>

                      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            Leads Management
          </h1>
        
<Header
  state={{...headerState, setterMap: dataState.setterMap}}
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

      {(headerState.activeTab !== 'all') && (
        
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
        </div> )}

        {(headerState.activeTab === 'all') && (
          <div>
  <LeadListHeader />
  {dataState.leads.map(lead => (
    <LeadItemCompact 
      key={lead.id}
      lead={lead}
      setterMap={dataState.setterMap}
      closerMap={dataState.closerMap}
    />
  ))}
</div>





        )}

        {/* End Shift Modal */}
        <EndShiftModal
          isOpen={isEndShiftModalOpen}
          onClose={() => setIsEndShiftModalOpen(false)}
          mode="admin"
          userId={null}
          setterMap={dataState.setterMap}
          closerMap={dataState.closerMap}
        />

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

