import React, { useState, useEffect, useRef } from 'react';
import LeadItem from './components/LeadItem';
import { fetchAll } from '../utils/fetchLeads';
import Header from './components/Header';

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setterMap, setSetterMap] = useState({});
  const [closerMap, setCloserMap] = useState({});
  const [showSearch, setShowSearch] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
 const [activeTab, setActiveTab] = useState('today'); 
 const [sortBy, setSortBy] = useState('book_date');
 const [sortOrder, setSortOrder] = useState('asc');


  useEffect(() => {
    fetchAll(searchTerm, activeTab,sortBy, sortOrder, setLeads, setSetterMap, setCloserMap, setLoading);
  }, [activeTab, sortBy, sortOrder, searchTerm]);



  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
     <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto' }}>

                      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            Leads Management
          </h1>
        
        <Header setActiveTab={setActiveTab} setSearchTerm={setSearchTerm}
        setShowSearch={setShowSearch} setSortBy={setSortBy}
        setSortOrder={setSortOrder} activeTab={activeTab}
        showSearch={showSearch} searchTerm={searchTerm} sortBy={sortBy}
        sortOrder={sortOrder} mode='full' />
        


       {loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {leads.map((lead) => (
            <LeadItem
              key={lead.id}
              lead={lead}
              setterMap={setterMap}
              closerMap={closerMap}
              mode='full'
            />
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