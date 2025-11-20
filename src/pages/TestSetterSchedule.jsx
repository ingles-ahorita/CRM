import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCurrentSetterOnShift } from '../utils/getCurrentSetter';

export default function TestSetterSchedule() {
  const [currentSetterOnShift, setCurrentSetterOnShift] = useState(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [customTime, setCustomTime] = useState('14:00');
  const [setterForTime, setSetterForTime] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Function to get current time in Spain timezone
  const getSpainTimeString = () => {
    const now = new Date();
    const spainTime = now.toLocaleString('en-US', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return spainTime;
  };

  useEffect(() => {
    fetchCurrentSetterOnShift();
    // Update current time immediately
    setCurrentTime(getSpainTimeString());
    // Update current time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(getSpainTimeString());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  const fetchCurrentSetterOnShift = async () => {
    setLoadingShift(true);
    try {
      const setter = await getCurrentSetterOnShift();
      setCurrentSetterOnShift(setter);
    } catch (err) {
      console.error('Error fetching current setter on shift:', err);
    } finally {
      setLoadingShift(false);
    }
  };

  const getSetterForDateTime = async () => {
    if (!customDate || !customTime) {
      alert('Please select both date and time');
      return;
    }

    setLoadingSchedule(true);
    setSetterForTime(null); 

    try {
      // Convert date to day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
      const dateObj = new Date(customDate);
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.
      
      // Format time for database (HH:MM:SS)
      const timeStr = customTime + ':00';

      const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        return hours * 60 + minutes;
      };

      // Helper function to check if time falls within schedule range (handles overnight shifts)
      // For overnight shifts, we need to know if we're checking the start day or end day
      const timeInRange = (timeToCheck, startTime, endTime, isStartDay = true) => {
        const checkMinutes = timeToMinutes(timeToCheck);
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        const isOvernight = endMinutes <= startMinutes;
        
        if (isOvernight) {
          if (isStartDay) {
            // On start day: only match if time >= start (e.g., 22:00-23:59)
            return checkMinutes >= startMinutes;
          } else {
            // On end day (next day): only match if time <= end (e.g., 00:00-02:00)
            return checkMinutes <= endMinutes;
          }
        } else {
          // Same-day shift: time is in range if >= start AND <= end
          return checkMinutes >= startMinutes && checkMinutes <= endMinutes;
        }
      };

      // Calculate previous and next day for overnight shift checking (using local date to avoid timezone issues)
      const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const prevDate = new Date(customDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = formatDateLocal(prevDate); // YYYY-MM-DD format
      
      const nextDate = new Date(customDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = formatDateLocal(nextDate); // YYYY-MM-DD format

      // First, check for date-specific overrides on the selected date (start day)
      const { data: overrideSchedules, error: overrideError } = await supabase
        .from('setter_schedules')
        .select(`
          *,
          setters (
            id,
            name
          )
        `)
        .eq('specific_date', customDate)
        .not('specific_date', 'is', null);

      if (overrideError) {
        console.error('Error fetching override schedule:', overrideError);
      }

      // Also check for date-specific overrides on the previous day (for overnight shifts ending today)
      const { data: prevDayOverrideSchedules, error: prevDayOverrideError } = await supabase
        .from('setter_schedules')
        .select(`
          *,
          setters (
            id,
            name
          )
        `)
        .eq('specific_date', prevDateStr)
        .not('specific_date', 'is', null);

      if (prevDayOverrideError) {
        console.error('Error fetching previous day override schedule:', prevDayOverrideError);
      }

      // Filter overrides to find ones that cover the requested time
      let matchingOverride = null;
      
      console.log('=== Override Check Debug ===');
      console.log('Checking date:', customDate, 'Time:', timeStr);
      console.log('Today overrides count:', overrideSchedules?.length || 0);
      console.log('Previous day overrides count:', prevDayOverrideSchedules?.length || 0);
      
      // Check today's overrides (start day of overnight shifts)
      if (overrideSchedules && overrideSchedules.length > 0) {
        console.log('Checking today\'s overrides:');
        overrideSchedules.forEach(schedule => {
          const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
          const matches = timeInRange(timeStr, schedule.start_time, schedule.end_time, true);
          console.log(`  Schedule ${schedule.id}: ${schedule.start_time}-${schedule.end_time} (overnight: ${isOvernight}), matches: ${matches}`);
        });
        matchingOverride = overrideSchedules.find(schedule => {
          const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
          if (isOvernight) {
            // Overnight shift: on start day, only match if time >= start
            return timeInRange(timeStr, schedule.start_time, schedule.end_time, true);
          } else {
            // Same-day shift: match if time is between start and end
            return timeInRange(timeStr, schedule.start_time, schedule.end_time, true);
          }
        });
      }
      
      // If not found on start day, check previous day (for overnight shifts ending today)
      if (!matchingOverride && prevDayOverrideSchedules && prevDayOverrideSchedules.length > 0) {
        console.log('Checking previous day\'s overrides:');
        prevDayOverrideSchedules.forEach(schedule => {
          const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
          if (isOvernight) {
            const matches = timeInRange(timeStr, schedule.start_time, schedule.end_time, false);
            console.log(`  Schedule ${schedule.id}: ${schedule.start_time}-${schedule.end_time} (overnight), matches: ${matches}`);
          }
        });
        matchingOverride = prevDayOverrideSchedules.find(schedule => {
          const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
          if (isOvernight) {
            // This is an overnight shift that started yesterday, check if our time is in the end range
            return timeInRange(timeStr, schedule.start_time, schedule.end_time, false); // false = end day
          }
          return false;
        });
      }
      
      console.log('Final matching override:', matchingOverride);
      console.log('========================');

      // If no override found, check recurring schedules
      if (!matchingOverride) {
        const { data: recurringSchedules, error: recurringError } = await supabase
          .from('setter_schedules')
          .select(`
            *,
            setters (
              id,
              name
            )
          `)
          .eq('day_of_week', dayOfWeek)
          .is('specific_date', null);

        if (recurringError) {
          console.error('Error fetching recurring schedule:', recurringError);
          setLoadingSchedule(false);
          return;
        }

        if (recurringSchedules && recurringSchedules.length > 0) {
          // Filter to find ones that cover the requested time on the start day
          let matchingRecurring = recurringSchedules.filter(schedule =>
            timeInRange(timeStr, schedule.start_time, schedule.end_time, true) // true = start day
          );
          
          // If not found, check if it's an overnight shift from previous day
          if (matchingRecurring.length === 0) {
            // Check previous day's recurring schedule (for overnight shifts ending today)
            const prevDayOfWeek = (dayOfWeek - 1 + 7) % 7; // Wrap around
            const { data: prevDaySchedules, error: prevDayError } = await supabase
              .from('setter_schedules')
              .select(`
                *,
                setters (
                  id,
                  name
                )
              `)
              .eq('day_of_week', prevDayOfWeek)
              .is('specific_date', null);

            if (!prevDayError && prevDaySchedules) {
              matchingRecurring = prevDaySchedules.filter(schedule => {
                const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
                if (isOvernight) {
                  // This is an overnight shift from previous day, check if our time is in the end range
                  return timeInRange(timeStr, schedule.start_time, schedule.end_time, false); // false = end day
                }
                return false;
              });
            }
          }

          if (matchingRecurring.length > 0) {
            // Handle multiple matches - take the one that starts earliest
            const sorted = matchingRecurring.sort((a, b) => 
              a.start_time.localeCompare(b.start_time)
            );
            setSetterForTime({
              id: sorted[0].setters.id,
              name: sorted[0].setters.name,
              type: 'recurring',
              schedule: sorted[0]
            });
          } else {
            setSetterForTime(null);
          }
        } else {
          setSetterForTime(null);
        }
      } else {
        // Found date override
        setSetterForTime({
          id: matchingOverride.setters.id,
          name: matchingOverride.setters.name,
          type: 'date override',
          schedule: matchingOverride
        });
      }
    } catch (err) {
      console.error('Error getting setter for date/time:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  // Helper to format time
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', marginBottom: '32px' }}>
          Setter Schedule Test Page
        </h1>

        {/* Current Setter on Shift */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Current Setter on Shift
          </h2>
          
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '6px',
            fontSize: '14px',
            color: '#374151'
          }}>
            <strong style={{ color: '#111827' }}>Current Time (Spain):</strong>{' '}
            <span style={{ fontFamily: 'monospace', color: '#111827', fontWeight: '500' }}>
              {currentTime || 'Loading...'}
            </span>
          </div>
          
          {loadingShift ? (
            <div style={{ color: '#6b7280' }}>Loading...</div>
          ) : currentSetterOnShift ? (
            <div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#374151' }}>ID:</strong>{' '}
                <span style={{ color: '#111827', fontFamily: 'monospace' }}>{currentSetterOnShift.id}</span>
              </div>
              <div>
                <strong style={{ color: '#374151' }}>Name:</strong>{' '}
                <span style={{ color: '#111827', fontSize: '18px', fontWeight: '500' }}>
                  {currentSetterOnShift.name}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>No setter is currently on shift</div>
          )}
          
          <button
            onClick={fetchCurrentSetterOnShift}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
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
            Refresh
          </button>
        </div>

        {/* Get Setter for Specific Date/Time */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Get Setter for Specific Date/Time
          </h2>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                Date
              </label>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                Time
              </label>
              <input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                step="60"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            onClick={getSetterForDateTime}
            disabled={loadingSchedule}
            style={{
              padding: '10px 20px',
              backgroundColor: loadingSchedule ? '#9ca3af' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loadingSchedule ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loadingSchedule) {
                e.currentTarget.style.backgroundColor = '#4338ca';
              }
            }}
            onMouseLeave={(e) => {
              if (!loadingSchedule) {
                e.currentTarget.style.backgroundColor = '#4f46e5';
              }
            }}
          >
            {loadingSchedule ? 'Checking...' : 'Get Setter for This Time'}
          </button>

          {setterForTime && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0c4a6e', marginBottom: '12px' }}>
                Setter Scheduled:
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#0c4a6e' }}>ID:</strong>{' '}
                <span style={{ color: '#075985', fontFamily: 'monospace' }}>{setterForTime.id}</span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#0c4a6e' }}>Name:</strong>{' '}
                <span style={{ color: '#075985', fontSize: '18px', fontWeight: '500' }}>
                  {setterForTime.name}
                </span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#0c4a6e' }}>Type:</strong>{' '}
                <span style={{ color: '#075985', textTransform: 'capitalize' }}>
                  {setterForTime.type}
                </span>
              </div>
              {setterForTime.schedule && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '14px', color: '#075985' }}>
                    <strong>Schedule:</strong> {formatTime(setterForTime.schedule.start_time)} - {formatTime(setterForTime.schedule.end_time)}
                  </div>
                </div>
              )}
            </div>
          )}

          {setterForTime === null && !loadingSchedule && customDate && customTime && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b'
            }}>
              No setter scheduled for {new Date(customDate).toLocaleDateString()} at {formatTime(customTime)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

