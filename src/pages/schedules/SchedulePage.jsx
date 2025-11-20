import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react';
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

  useEffect(() => {
    fetchSetters();
    fetchSchedules();
  }, [currentWeekStart]);

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
        .gte('specific_date', weekDates[0].toISOString().split('T')[0])
        .lte('specific_date', weekDates[6].toISOString().split('T')[0]);

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
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

        {/* Schedule Grid */}
        <ScheduleGrid
          weekDates={weekDates}
          schedules={schedules}
          setters={setters}
          onEditSchedule={handleEditSchedule}
          onDeleteSchedule={handleDeleteSchedule}
        />

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

