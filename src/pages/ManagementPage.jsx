import React, { useState, useEffect } from 'react';
import {LeadItemCompact, LeadListHeader} from './components/LeadItem';
import { fetchAll } from '../utils/fetchLeads';
import {getDailySlotsTotal} from '../utils/ocuppancy';
import Header from './components/Header';
import { useSimpleAuth } from '../useSimpleAuth'; 
import {useSearchParams} from 'react-router-dom';
import { EndShiftModal } from './components/EndShiftModal';
import { useRealtimeLeads } from '../hooks/useRealtimeLeads';

export default function ManagementPage() {
  const { userId } = useSimpleAuth();

  const [slots, setSlots] = useState({});

  const [dataState, setDataState] = useState({
    leads: [],
    loading: true,
    setterMap: {},
    closerMap: {},
    counts: { booked:0, confirmed: 0, cancelled: 0, noShow: 0, noPickup: 0, slots: 0 },
    currentDate: new Date().toISOString().split('T')[0]
  });

  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  const [headerState, setHeaderState] = useState({
    showSearch: false,
    searchTerm: searchParams.get('search') || '',
    activeTab: searchParams.get('tab') || 'today',
    sortBy: searchParams.get('sortBy') || 'book_date',
    sortOrder: searchParams.get('sortOrder') || 'desc',
    startDate: searchParams.get('start') || '',
    endDate: searchParams.get('end') || '',
    setterFilter: searchParams.get('setter') || '',
    closerFilter: searchParams.get('closer') || '',
    filters: {
      confirmed: searchParams.get('confirmed') === 'true',
      cancelled: searchParams.get('cancelled') === 'true',
      noShow: searchParams.get('noShow') === 'true',
      noPickUp: searchParams.get('noPickUp') === 'true',
      rescheduled: searchParams.get('rescheduled') === 'true',
      transferred: searchParams.get('transferred') === 'true',
      purchased: searchParams.get('purchased') === 'true'
    },
    onEndShift: () => setIsEndShiftModalOpen(true)
  });

  // Enable real-time updates for admin view
  useRealtimeLeads(dataState, setDataState, headerState.activeTab);

  useEffect(() => {
    console.log('Updating URL with headerState:', headerState);
    const params = new URLSearchParams();
    
    if (headerState.searchTerm) params.set('search', headerState.searchTerm);
    if (headerState.activeTab !== 'today') params.set('tab', headerState.activeTab);
    if (headerState.sortBy !== 'book_date') params.set('sortBy', headerState.sortBy);
    if (headerState.sortOrder !== 'desc') params.set('sortOrder', headerState.sortOrder);
    if (headerState.startDate) params.set('start', headerState.startDate);
    if (headerState.endDate) params.set('end', headerState.endDate);
    if (headerState.setterFilter) params.set('setter', headerState.setterFilter);
    if (headerState.closerFilter) params.set('closer', headerState.closerFilter);
    if (headerState.transferred) params.set('transferred', headerState.transferred);
    if (headerState.purchased) params.set('purchased', headerState.purchased);
    // Add filters
    Object.entries(headerState.filters).forEach(([key, value]) => {
      if (value) params.set(key, 'true');
    });
    
    setSearchParams(params);
  }, [headerState, setSearchParams]);

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
      headerState.setterFilter,
      headerState.closerFilter
    );
    const loadSlots = async () => {
      try {
        const slotsData = await getDailySlotsTotal();
        // getDailySlotsTotal returns an object with date keys: { 'YYYY-MM-DD': number }
        if (slotsData && typeof slotsData === 'object' && !Array.isArray(slotsData)) {
          setSlots(slotsData);
        } else {
          console.warn('Unexpected slots data format:', slotsData);
          setSlots({});
        }
      } catch (error) {
        console.error('Error loading slots:', error);
        setSlots({});
      }
    };
    
    loadSlots();
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters, headerState.startDate, headerState.endDate, headerState.setterFilter, headerState.closerFilter]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
      <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
          Management
        </h1>
        
        <Header
          state={{...headerState, setterMap: dataState.setterMap}}
          setState={setHeaderState}
          mode='full'
        />

        {/* Stats Section */}
        {(headerState.activeTab !== 'all') && (
          <div style={{ 
            display: 'flex', 
            gap: '16px', 
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px'
          }}>
            { (headerState.sortBy === 'call_date') && (
              <>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  <strong>Slots:</strong> {slots[dataState.currentDate] || 0}
                </span>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  <strong>Occupancy:</strong> {slots[dataState.currentDate] ? ((dataState.counts.confirmed / slots[dataState.currentDate]) * 100).toFixed(2) : 0}%
                </span>
              </>
            )}

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
        )}

        {dataState.loading && (
          <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
          </div>
        )}

        {!dataState.loading && (
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

            {(dataState.leads.length === 0 && !dataState.loading) && (
              <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
                No leads found.
              </div>
            )}
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
          leads={dataState.leads}
        />
      </div>
    </div>
  );
}

