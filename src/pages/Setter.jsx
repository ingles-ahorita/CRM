import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
  import { useMemo, useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  import Header, { HeaderTabsAndToolbar } from './components/Header';
import { EndShiftModal } from './components/EndShiftModal';
import { StartShiftModal } from './components/StartShiftModal';
import { useRealtimeLeads } from '../hooks/useRealtimeLeads';
import { supabase } from '../lib/supabaseClient';
import SetterPotentialLeads from './components/setter/potential-leads';
import { getDayBoundsLocal } from '../utils/dateHelpers';
import { subDays } from 'date-fns';
  
  import { useSimpleAuth } from '../useSimpleAuth';

  export default function Setter() {

    const { email, userName, logout } = useSimpleAuth();

    const { setter } = useParams()
    const navigate = useNavigate(); 

    const [leadView, setLeadView] = useState('current'); // 'current' | 'potential'
    const [potentialDatePreset, setPotentialDatePreset] = useState('all'); // today | yesterday | all | custom
    const [potentialStartDate, setPotentialStartDate] = useState('');
    const [potentialEndDate, setPotentialEndDate] = useState('');

    const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
  const [isStartShiftModalOpen, setIsStartShiftModalOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [isShiftActive, setIsShiftActive] = useState(false);

  // Check for active shift on component mounta
  useEffect(() => {
    checkActiveShift();
  }, []);

  // Update headerState when isShiftActive changes
  useEffect(() => {
    setHeaderState(prevState => ({
      ...prevState,
      isShiftActive: isShiftActive
    }));
  }, [isShiftActive]);

  const checkActiveShift = async () => {
    try {
      const { data, error } = await supabase
        .from('setter_shifts')
        .select('*')
        .eq('setter_id', setter)
        .eq('status', 'open')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setCurrentShift(data);
        setIsShiftActive(true);
      } else {
        setCurrentShift(null);
        setIsShiftActive(false);
      }
    } catch (err) {
      console.error('Error checking active shift:', err);
    }
  };

  const handleStartShift = (shiftData) => {
    setCurrentShift(shiftData);
    setIsShiftActive(true);
    setIsStartShiftModalOpen(false);
  };

  const handleEndShift = () => {
    setIsEndShiftModalOpen(true);
  };

  const handleShiftEnded = () => {
    setCurrentShift(null);
    setIsShiftActive(false);
    setIsEndShiftModalOpen(false);
  };  // 👈 this is the “best way” to get it

     const [headerState, setHeaderState] = useState({
      showSearch: false,
      searchTerm: '',
      activeTab: 'today',
      sortBy: 'book_date',
      sortOrder: 'desc',
      startDate: '',
      endDate: '',
      setterFilter: '',
      filters: {
        confirmed: false,
        cancelled: false,
        noShow: false,
        transferred: false,
        noManychatId: false,
        noConversions: false
      },
      currentSetter: setter,
      onEndShift: handleEndShift,
    onStartShift: () => setIsStartShiftModalOpen(true),
    isShiftActive: isShiftActive
    });

    const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  calltimeLoading: false,
  setterMap: {},
  closerMap: {}
});

  const isCurrentLeadsView = leadView !== 'potential';

  // When switching to Potential Leads, default to "All" every time.
  useEffect(() => {
    if (leadView !== 'potential') return;
    setPotentialDatePreset('all');
    setPotentialStartDate('');
    setPotentialEndDate('');
  }, [leadView]);

  const potentialDateRange = useMemo(() => {
    const now = new Date();
    if (potentialDatePreset === 'today') {
      const { dayStart, dayEnd } = getDayBoundsLocal(now);
      return { startISO: dayStart.toISOString(), endISO: dayEnd.toISOString() };
    }
    if (potentialDatePreset === 'yesterday') {
      const { dayStart, dayEnd } = getDayBoundsLocal(subDays(now, 1));
      return { startISO: dayStart.toISOString(), endISO: dayEnd.toISOString() };
    }
    if (potentialDatePreset === 'custom') {
      if (!potentialStartDate && !potentialEndDate) return { startISO: null, endISO: null };
      const start = potentialStartDate ? new Date(potentialStartDate) : null;
      const end = potentialEndDate ? new Date(potentialEndDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      return {
        startISO: start ? start.toISOString() : null,
        endISO: end ? end.toISOString() : null,
      };
    }
    return { startISO: null, endISO: null };
  }, [potentialDatePreset, potentialStartDate, potentialEndDate]);

  const potentialDateFiltersUi = useMemo(() => {
    const tabBtn = (key, label) => (
      <button
        key={key}
        type="button"
        onClick={() => setPotentialDatePreset(key)}
        style={{
          outline: 'none',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: potentialDatePreset === key ? '600' : '400',
          color: potentialDatePreset === key ? '#001749ff' : '#6b7280',
          borderBottom: potentialDatePreset === key ? '2px solid #001749ff' : 'none',
          marginBottom: '-2px',
          textTransform: 'capitalize',
          transition: 'all 0.2s',
        }}
      >
        {label}
      </button>
    );

    return (
      <div style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '16px',
            borderBottom: '2px solid #e5e7eb',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {tabBtn('yesterday', 'Yesterday')}
          {tabBtn('today', 'Today')}
          {tabBtn('all', 'All')}
          {tabBtn('custom', 'Custom')}
        </div>

        {potentialDatePreset === 'custom' && (
          <div
            style={{
              marginTop: '12px',
              marginBottom: '12px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
              Date range
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#6b7280' }}>Start</label>
              <input
                type="date"
                value={potentialStartDate}
                onChange={(e) => setPotentialStartDate(e.target.value)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  backgroundColor: 'white',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#6b7280' }}>End</label>
              <input
                type="date"
                value={potentialEndDate}
                onChange={(e) => setPotentialEndDate(e.target.value)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  backgroundColor: 'white',
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }, [potentialDatePreset, potentialStartDate, potentialEndDate]);

  const leadViewToggle = useMemo(() => {
    const btnBase = (active) => ({
      padding: '6px 10px',
      borderRadius: '8px',
      border: active ? '1px solid #c7d2fe' : '1px solid #e5e7eb',
      backgroundColor: active ? '#e0e7ff' : '#ffffff',
      color: active ? '#3730a3' : '#4b5563',
      fontWeight: 600,
      fontSize: '12px',
      cursor: 'pointer',
      outline: 'none',
    });

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setLeadView('current')}
            style={btnBase(leadView === 'current')}
          >
            Current Leads
          </button>
          <button
            type="button"
            onClick={() => setLeadView('potential')}
            style={btnBase(leadView === 'potential')}
          >
            Potential Leads
          </button>
        </div>
      </div>
    );
  }, [leadView]);

  

  // Enable real-time updates for this setter
  useRealtimeLeads(
    dataState,
    setDataState,
    headerState.activeTab,
    setter,
    null,
    headerState.sortBy,
    isCurrentLeadsView,
  );
    

  useEffect(() => {
    if (!isCurrentLeadsView) return;
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      null, setter,
      headerState.filters,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      headerState.sortBy  // Filter by same field as sort toggle (book_date or call_date)
    );
  }, [isCurrentLeadsView, headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters]);




  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '90%', maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Setter: {dataState.setterMap[setter] || ""}
            </h1>
          </div>

<Header
  state={{...headerState, setterMap: dataState.setterMap}}
  setState={setHeaderState}
  mode='setter'
  hideTabs
  leftContent={leadViewToggle}
/>

          {isCurrentLeadsView ? (
            <HeaderTabsAndToolbar
              state={{ ...headerState, setterMap: dataState.setterMap, closerMap: dataState.closerMap }}
              setState={setHeaderState}
              mode="setter"
            />
          ) : (
            potentialDateFiltersUi
          )}

          {!isCurrentLeadsView ? (
            <div style={{ marginTop: '16px' }}>
              <SetterPotentialLeads
                setterId={setter}
                datePreset={potentialDatePreset}
                startISO={potentialDateRange.startISO}
                endISO={potentialDateRange.endISO}
              />
            </div>
          ) : dataState.loading ? (
            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
              <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
            </div>
          ) : (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                {dataState.leads.map((lead) => (
                  <LeadItem
                    key={lead.id}
                    lead={lead}
                    closerMap={dataState.closerMap}
                    closerList={dataState.closerList ?? []}
                    setterMap={dataState.setterMap}
                    mode="setter"
                    currentUserId={setter}
                    calltimeLoading={dataState.calltimeLoading}
                    onLeadUpdated={(callId, updates) =>
                      setDataState(prev => ({
                        ...prev,
                        leads: prev.leads.map(l => l.id === callId ? { ...l, ...updates } : l)
                      }))
                    }
                  />
                ))}
                {(dataState.leads.length === 0) && (
                  <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
                    No leads found.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Start Shift Modal */}
        <StartShiftModal
          isOpen={isStartShiftModalOpen}
          onClose={() => setIsStartShiftModalOpen(false)}
          userId={setter}
          userName={userName}
          onShiftStarted={handleStartShift}
          mode="setter"
        />

        {/* End Shift Modal */}
        <EndShiftModal
          isOpen={isEndShiftModalOpen}
          onClose={() => setIsEndShiftModalOpen(false)}
          mode="setter"
          userId={setter}
          setterMap={dataState.setterMap}
          closerMap={dataState.closerMap}
          currentShiftId={currentShift?.id}
          onShiftEnded={handleShiftEnded}
          leads={dataState.leads}
        />
      </div>
    );
}
