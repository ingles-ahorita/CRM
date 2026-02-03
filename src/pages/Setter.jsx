import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  import Header from './components/Header';
import { EndShiftModal } from './components/EndShiftModal';
import { StartShiftModal } from './components/StartShiftModal';
import { useRealtimeLeads } from '../hooks/useRealtimeLeads';
import { supabase } from '../lib/supabaseClient';
  
  import { useSimpleAuth } from '../useSimpleAuth';

  export default function Setter() {

    const { email, userName, logout } = useSimpleAuth();

    const { setter } = useParams()
    const navigate = useNavigate(); 

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
        noManychatId: false
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

  

  // Enable real-time updates for this setter
  useRealtimeLeads(dataState, setDataState, headerState.activeTab, setter, null);
    

  useEffect(() => {
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      null, setter,
      headerState.filters
    );
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters]);




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
/>

          {dataState.loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {dataState.leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} closerMap = {dataState.closerMap} setterMap={dataState.setterMap} mode="setter" currentUserId={setter} calltimeLoading={dataState.calltimeLoading}/>
            ))}

            {(dataState.leads.length === 0 && !dataState.loading) && (
            <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
              No leads found.
            </div>
          )}
          </div>
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
