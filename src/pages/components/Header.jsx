import { Search, ChartSpline, AlarmClock, ArrowUp, ArrowDown, Calendar, LogOut, Clock, Play, Users, Filter } from 'lucide-react';
import { act, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';





const defaultHeaderState = {
  showSearch: false,
  searchTerm: '',
  activeTab: 'today',
  sortBy: 'book_date',
  sortOrder: 'desc',
  startDate: '',
  endDate: '',
  setterFilter: '',
  closerFilter: '',
  filters: {},
};

const FilterButton = ({ label, active, onClick }) => (
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
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
  >
    {active ? '✓ ' : ''}{label}
  </button>
);

/** Panel shown when user clicks Filter: date range, setter/closer, and status filter toggles. */
function FilterPanel({ state, setState, mode = 'full' }) {
  const safeState = state ?? defaultHeaderState;
  const { activeTab, startDate, endDate, setterFilter, closerFilter, filters, sortBy } = safeState;
  const update = (updates) => setState && setState(prev => ({ ...prev, ...updates }));
  const toggleFilter = (filterName) => setState && setState(prev => ({
    ...prev,
    filters: { ...prev.filters, [filterName]: !prev.filters[filterName] }
  }));
  return (
    <div style={{
      marginTop: '12px',
      marginBottom: '12px',
      padding: '16px',
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {(activeTab === 'all' || activeTab === 'follow ups') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Date range</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>Start</label>
            <input
              type="date"
              value={startDate || ''}
              onChange={(e) => update({ startDate: e.target.value })}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>End</label>
            <input
              type="date"
              value={endDate || ''}
              onChange={(e) => update({ endDate: e.target.value })}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
        </div>
      )}
      {mode === 'full' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>People</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Setter:</label>
            <select
              value={setterFilter || ''}
              onChange={(e) => update({ setterFilter: e.target.value || '' })}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: 'white', minWidth: '120px' }}
            >
              <option value="">All Setters</option>
              {safeState.setterMap && Object.entries(safeState.setterMap).map(([id, name]) => (
                <option key={`setter-${id}`} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Closer:</label>
            <select
              value={closerFilter || ''}
              onChange={(e) => update({ closerFilter: e.target.value || '' })}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: 'white', minWidth: '120px' }}
            >
              <option value="">All Closers</option>
              {safeState.closerMap && Object.entries(safeState.closerMap).map(([id, name]) => (
                <option key={`closer-${id}`} value={id}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Status</span>
        {(mode === 'full') && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <FilterButton label="Confirmed" active={filters.confirmed} onClick={() => toggleFilter('confirmed')} />
            <FilterButton label="Cancelled" active={filters.cancelled} onClick={() => toggleFilter('cancelled')} />
            <FilterButton label="No Show" active={filters.noShow} onClick={() => toggleFilter('noShow')} />
            <FilterButton label="No Pick up" active={filters.noPickUp} onClick={() => toggleFilter('noPickUp')} />
            <FilterButton label="Reschedule" active={filters.rescheduled} onClick={() => toggleFilter('rescheduled')} />
            <FilterButton label="Transfered" active={filters.transferred} onClick={() => toggleFilter('transferred')} />
            <FilterButton label="Purchased" active={filters.purchased} onClick={() => { toggleFilter('purchased'); update({ sortBy: sortBy === 'purchased_at' ? 'book_date' : 'purchased_at' }); }} />
            <FilterButton label="Lock In" active={filters.lockIn} onClick={() => toggleFilter('lockIn')} />
            <FilterButton label="No ManyChat ID" active={filters.noManychatId} onClick={() => toggleFilter('noManychatId')} />
          </div>
        )}
        {(mode === 'setter') && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <FilterButton label="Transfered" active={filters.transferred} onClick={() => toggleFilter('transferred')} />
            <FilterButton label="No ManyChat ID" active={filters.noManychatId} onClick={() => toggleFilter('noManychatId')} />
          </div>
        )}
        {(mode === 'closer') && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <FilterButton label="No ManyChat ID" active={filters.noManychatId} onClick={() => toggleFilter('noManychatId')} />
            <FilterButton label="Lock In" active={filters.lockIn} onClick={() => toggleFilter('lockIn')} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Tabs (yesterday, today, all, etc.) only. Date range and setter/closer are in FilterPanel. */
export function HeaderTabs({ state, setState, mode = 'full' }) {
  const safeState = state ?? defaultHeaderState;
  const { activeTab, startDate, endDate } = safeState;
  const update = (updates) => setState && setState(prev => ({ ...prev, ...updates }));
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e5e7eb', flexWrap: 'wrap', alignItems: 'center' }}>
      {['yesterday', 'today', 'tomorrow', 'tomorrow + 1', 'follow ups', 'all'].filter(tab => !(mode === 'setter' && tab === 'tomorrow'))
        .map(tab => (
          <button
            key={tab}
            onClick={() => {
              const shouldClearDates = tab !== 'all' && tab !== 'follow ups' && activeTab !== 'all' && activeTab !== 'follow ups';
              update({
                activeTab: tab,
                searchTerm: '',
                showSearch: false,
                startDate: shouldClearDates ? '' : (tab === 'all' || tab === 'follow ups' ? startDate : ''),
                endDate: shouldClearDates ? '' : (tab === 'all' || tab === 'follow ups' ? endDate : ''),
                setterFilter: '',
                closerFilter: ''
              });
              if (tab === 'tomorrow') update({ sortBy: 'call_date' });
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
            onMouseEnter={(e) => { if (activeTab !== tab) e.currentTarget.style.color = '#111827'; }}
            onMouseLeave={(e) => { if (activeTab !== tab) e.currentTarget.style.color = '#6b7280'; }}
          >
            {tab}
          </button>
        ))}
    </div>
  );
}

/** Order (sort by + asc/desc) + optional Filter button + Search. Filter toggles live in FilterPanel. */
function HeaderOrderAndFilters({ state, setState, mode = 'full', filterPanelOpen, onFilterToggle }) {
  const searchInputRef = useRef(null);
  const safeState = state ?? defaultHeaderState;
  const { activeTab, sortBy, sortOrder, showSearch = false, searchTerm } = safeState;
  const update = (updates) => setState && setState(prev => ({ ...prev, ...updates }));
  const on = sortBy === 'call_date';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', marginTop: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {(mode === 'full') && (activeTab !== 'tomorrow' && activeTab !== 'tomorrow + 1' && sortBy !== 'purchased_at') && (
          <>
            <div
              onClick={() => update({ sortBy: sortBy === 'book_date' ? 'call_date' : 'book_date' })}
              style={{
                width: '50px',
                height: '28px',
                borderRadius: '20px',
                backgroundColor: '#d1d5db',
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
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', color: '#111827' }}>
              <Calendar size={16} />
              {sortBy === 'book_date' ? 'Book Date' : sortBy === 'purchased_at' ? 'Purchase Date' : 'Call Date'}
            </span>
          </>
        )}
        <button
          onClick={() => update({ sortOrder: sortOrder === 'desc' ? 'asc' : 'desc' })}
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
        <h3 style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          {sortOrder === 'asc' ? ((sortBy === 'call_date') ? 'Earliest first' : 'Oldest first') : (sortBy === 'call_date') ? 'Latest first' : 'Newest first'}
        </h3>
        {onFilterToggle != null && (
          <button
            onClick={onFilterToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: filterPanelOpen ? '#4f46e5' : '#f3f4f6',
              color: filterPanelOpen ? 'white' : '#111827',
              border: `1px solid ${filterPanelOpen ? '#4338ca' : '#d1d5db'}`,
              borderRadius: '6px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '13px',
              outline: 'none',
              flexShrink: 0
            }}
            onMouseEnter={(e) => { if (!filterPanelOpen) e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
            onMouseLeave={(e) => { if (!filterPanelOpen) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
          >
            <Filter size={16} />
            Filters
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search lead..."
            defaultValue={searchTerm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update({ searchTerm: e.target.value, activeTab: 'all' });
            }}
            style={{
              width: showSearch ? 200 : 0,
              opacity: showSearch ? 1 : 0,
              height: 32,
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              color: '#111827',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white',
              transition: 'width 0.2s',
              overflow: 'hidden',
              pointerEvents: showSearch ? 'auto' : 'none'
            }}
          />
          <button
            onClick={() => {
              update({ showSearch: !showSearch });
              setTimeout(() => { if (!showSearch) searchInputRef.current?.focus(); }, 0);
            }}
            style={{
              backgroundColor: '#474747',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              flexShrink: 0
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <Search size={18} />
          </button>
        </div>
      </div>
    </>
  );
}

/** Tabs + order + Filter button + FilterPanel for rendering below the cards on Closer/Setter. */
export function HeaderTabsAndToolbar({ state, setState, mode = 'full' }) {
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  return (
    <div style={{ marginTop: '24px' }}>
      <HeaderTabs state={state} setState={setState} mode={mode} />
      <HeaderOrderAndFilters
        state={state}
        setState={setState}
        mode={mode}
        filterPanelOpen={showFilterPanel}
        onFilterToggle={() => setShowFilterPanel(s => !s)}
      />
      <div
        style={{
          overflow: 'hidden',
          maxHeight: showFilterPanel ? 800 : 0,
          opacity: showFilterPanel ? 1 : 0,
          transition: 'max-height 0.35s ease-out, opacity 0.25s ease-out',
          marginTop: showFilterPanel ? 0 : -8,
          marginBottom: showFilterPanel ? 0 : -8,
        }}
      >
        <FilterPanel state={state} setState={setState} mode={mode} />
      </div>
    </div>
  );
}

export default function Header({ state, setState, mode = 'full', hideTabs = false }) {
   const navigate = useNavigate();
    const searchInputRef = useRef(null);
    const [on, setOn] = useState(false);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

  const hasState = state != null && setState != null;
  const safeState = state ?? defaultHeaderState;

      const logout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

    const toggleFilter = (filterName) => {
  if (!setState) return;
  setState(prev => ({
    ...prev,
    filters: {
      ...prev.filters,
      [filterName]: !prev.filters[filterName]
    }
  }));
};

const updateHeaderState = (updates) => {
  if (!setState) return;
  setState(prev => ({ ...prev, ...updates }));
};

    const { showSearch, searchTerm, activeTab, sortBy, sortOrder, filters, startDate, endDate, setterFilter, closerFilter } = safeState;
    return (
        <div style={{ marginBottom: '24px' }}>

          <button 
        onClick={logout}
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        }}
      >
        <LogOut size={18} />
      </button>

          {hasState && (
          <>
          {!hideTabs && <HeaderTabs state={state} setState={setState} mode={mode} />}

          {/* Toolbar: left = order + Filters + Search, right = Metrics + End Shift (+ Shifts, Reaction Time) */}
          {!hideTabs && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexShrink: 0 }}>
                    {(mode === 'full') && (<>
                      {(activeTab !== 'tomorrow' && activeTab !== 'tomorrow + 1' && sortBy !== 'purchased_at') && (
                        <div
                          onClick={() => { setOn(!on); updateHeaderState({ sortBy: sortBy === 'book_date' ? 'call_date' : 'book_date' }); }}
                          style={{ width: '50px', height: '28px', borderRadius: '20px', backgroundColor: '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s' }}
                        >
                          <div style={{ position: 'absolute', top: '3px', left: on ? '26px' : '3px', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
                        </div>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', color: '#111827' }}>
                        <Calendar size={16} />
                        {sortBy === 'book_date' ? 'Book Date' : sortBy === 'purchased_at' ? 'Purchase Date' : 'Call Date'}
                      </span>
                    </>)}
                    <button
                      onClick={() => updateHeaderState({ sortOrder: sortOrder === 'desc' ? 'asc' : 'desc' })}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', fontSize: '13px', transition: 'all 0.2s', outline: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                    >
                      {sortOrder === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
                    </button>
                    <h3 style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{sortOrder === 'asc' ? ((sortBy === 'call_date') ? 'Earliest first' : 'Oldest first') : (sortBy === 'call_date') ? 'Latest first' : 'Newest first'}</h3>
                    <button
                      onClick={() => setShowFilterPanel(s => !s)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        backgroundColor: showFilterPanel ? '#4f46e5' : '#f3f4f6',
                        color: showFilterPanel ? 'white' : '#111827',
                        border: `1px solid ${showFilterPanel ? '#4338ca' : '#d1d5db'}`,
                        borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', fontSize: '13px', outline: 'none'
                      }}
                      onMouseEnter={(e) => { if (!showFilterPanel) e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                      onMouseLeave={(e) => { if (!showFilterPanel) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                    >
                      <Filter size={16} />
                      Filters
                    </button>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search lead..."
                      defaultValue={searchTerm}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateHeaderState({ searchTerm: e.target.value, activeTab: 'all' });
                        }
                      }}
                      style={{
                        width: showSearch ? '200px' : '0',
                        opacity: showSearch ? 1 : 0,
                        height: '20px',
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
                        setTimeout(() => { if (!showSearch) searchInputRef.current?.focus(); }, 0);
                      }}
                      style={{
                        backgroundColor: '#474747ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px',
                        cursor: 'pointer',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                  <button
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#e5e7eb', color: '#111827', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d1d5db')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                    onClick={() => navigate(mode === 'full' ? '/metrics' : mode === 'setter' ? `/stats/${state.currentSetter}` : `/closer-stats/${state.currentCloser}`)}
                  >
                    <ChartSpline size={18} />
                  </button>
                  {mode === 'full' && (
                    <>
                      <button
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#c7d2fe')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#e0e7ff')}
                        onClick={() => navigate('/shifts')}
                      >
                        <Users size={18} />
                        Shifts
                      </button>
                      <button
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f9ffa6', color: '#111827', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f39f')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f9ffa6')}
                        onClick={() => window.open('https://www.inglesahorita.com/call-reaction-time', '_blank')}
                      >
                        <AlarmClock size={18} />
                      </button>
                    </>
                  )}
                  {(mode === 'setter' || mode === 'closer') && (
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        backgroundColor: state.isShiftActive ? '#fef3c7' : '#dcfce7',
                        color: state.isShiftActive ? '#92400e' : '#166534',
                        border: state.isShiftActive ? '1px solid #f59e0b' : '1px solid #22c55e',
                        borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s', fontSize: '13px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = state.isShiftActive ? '#fde68a' : '#bbf7d0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = state.isShiftActive ? '#fef3c7' : '#dcfce7'; }}
                      onClick={() => {
                        if (state.isShiftActive && state.onEndShift) state.onEndShift();
                        else if (!state.isShiftActive && state.onStartShift) state.onStartShift();
                      }}
                    >
                      {state.isShiftActive ? <Clock size={18} /> : <Play size={18} />}
                      {state.isShiftActive ? 'End Shift' : 'Start Shift'}
                    </button>
                  )}
                </div>
              </div>
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: showFilterPanel ? 800 : 0,
                  opacity: showFilterPanel ? 1 : 0,
                  transition: 'max-height 0.35s ease-out, opacity 0.25s ease-out',
                  marginTop: showFilterPanel ? 0 : -8,
                  marginBottom: showFilterPanel ? 0 : -8,
                }}
              >
                <FilterPanel state={state} setState={setState} mode={mode} />
              </div>
            </>
          )}

          {/* When hideTabs (Closer/Setter): Search is in HeaderTabsAndToolbar next to Filters; here only right-side buttons */}
          {hideTabs && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', width: '100%', marginTop: '12px' }}>
                <button
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#e5e7eb', color: '#111827', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d1d5db')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                  onClick={() => navigate(mode === 'full' ? '/metrics' : mode === 'setter' ? `/stats/${state.currentSetter}` : `/closer-stats/${state.currentCloser}`)}
                >
                  <ChartSpline size={18} />
                </button>
                {(mode === 'setter' || mode === 'closer') && (
                  <button
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      backgroundColor: state.isShiftActive ? '#fef3c7' : '#dcfce7',
                      color: state.isShiftActive ? '#92400e' : '#166534',
                      border: state.isShiftActive ? '1px solid #f59e0b' : '1px solid #22c55e',
                      borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s', fontSize: '13px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = state.isShiftActive ? '#fde68a' : '#bbf7d0'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = state.isShiftActive ? '#fef3c7' : '#dcfce7'; }}
                    onClick={() => {
                      if (state.isShiftActive && state.onEndShift) state.onEndShift();
                      else if (!state.isShiftActive && state.onStartShift) state.onStartShift();
                    }}
                  >
                    {state.isShiftActive ? <Clock size={18} /> : <Play size={18} />}
                    {state.isShiftActive ? 'End Shift' : 'Start Shift'}
                  </button>
                )}
            </div>
          )}
        </>
          )}
        </div>
    )
}
