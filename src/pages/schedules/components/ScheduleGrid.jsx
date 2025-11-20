import { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';

// Generate colors for setters
const generateColors = (count) => {
  const colors = [
    '#dbeafe', // light blue
    '#fce7f3', // light pink
    '#fef3c7', // light yellow
    '#d1fae5', // light green
    '#e9d5ff', // light purple
    '#fed7aa', // light orange
    '#fecaca', // light red
    '#cffafe', // light cyan
  ];
  
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
};

export default function ScheduleGrid({ weekDates, schedules, setters, onEditSchedule, onDeleteSchedule }) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  const setterColors = generateColors(setters.length);
  const setterColorMap = {};
  setters.forEach((setter, index) => {
    setterColorMap[setter.id] = setterColors[index];
  });

  // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion)
  const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Convert time string (HH:MM) to minutes since midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Convert minutes since midnight to time string
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const getDayOfWeek = (date) => {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday=0, Sunday=6
  };

  // Build a map of which setter is scheduled for each hour/day
  const buildScheduleMap = () => {
    const scheduleMap = {}; // { dayIndex_hour: { setterId, scheduleId, startTime, endTime } }
    
    schedules.forEach(schedule => {
      let dayIndex;
      
      if (schedule.specific_date) {
        // Date-specific override - find which day of the week it falls on
        // Use the date string directly, don't convert to Date object to avoid timezone issues
        const scheduleDateStr = schedule.specific_date; // Already in YYYY-MM-DD format
        dayIndex = weekDates.findIndex(d => {
          const dStr = formatDateLocal(d);
          return dStr === scheduleDateStr;
        });
        
        if (dayIndex === -1) return; // Not in this week
      } else {
        // Recurring schedule - convert from database format (0=Sunday) to grid format (0=Monday)
        // Database: 0=Sunday, 1=Monday, ..., 6=Saturday
        // Grid: 0=Monday, 1=Tuesday, ..., 6=Sunday
        const dbDay = schedule.day_of_week;
        dayIndex = dbDay === 0 ? 6 : dbDay - 1;
      }

      const startMinutes = timeToMinutes(schedule.start_time);
      const endMinutes = timeToMinutes(schedule.end_time);
      const isOvernight = endMinutes <= startMinutes; // End time is before or equal to start = overnight shift
      const effectiveEndMinutes = isOvernight ? endMinutes + (24 * 60) : endMinutes; // Add 24 hours if overnight
      
      // Mark each hour that this schedule covers
      for (let hour = 0; hour < 24; hour++) {
        const hourStartMinutes = hour * 60;
        const hourEndMinutes = (hour + 1) * 60;
        
        // Check if this hour overlaps with the schedule
        let overlaps = false;
        if (isOvernight) {
          // Overnight shift: on the start day, only show hours from start to 23:59
          // The end part (00:00 to end) will be shown on the next day
          overlaps = hourStartMinutes >= startMinutes;
        } else {
          // Same-day shift: normal overlap check
          overlaps = hourStartMinutes < effectiveEndMinutes && hourEndMinutes > startMinutes;
        }
        
        if (overlaps) {
          const key = `${dayIndex}_${hour}`;
          const isOverride = schedule.specific_date !== null;
          
          // Priority: Date-specific overrides always take priority over recurring schedules
          if (!scheduleMap[key]) {
            // No existing schedule, add this one
            scheduleMap[key] = {
              setterId: schedule.setter_id,
              setterName: schedule.setters?.name || 'Unknown',
              scheduleId: schedule.id,
              startTime: schedule.start_time,
              endTime: schedule.end_time,
              isOverride: isOverride,
              isOvernight: isOvernight,
              schedule: schedule, // Store full schedule object
              date: schedule.specific_date || formatDateLocal(weekDates[dayIndex]) // Date for this occurrence
            };
          } else {
            // There's already a schedule in this slot
            const existingIsOverride = scheduleMap[key].isOverride;
            
            if (isOverride && !existingIsOverride) {
              // New schedule is an override, existing is recurring - override takes priority
              scheduleMap[key] = {
                setterId: schedule.setter_id,
                setterName: schedule.setters?.name || 'Unknown',
                scheduleId: schedule.id,
                startTime: schedule.start_time,
                endTime: schedule.end_time,
                isOverride: isOverride,
                isOvernight: isOvernight,
                schedule: schedule,
                date: schedule.specific_date || formatDateLocal(weekDates[dayIndex])
              };
            } else if (!isOverride && existingIsOverride) {
              // New schedule is recurring, existing is override - keep existing override
              // Do nothing, keep the existing override
            } else {
              // Both are same type (both overrides or both recurring) - keep the one that starts earlier
              if (timeToMinutes(schedule.start_time) < timeToMinutes(scheduleMap[key].startTime)) {
                scheduleMap[key] = {
                  setterId: schedule.setter_id,
                  setterName: schedule.setters?.name || 'Unknown',
                  scheduleId: schedule.id,
                  startTime: schedule.start_time,
                  endTime: schedule.end_time,
                  isOverride: isOverride,
                  isOvernight: isOvernight,
                  schedule: schedule,
                  date: schedule.specific_date || formatDateLocal(weekDates[dayIndex])
                };
              }
            }
          }
        }
      }
      
      // If it's an overnight shift, also mark hours on the next day
      if (isOvernight) {
        const nextDayIndex = (dayIndex + 1) % 7; // Wrap around to Monday if Sunday
        for (let hour = 0; hour < 24; hour++) {
          const hourStartMinutes = hour * 60;
          const hourEndMinutes = (hour + 1) * 60;
          
          // Hours from 00:00 to end time on next day
          if (hourEndMinutes <= endMinutes) {
            const key = `${nextDayIndex}_${hour}`;
            const isOverride = schedule.specific_date !== null;
            
            // Priority: Date-specific overrides always take priority over recurring schedules
            if (!scheduleMap[key]) {
              scheduleMap[key] = {
                setterId: schedule.setter_id,
                setterName: schedule.setters?.name || 'Unknown',
                scheduleId: schedule.id,
                startTime: schedule.start_time,
                endTime: schedule.end_time,
                isOverride: isOverride,
                isOvernight: true,
                schedule: schedule,
                date: schedule.specific_date || formatDateLocal(weekDates[nextDayIndex])
              };
            } else {
              const existingIsOverride = scheduleMap[key].isOverride;
              
              if (isOverride && !existingIsOverride) {
                // New schedule is an override, existing is recurring - override takes priority
                scheduleMap[key] = {
                  setterId: schedule.setter_id,
                  setterName: schedule.setters?.name || 'Unknown',
                  scheduleId: schedule.id,
                  startTime: schedule.start_time,
                  endTime: schedule.end_time,
                  isOverride: isOverride,
                  isOvernight: true,
                  schedule: schedule,
                  date: schedule.specific_date || formatDateLocal(weekDates[nextDayIndex])
                };
              } else if (!isOverride && existingIsOverride) {
                // New schedule is recurring, existing is override - keep existing override
                // Do nothing
              } else {
                // Both are same type - keep the one that starts earlier
                if (timeToMinutes(schedule.start_time) < timeToMinutes(scheduleMap[key].startTime)) {
                  scheduleMap[key] = {
                    setterId: schedule.setter_id,
                    setterName: schedule.setters?.name || 'Unknown',
                    scheduleId: schedule.id,
                    startTime: schedule.start_time,
                    endTime: schedule.end_time,
                    isOverride: isOverride,
                    isOvernight: true,
                    schedule: schedule,
                    date: schedule.specific_date || formatDateLocal(weekDates[nextDayIndex])
                  };
                }
              }
            }
          }
        }
      }
    });
    
    return scheduleMap;
  };

  const scheduleMap = buildScheduleMap();
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const handleCellClick = (dayIndex, hour) => {
    const key = `${dayIndex}_${hour}`;
    const schedule = scheduleMap[key];
    if (schedule) {
      // Update the date to match the actual cell that was clicked
      const clickedDate = formatDateLocal(weekDates[dayIndex]);
      const updatedSchedule = {
        ...schedule,
        date: clickedDate,
        clickedDayIndex: dayIndex // Store which cell was clicked
      };
      setSelectedSchedule(schedule.scheduleId === selectedSchedule?.scheduleId ? null : updatedSchedule);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb' }}>
        <div style={{ 
          width: '120px', 
          padding: '12px', 
          fontWeight: '600', 
          color: '#374151',
          borderRight: '1px solid #e5e7eb'
        }}>
          Hour
        </div>
        {weekDates.map((date, dayIndex) => (
          <div 
            key={dayIndex}
            style={{ 
              flex: 1, 
              padding: '12px', 
              textAlign: 'center',
              fontWeight: '600',
              color: '#374151',
              borderRight: dayIndex < 6 ? '1px solid #e5e7eb' : 'none'
            }}
          >
            <div style={{ fontSize: '14px' }}>{dayNames[dayIndex]}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        ))}
      </div>

      {/* Grid Rows */}
      <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', minHeight: '600px' }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
            {/* Hour Label */}
            <div style={{ 
              width: '120px', 
              padding: '12px', 
              fontSize: '14px',
              color: '#6b7280',
              borderRight: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb',
              display: 'flex',
              alignItems: 'center'
            }}>
              {String(hour).padStart(2, '0')}:00
            </div>

            {/* Day Cells */}
            {weekDates.map((date, dayIndex) => {
              const key = `${dayIndex}_${hour}`;
              const schedule = scheduleMap[key];
              const isHovered = hoveredCell === key;
              const isSelected = selectedSchedule?.scheduleId === schedule?.scheduleId;

              return (
                <div
                  key={dayIndex}
                  onClick={() => handleCellClick(dayIndex, hour)}
                  onMouseEnter={() => setHoveredCell(key)}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '8px',
                    borderRight: dayIndex < 6 ? '1px solid #e5e7eb' : 'none',
                    backgroundColor: schedule 
                      ? setterColorMap[schedule.setterId] || '#f3f4f6'
                      : '#ffffff',
                    cursor: schedule ? 'pointer' : 'default',
                    position: 'relative',
                    transition: 'all 0.2s',
                    border: isSelected ? '2px solid #4f46e5' : 'none',
                    boxShadow: isSelected ? '0 0 0 2px rgba(79, 70, 229, 0.2)' : 'none'
                  }}
                >
                  {schedule && (
                    <div style={{ 
                      fontSize: '12px',
                      fontWeight: '500',
                      color: '#111827',
                      textAlign: 'center'
                    }}>
                      {schedule.setterName}
                    </div>
                  )}
                  
                  {isHovered && schedule && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: '4px',
                      backgroundColor: '#111827',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }}>
                      <div>{schedule.setterName}</div>
                      <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>
                        {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                        {schedule.isOvernight && ' (next day)'}
                      </div>
                      {schedule.isOverride && (
                        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', fontStyle: 'italic' }}>
                          Date Override
                        </div>
                      )}
                      {schedule.isOvernight && !schedule.isOverride && (
                        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', fontStyle: 'italic' }}>
                          Overnight Shift
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected Schedule Actions */}
      {selectedSchedule && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          zIndex: 1000
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
              {selectedSchedule.setterName}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {formatTime(selectedSchedule.startTime)} - {formatTime(selectedSchedule.endTime)}
              {selectedSchedule.isOvernight && ' (overnight - ends next day)'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const schedule = schedules.find(s => s.id === selectedSchedule.scheduleId);
                if (schedule) {
                  // Pass the date for this occurrence if it's a recurring schedule
                  // Use the date from the clicked cell, not the stored date
                  const dateForOverride = schedule.specific_date ? null : selectedSchedule.date;
                  onEditSchedule(schedule, dateForOverride);
                  setSelectedSchedule(null);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
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
              <Edit2 size={16} />
              Edit
            </button>
            <button
              onClick={() => {
                onDeleteSchedule(selectedSchedule.scheduleId);
                setSelectedSchedule(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #dc2626',
                backgroundColor: 'white',
                color: '#dc2626',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <Trash2 size={16} />
              Delete
            </button>
            <button
              onClick={() => setSelectedSchedule(null)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ 
        padding: '16px', 
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Setters:</div>
        {setters.map((setter, index) => (
          <div key={setter.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              backgroundColor: setterColorMap[setter.id] || '#f3f4f6',
              border: '1px solid #d1d5db'
            }} />
            <span style={{ fontSize: '14px', color: '#374151' }}>{setter.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

