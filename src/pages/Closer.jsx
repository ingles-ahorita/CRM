import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';

  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import Header from './components/Header';
  import { fetchAll } from '../utils/fetchLeads';
import { EndShiftModal } from './components/EndShiftModal';
import { StartShiftModal } from './components/StartShiftModal';
import { useRealtimeLeads } from '../hooks/useRealtimeLeads';
import { supabase } from '../lib/supabaseClient';
import { useSimpleAuth } from '../useSimpleAuth';

  export default function Closer() {

    const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
    const [isStartShiftModalOpen, setIsStartShiftModalOpen] = useState(false);
    const [currentShift, setCurrentShift] = useState(null);
    const [isShiftActive, setIsShiftActive] = useState(false);

    const { email, userName, logout } = useSimpleAuth();

    const { closer } = useParams();   // 👈 this is the "best way" to get it
    const navigate = useNavigate();

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
    };

     const [headerState, setHeaderState] = useState({
      showSearch: false,
      searchTerm: '',
      activeTab: 'today',
      sortBy: 'call_date',
      sortOrder: 'asc',
      filters: {
        confirmed: false,
        cancelled: false,
        noShow: false,
        transferred: false
      },
      currentCloser: closer,
      onEndShift: handleEndShift,
      onStartShift: () => setIsStartShiftModalOpen(true),
      isShiftActive: isShiftActive
    });

        const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  setterMap: {},
  closerMap: {}
});

  // Check for active shift on component mount
  // useEffect(() => {
  //   checkActiveShift();
  // }, []);

  // const checkActiveShift = async () => {
  //   try {
  //     const { data, error } = await supabase
  //       .from('setter_shifts')
  //       .select('*')
  //       .eq('closer_id', closer)
  //       .eq('status', 'open')
  //       .order('start_time', { ascending: false })
  //       .limit(1)
  //       .single();

  //     if (data && !error) {
  //       setCurrentShift(data);
  //       setIsShiftActive(true);
  //     } else {
  //       setCurrentShift(null);
  //       setIsShiftActive(false);
  //     }
  //   } catch (err) {
  //     console.error('Error checking active shift:', err);
  //   }
  // };

  // Enable real-time updates for this closer
  useRealtimeLeads(dataState, setDataState, headerState.activeTab, null, closer);

    

  useEffect(() => {
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      closer, null,
      headerState.filters
    );
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters]);





  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '80%', maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Closer: {dataState.closerMap[closer] || ""}
            </h1>

                <Header
                  state={headerState}
                  setState={setHeaderState}
                  mode='closer'
                />

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
              mode='closer'
              currentUserId={closer}
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
        </div>

        {/* Start Shift Modal */}
        <StartShiftModal
          isOpen={isStartShiftModalOpen}
          onClose={() => setIsStartShiftModalOpen(false)}
          userId={closer}
          userName={userName}
          onShiftStarted={handleStartShift}
          mode="closer"
        />

        {/* End Shift Modal */}
        <EndShiftModal
          isOpen={isEndShiftModalOpen}
          onClose={() => setIsEndShiftModalOpen(false)}
          mode="closer"
          userId={closer}
          setterMap={dataState.setterMap}
          closerMap={dataState.closerMap}
          currentShiftId={currentShift?.id}
          onShiftEnded={handleShiftEnded}
        />
      </div>
    );
}


