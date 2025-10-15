import LeadItem from './components/LeadItem';

  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import Header from './components/Header';
  import { fetchAll } from '../utils/fetchLeads';

  export default function Closer() {

    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [closerMap, setCloserMap] = useState({});
const [setterMap, setSetterMap] = useState({});
    const { closer } = useParams();   // 👈 this is the “best way” to get it
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('today');
    const [sortBy, setSortBy] = useState('call_date');
    const [sortOrder, setSortOrder] = useState('asc');
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');




    



  // Fetch leads from Supabase on component mount
  useEffect(() => {
    fetchAll(searchTerm, activeTab,sortBy, sortOrder, setLeads, setSetterMap, setCloserMap, setLoading, closer, null);
  }, [activeTab, sortBy, sortOrder,searchTerm]);





  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '80%', maxWidth: 1000, margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Closer: {closerMap[closer] || ""}
            </h1>

                    <Header setActiveTab={setActiveTab} setSearchTerm={setSearchTerm}
          setShowSearch={setShowSearch} setSortBy={setSortBy}
          setSortOrder={setSortOrder} activeTab={activeTab}
          showSearch={showSearch} searchTerm={searchTerm} sortBy={sortBy}
          sortOrder={sortOrder}  />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} setterMap={setterMap} mode='closer'/>
            ))}

            {(leads.length === 0 && !loading) && (
            <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
              No leads found.
            </div>
          )}
          </div>
        </div>
      </div>
    );
}


