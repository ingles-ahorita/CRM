import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, ChevronRight, Plus, Calendar, Edit2, Trash2, Pencil, Globe } from 'lucide-react';
import ScheduleGrid from './components/ScheduleGrid';
import ScheduleForm from './components/ScheduleForm';

export default function SchedulePage() {
  const [setters, setSetters] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Get Monday of current week
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isDateOverrideMode, setIsDateOverrideMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTimezone, setSelectedTimezone] = useState(() => {
    return localStorage.getItem('scheduleTimezone') || 'Europe/Madrid';
  });

  useEffect(() => {
    fetchSetters();
    fetchSchedules();
  }, [currentWeekStart, selectedTimezone]);

  useEffect(() => {
    localStorage.setItem('scheduleTimezone', selectedTimezone);
  }, [selectedTimezone]);

  const timezoneOptions = [
    { value: 'Europe/Madrid', label: 'Spain (Europe/Madrid)' },
    { value: 'America/New_York', label: 'US Eastern (America/New_York)' },
    { value: 'America/Los_Angeles', label: 'US Pacific (America/Los_Angeles)' },
    { value: 'Europe/London', label: 'UK (Europe/London)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'local', label: 'Browser Local Time' }
  ];

  const fetchSetters = async () => {
    try {
      const { data, error } = await supabase
        .from('setters')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSetters(data || []);
    } catch (err) {
      console.error('Error fetching setters:', err);
      setError('Failed to load setters');
    }
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      
      // Calculate week dates (Monday to Sunday)
      const weekDates = getWeekDates(currentWeekStart);
      
      // Fetch recurring schedules (day_of_week is not null, specific_date is null)
      const { data: recurringData, error: recurringError } = await supabase
        .from('setter_schedules')
        .select(`
          *,
          setters (id, name)
        `)
        .is('specific_date', null);

      if (recurringError) throw recurringError;

      // Fetch date-specific overrides for this week
      const { data: overrideData, error: overrideError } = await supabase
        .from('setter_schedules')
        .select(`
          *,
          setters (id, name)
        `)
        .not('specific_date', 'is', null)
        .gte('specific_date', formatDateLocal(weekDates[0]))
        .lte('specific_date', formatDateLocal(weekDates[6]));

      if (overrideError) throw overrideError;

      setSchedules([...(recurringData || []), ...(overrideData || [])]);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const getWeekDates = (mondayDate) => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(mondayDate);
      date.setDate(mondayDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Helper function to format date as YYYY-MM-DD in specified timezone
  const formatDateInTimezone = (date, timezone) => {
    if (timezone === 'local') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Convert date to the specified timezone
    const dateStr = date.toLocaleDateString('en-CA', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return dateStr; // Returns YYYY-MM-DD format
  };

  // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion) - kept for backward compatibility
  const formatDateLocal = (date) => {
    return formatDateInTimezone(date, selectedTimezone);
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(newDate);
  };

  const handleScheduleSaved = () => {
    fetchSchedules();
    setIsFormOpen(false);
    setEditingSchedule(null);
    setIsDateOverrideMode(false);
    setSelectedDate(null);
  };

  const handleEditSchedule = (schedule, dateForOverride = null) => {
    setEditingSchedule(schedule);
    setIsDateOverrideMode(schedule.specific_date !== null);
    // If editing a recurring schedule, use the provided date for override option
    setSelectedDate(schedule.specific_date ? new Date(schedule.specific_date) : (dateForOverride ? new Date(dateForOverride) : null));
    setIsFormOpen(true);
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const { error } = await supabase
        .from('setter_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      fetchSchedules();
    } catch (err) {
      console.error('Error deleting schedule:', err);
      alert('Failed to delete schedule');
    }
  };

  const formatWeekRange = () => {
    const weekDates = getWeekDates(currentWeekStart);
    const start = weekDates[0];
    const end = weekDates[6];
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (loading && schedules.length === 0) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f9fafb', 
        padding: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading schedules...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f9fafb', 
        padding: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ fontSize: '18px', color: '#dc2626' }}>Error: {error}</div>
      </div>
    );
  }

  const weekDates = getWeekDates(currentWeekStart);

  // Filter date overrides (schedules with specific_date)
  const dateOverrides = schedules.filter(schedule => schedule.specific_date !== null);
  
  // Sort by date
  const sortedOverrides = [...dateOverrides].sort((a, b) => {
    return a.specific_date.localeCompare(b.specific_date);
  });

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    
    if (selectedTimezone === 'local') {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      timeZone: selectedTimezone
    });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h1 style={{ 
                fontSize: '28px', 
                fontWeight: 'bold', 
                color: '#111827', 
                marginBottom: '8px' 
              }}>
                Setter Schedule Management
              </h1>
              <p style={{ color: '#6b7280', fontSize: '16px' }}>
                Manage weekly recurring schedules and date-specific overrides
              </p>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px'
            }}>
              <Globe size={18} color="#6b7280" />
              <label style={{ 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151' 
              }}>
                Timezone:
              </label>
              <select
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#111827',
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.2s',
                  minWidth: '200px'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f46e5';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                {timezoneOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Week Navigation */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '24px',
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => navigateWeek('prev')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <ChevronLeft size={20} color="#374151" />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Calendar size={20} color="#6b7280" />
              <span style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                {formatWeekRange()}
              </span>
            </div>

            <button
              onClick={() => navigateWeek('next')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <ChevronRight size={20} color="#374151" />
            </button>

            <button
              onClick={() => {
                const today = new Date();
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(today.setDate(diff));
                monday.setHours(0, 0, 0, 0);
                setCurrentWeekStart(monday);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              Today
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setIsDateOverrideMode(false);
                setEditingSchedule(null);
                setSelectedDate(null);
                setIsFormOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#4f46e5',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#4338ca';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#4f46e5';
              }}
            >
              <Plus size={18} />
              Add Recurring Schedule
            </button>

            <button
              onClick={() => {
                setIsDateOverrideMode(true);
                setEditingSchedule(null);
                setSelectedDate(null);
                setIsFormOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #4f46e5',
                backgroundColor: 'white',
                color: '#4f46e5',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#eef2ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <Plus size={18} />
              Add Date Override
            </button>
          </div>
        </div>

        {/* Main Content Area - Grid and Sidebar */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Schedule Grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScheduleGrid
            weekDates={weekDates}
            schedules={schedules}
            setters={setters}
            onEditSchedule={handleEditSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            timezone={selectedTimezone}
          />
        </div>

          {/* Date Overrides Sidebar */}
          <div style={{ 
            width: '320px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #e5e7eb',
            padding: '20px',
            position: 'sticky',
            top: '24px',
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ 
                fontSize: '18px', 
                fontWeight: '600', 
                color: '#111827',
                marginBottom: '4px'
              }}>
                Date Overrides
              </h2>
              <p style={{ 
                fontSize: '13px', 
                color: '#6b7280',
                margin: 0
              }}>
                {sortedOverrides.length} override{sortedOverrides.length !== 1 ? 's' : ''} this week
              </p>
            </div>

            {sortedOverrides.length === 0 ? (
              <div style={{ 
                padding: '32px 16px', 
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                No date overrides for this week
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortedOverrides.map((override) => {
                  const isOvernight = override.end_time <= override.start_time;
                  return (
                    <div
                      key={override.id}
                      style={{
                        padding: '12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start',
                        marginBottom: '8px'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#111827',
                            marginBottom: '4px'
                          }}>
                            {formatDateDisplay(override.specific_date)}
                          </div>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: '500', 
                            color: '#374151',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            {override.setters?.name || 'Unknown Setter'}
                            <Pencil size={14} color="#6b7280" />
                          </div>
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#6b7280',
                            marginTop: '4px'
                          }}>
                            {formatTime(override.start_time)} - {formatTime(override.end_time)}
                            {isOvernight && (
                              <span style={{ 
                                fontSize: '11px', 
                                color: '#9ca3af',
                                fontStyle: 'italic',
                                marginLeft: '4px'
                              }}>
                                (overnight)
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                          <button
                            onClick={() => handleEditSchedule(override)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              padding: 0
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                              e.currentTarget.style.borderColor = '#9ca3af';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.borderColor = '#d1d5db';
                            }}
                            title="Edit override"
                          >
                            <Edit2 size={14} color="#6b7280" />
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(override.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              border: '1px solid #dc2626',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              padding: 0
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#b91c1c';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'white';
                              e.currentTarget.style.borderColor = '#dc2626';
                            }}
                            title="Delete override"
                          >
                            <Trash2 size={14} color="#dc2626" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Schedule Form Modal */}
        {isFormOpen && (
          <ScheduleForm
            isOpen={isFormOpen}
            onClose={() => {
              setIsFormOpen(false);
              setEditingSchedule(null);
              setIsDateOverrideMode(false);
              setSelectedDate(null);
            }}
            setters={setters}
            editingSchedule={editingSchedule}
            isDateOverrideMode={isDateOverrideMode}
            selectedDate={selectedDate}
            weekDates={weekDates}
            existingSchedules={schedules}
            onSave={handleScheduleSaved}
          />
        )}
      </div>
    </div>
  );
}

