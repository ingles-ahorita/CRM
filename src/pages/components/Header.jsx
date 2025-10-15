import { Search, ChartSpline, AlarmClock, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import { useRef } from 'react';




export default function Header({setActiveTab, setSearchTerm, setShowSearch, setSortBy, setSortOrder, activeTab, showSearch, searchTerm, sortBy, sortOrder, mode}) {
     const searchInputRef = useRef(null);
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
                  setActiveTab(tab);
                  setSearchTerm('');
                setShowSearch(false);}
                }
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
    onClick={() => {
        setSortBy(sortBy === 'book_date' ? 'call_date' : 'book_date');
        console.log('Sorting by:', sortBy);}}  
    style={{
      display: mode === 'full'? 'flex': 'none',
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
    onClick={() => {
        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
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
  }}>{sortOrder === 'desc' ? 'Oldest first' : 'Newest first'}
    </h3>
</div>


  {/* Search Icon + Input */}
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>

          <input
          onChange={(e) => setSearchTerm(e.target.value)}
          ref={searchInputRef}
        type="text"
        placeholder="Search lead..."
        value={searchTerm}
        onKeyDown={(e) => {
    if (e.key === 'Enter') {
      // Your search functionality here
      console.log('Searching for:', searchTerm);
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
    onClick={() => console.log('Analytics clicked')}
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
    onClick={() => console.log('Reaction Time clicked')}
  >
   <AlarmClock size={18} />
  </button>
</div>
        </div>
    )
}