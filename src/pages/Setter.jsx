import LeadItem from './components/LeadItem';
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  import Header from './components/Header';

  export default function Setter() {

    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const { setter } = useParams();   // 👈 this is the “best way” to get it
    const [closerMap, setCloserMap] = useState({});
    const [setterMap, setSetterMap] = useState({});
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('today');
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
     const [sortBy, setSortBy] = useState('book_date');
     const [sortOrder, setSortOrder] = useState('desc');



    



  // Fetch leads from Supabase on component mount
  useEffect(() => {
    fetchAll(searchTerm, activeTab,sortBy, sortOrder, setLeads, setSetterMap, setCloserMap, setLoading, null, setter);
  }, [activeTab, sortBy, sortOrder, searchTerm]);




  return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
        <div style={{ width: '70%', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
              Setter: {setterMap[setter] || ""}
            </h1>
          </div>

          <Header setActiveTab={setActiveTab} setSearchTerm={setSearchTerm}
          setShowSearch={setShowSearch} setSortBy={setSortBy}
          setSortOrder={setSortOrder} activeTab={activeTab}
          showSearch={showSearch} searchTerm={searchTerm} sortBy={sortBy}
          sortOrder={sortOrder} mode="setter"  />

          {loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} closerMap = {closerMap} setterMap={setterMap} mode="setter"/>
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
