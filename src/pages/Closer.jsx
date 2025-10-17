import LeadItem from './components/LeadItem';

  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import Header from './components/Header';
  import { fetchAll } from '../utils/fetchLeads';

  export default function Closer() {

    const { closer } = useParams();   // 👈 this is the “best way” to get it
    const navigate = useNavigate();

     const [headerState, setHeaderState] = useState({
      showSearch: false,
      searchTerm: '',
      activeTab: 'today',
      sortBy: 'book_date',
      sortOrder: 'asc',
      filters: {
        confirmed: false,
        cancelled: false,
        noShow: false
      }
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
      closer, null
    );
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder]);





  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '80%', maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Closer: {dataState.closerMap[closer] || ""}
            </h1>

                <Header
                  state={headerState}
                  onStateChange={setHeaderState}
                  mode='closer'
                />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {dataState.leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} setterMap={dataState.setterMap} mode='closer'/>
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


