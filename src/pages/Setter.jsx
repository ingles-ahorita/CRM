import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  import Header from './components/Header';
  
  import { useSimpleAuth } from '../useSimpleAuth';

  export default function Setter() {
      const { email, userName, logout } = useSimpleAuth();

        const { setter } = useParams()
        const navigate = useNavigate();   // 👈 this is the “best way” to get it

     const [headerState, setHeaderState] = useState({
      showSearch: false,
      searchTerm: '',
      activeTab: 'today',
      sortBy: 'book_date',
      sortOrder: 'desc',
      startDate: '',
      endDate: '',
      filters: {
        confirmed: false,
        cancelled: false,
        noShow: false
      },
      currentSetter: setter
    });

    const [dataState, setDataState] = useState({
  leads: [],
  loading: true,
  setterMap: {},
  closerMap: {}
});
    

  useEffect(() => {
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      null, setter
      , undefined, headerState.startDate, headerState.endDate
    );
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.startDate, headerState.endDate]);




  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '90%', maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Setter: {dataState.setterMap[setter] || ""}
            </h1>
          </div>

<Header
  state={headerState}
  setState={setHeaderState}
  mode='setter'
/>

          {dataState.loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {dataState.leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} closerMap = {dataState.closerMap} setterMap={dataState.setterMap} mode="setter"/>
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
