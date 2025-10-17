import { Search, ChartSpline, AlarmClock, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import { act, useRef, useState } from 'react';




export default function Header({ state, setState, mode = 'full' }) {
    const searchInputRef = useRef(null);
    const [on, setOn] = useState(false);

    const toggleFilter = (filterName) => {
  setState(prev => ({
    ...prev,
    filters: {
      ...prev.filters,
      [filterName]: !prev.filters[filterName]
    }
  }));
};

const updateHeaderState = (updates) => {
  setState(prev => ({ ...prev, ...updates }));
};



    const { showSearch, searchTerm, activeTab, sortBy, sortOrder, filters } = state;
    return (
        <div style={{ marginBottom: '24px' }}>

          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            marginBottom: '16px',
            borderBottom: '2px solid #e5e7eb'
          }}>
            {['yesterday', 'today', 'tomorrow', 'all'].filter(tab => !(mode==='setter' && tab === 'tomorrow'))
            .map(tab => (
              <button
                key={tab}
                onClick={() => {
                    updateHeaderState({ 
                      activeTab: tab, 
                      searchTerm: '', 
                      showSearch: false 
                    });

                    if(tab === 'tomorrow'){
                      updateHeaderState({ sortBy: 'call_date'})
                    }
                  }}
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

    {(mode === 'full') && (<>

{(activeTab !== "tomorrow") && (
      
    <div
      onClick={() =>{
        setOn(!on)
        updateHeaderState({ sortBy: sortBy === 'book_date' ? 'call_date' : 'book_date'});
      }}
      style={{
        width: '50px',
        height: '28px',
        borderRadius: '20px',
        backgroundColor: on ? '#d1d5db' : '#d1d5db',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          left: on ? '26px' : '3px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.2s'
        }}
      />
    </div> )}

  {/* Date type toggle */}
  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', color: '#111827' }}>
    <Calendar size={16} />
    {sortBy === 'book_date' ? 'Book Date' : 'Call Date'}
  </span> </>
)}

  {/* Sort order toggle */}
  <button
    onClick={() => {
        updateHeaderState({ sortOrder: sortOrder === 'desc' ? 'asc' : 'desc' });
        console.log('Sorting order:', sortOrder);}}
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
  </button>

  <h3 style={{
    fontSize: '13px',
    color: '#6b7280'
  }}>{sortOrder === 'asc'  ? ((sortBy === "call_date") ? 'Earliest first' : 'Oldest first' ): (sortBy === "call_date") ?'Latest first' :  'Newest first'}
    </h3>
</div>

{(mode === 'full') && (

<div style={{
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
  flexWrap: 'wrap'
}}>
  <FilterButton
    label="Confirmed"
    active={filters.confirmed}
    onClick={() => toggleFilter('confirmed')}
  />
  
  <FilterButton
    label="Cancelled"
    active={filters.cancelled}
    onClick={() => toggleFilter('cancelled')}
  />
  
  <FilterButton
    label="No Show"
    active={filters.noShow}
    onClick={() => toggleFilter('noShow')}
  />

    <FilterButton
    label="No Pick up"
    active={filters.noPickUp}
    onClick={() => toggleFilter('noPickUp')}
  />
</div>)}


  {/* Search Icon + Input */}
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>

          <input
          ref={searchInputRef}
        type="text"
        placeholder="Search lead..."
        defaultValue={searchTerm}
        onKeyDown={(e) => {
    if (e.key === 'Enter') {
            updateHeaderState({
              searchTerm: e.target.value,
              activeTab: 'all'
            });
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
        updateHeaderState({ showSearch: !showSearch });
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
        display: mode === 'full' ? 'flex' : 'none',
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
    onClick={() => window.open('/analytics', '_blank')}
  >
    <ChartSpline size={18} />
  </button>

  {/* Reaction Time Button */}

  <button
    style={{
    display: mode === 'full' ? 'flex' : 'none',
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
    onClick={() => window.open('https://www.inglesahorita.com/call-reaction-time', '_blank')}
  >
   <AlarmClock size={18} />
  </button>
</div>
        </div>
    )
}

const FilterButton = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        backgroundColor: active ? '#4f46e5' : '#f3f4f6',
        color: active ? 'white' : '#6b7280',
        border: active ? '2px solid #4338ca' : '2px solid #e5e7eb',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#e5e7eb';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
        }
      }}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  );
};
