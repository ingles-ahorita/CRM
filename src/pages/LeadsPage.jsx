import React, { useState, useEffect, useRef } from 'react';
import { Search, ChartSpline, AlarmClock, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import LeadItem from './components/LeadItem';

import { supabase } from '../lib/supabaseClient';

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
 const searchInputRef = useRef(null);

  useEffect(() => {
    fetchAll(null, activeTab,sortBy, sortOrder);
  }, [activeTab, sortBy, sortOrder]);

async function fetchAll(leadEmail, activeTab = 'all' , sortField = 'book_date', order = 'asc') {
  setLoading(true);
  
  // Fetch leads
  let query = supabase
    .from('calls')
    .select('*')
    .order(sortField, { ascending: order === 'desc', nullsFirst: false });

  // Filter by email if provided
  if (leadEmail) {
    query = query.eq('email', leadEmail);
  }

  // Filter by date based on active tab
  if (activeTab !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    if (activeTab === 'today') {
      query = query
        .gte('call_date', today.toISOString())
        .lt('call_date', tomorrow.toISOString());
    } else if (activeTab === 'yesterday') {
      query = query
        .gte('call_date', yesterday.toISOString())
        .lt('call_date', today.toISOString());
    } else if (activeTab === 'tomorrow') {
      query = query
        .gte('call_date', tomorrow.toISOString())
        .lt('call_date', dayAfterTomorrow.toISOString());
    }
  }

  // Only apply limit if no email filter and showing 'all'
  if (!leadEmail && activeTab === 'all') {
    query = query.limit(50);
  }

  const { data: leadsData, error: leadsError } = await query;

  if (leadsError) {
    console.error('Error fetching leads:', leadsError);
    setLeads([]);
  } else {
    setLeads(leadsData || []);
  }
  
  // Fetch setters
  const { data: settersData, error: settersError } = await supabase
    .from('setters')
    .select('id, name');
  if (!settersError && settersData) {
    const map = {};
    settersData.forEach(s => { map[s.id] = s.name; });
    setSetterMap(map);
  }
  
  // Fetch closers
  const { data: closersData, error: closersError } = await supabase
    .from('closers')
    .select('id, name');
  if (!closersError && closersData) {
    const map = {};
    closersData.forEach(c => { map[c.id] = c.name; });
    setCloserMap(map);
  }
  
  setLoading(false);
}




  // if (loading) {
  //   return (
  //     <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  //       <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
  //     </div>
  //   );
  // }


  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%'}}>
     <div style={{ width: '80%', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            Leads Management
          </h1>

          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            marginBottom: '16px',
            borderBottom: '2px solid #e5e7eb'
          }}>
            {['yesterday', 'today', 'tomorrow', 'all'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  outline: 'none',
                  padding: '8px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: activeTab === tab ? '600' : '400',
                  color: activeTab === tab ? '#001749ff' : '#6b7280',
                  borderBottom: activeTab === tab ? '2px solid #001749ff' : 'none',
                  marginBottom: '-2px',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.color = '#111827';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.color = '#6b7280';
                  }
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* BUTTONS */}
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', width: '100%', justifyContent: 'flex-start' }}>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  {/* Date type toggle */}
  <button
    onClick={() => setSortBy(sortBy === 'book_date' ? 'call_date' : 'book_date')}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: '#f3f4f6',
      color: '#111827',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '13px',
      transition: 'all 0.2s',
      outline: 'none'
    }}
  >
    <Calendar size={16} />
    {sortBy === 'book_date' ? 'Book Date' : 'Call Date'}
  </button>

  {/* Sort order toggle */}
  <button
    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: '#f3f4f6',
      color: '#111827',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '13px',
      transition: 'all 0.2s',
      outline: 'none'
    }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
  >
    {sortOrder === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
    {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
  </button>
</div>


  {/* Search Icon + Input */}
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>

          <input
          ref={searchInputRef}
        type="text"
        placeholder="Search lead..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={(e) => {
    if (e.key === 'Enter') {
      // Your search functionality here
      console.log('Searching for:', searchTerm);
      fetchAll(searchTerm);
    }
  }}
        style={{
          width: showSearch ? '200px' : '0',
          opacity: showSearch ? 1 : 0,
          height: '20px',
          marginLeft: '8px',
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          color: '#111827',
          fontSize: '14px',
          outline: 'none',
          backgroundColor: 'white',
          transition: 'width 0.3s',
          overflow: 'hidden',
          pointerEvents: showSearch ? 'auto' : 'none'
          
        }}
      />
      
    <button
      onClick={() => {
        setShowSearch(!showSearch);
      setTimeout(() => {
            if (!showSearch) {
              searchInputRef.current?.focus();
            }
          }, 0);}}
      style={{
        backgroundColor: '#474747ff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      <Search size={18} />
    </button>
  </div>

  {/* Analytics Button */}
  <button
    style={{
      backgroundColor: '#e5e7eb',
      color: '#111827',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '500',
      transition: 'all 0.2s',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d1d5db')}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
    onClick={() => console.log('Analytics clicked')}
  >
    <ChartSpline size={18} />
  </button>

  {/* Reaction Time Button */}
  <button
    style={{
      backgroundColor: '#f9ffa6',
      color: '#111827',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '500',
      transition: 'all 0.2s',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f39f')}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f9ffa6')}
    onClick={() => console.log('Reaction Time clicked')}
  >
   <AlarmClock size={18} />
  </button>
</div>
        </div>


       {loading && <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
      </div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {leads.map((lead) => (
            <LeadItem
              key={lead.id}
              lead={lead}
              setterMap={setterMap}
              closerMap={closerMap}
              mode='full'
            />
          ))}
        </div>
      </div>
    </div>
  );
}