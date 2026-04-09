import { useState } from 'react';
import { Edit2, Trash2, Clock, ArrowDown, Pencil } from 'lucide-react';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

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

/** DB times + specific_date are interpreted as UTC civil calendar + wall clock. */
const SCHEDULE_STORAGE_TZ = 'UTC';

export default function ScheduleGrid({ weekDates, schedules, setters, onEditSchedule, onDeleteSchedule, timezone = 'local' }) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  const setterColors = generateColors(setters.length);
  const setterColorMap = {};
  setters.forEach((setter, index) => {
    setterColorMap[setter.id] = setterColors[index];
  });

  // Helper function to format date as YYYY-MM-DD in specified timezone
  const formatDateInTimezone = (date, tz) => {
    if (tz === 'local') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Use formatToParts instead of locale string shape to always build YYYY-MM-DD.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  };

  // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion) - kept for backward compatibility
  const formatDateLocal = (date) => {
    return formatDateInTimezone(date, timezone);
  };

  /** Calendar YYYY-MM-DD + 1 day (for overnight shift end in source TZ). */
  const addOneCalendarDay = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };

  // Convert time string (HH:MM) to minutes since midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const targetTimezone = timezone === 'local'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : timezone;

  /** YYYY-MM-DD per column in the *view* timezone (matches header under each weekday). */
  const weekDayKeys = weekDates.map((d) => formatDateLocal(d));

  /**
   * UTC calendar date for recurring shifts on this column: same civil day as the column header
   * (noon in view TZ → YMD in UTC), not local-midnight Date skew.
   */
  const utcStorageYmdFromViewColumnYmd = (viewYmd) => {
    if (!viewYmd) return '';
    const noonUtc = fromZonedTime(`${viewYmd}T12:00:00`, targetTimezone);
    return formatInTimeZone(noonUtc, SCHEDULE_STORAGE_TZ, 'yyyy-MM-dd');
  };

  const utcStorageYmdForColumnDayIndex = (dayIndex) =>
    utcStorageYmdFromViewColumnYmd(weekDayKeys[dayIndex]);

  // Build a map of which setter is scheduled for each hour/day in the selected timezone.
  const buildScheduleMap = () => {
    const scheduleMap = {}; // { dayIndex_hour: { setterId, scheduleId, startTime, endTime } }

    const addOneDay = addOneCalendarDay;
    const addDays = (ymd, days) => {
      const [y, m, d] = ymd.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + days);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    };

    schedules.forEach((schedule) => {
      const isOverride = schedule.specific_date !== null;
      const startMinutes = timeToMinutes(schedule.start_time);
      const endMinutes = timeToMinutes(schedule.end_time);
      const isOvernight = endMinutes <= startMinutes;

      let sourceDateCandidates = [];
      if (isOverride && schedule.specific_date) {
        sourceDateCandidates = [schedule.specific_date];
      } else {
        const dbDay = schedule.day_of_week;
        const gridDayIndex = dbDay === 0 ? 6 : dbDay - 1; // Monday=0 ... Sunday=6
        const currentWeekSourceDate = utcStorageYmdFromViewColumnYmd(weekDayKeys[gridDayIndex]);
        sourceDateCandidates = [currentWeekSourceDate];
        // Week starts Monday. To render Monday early-hours correctly, include the prior Sunday
        // recurring occurrence so its overnight spill appears in this week's Monday column.
        if (isOvernight && gridDayIndex === 6) {
          sourceDateCandidates.push(addDays(currentWeekSourceDate, -7));
        }
      }
      for (const sourceDateYMD of sourceDateCandidates) {
        if (!sourceDateYMD) continue;

        const sourceEndDateYMD = isOvernight ? addOneDay(sourceDateYMD) : sourceDateYMD;
        const startUtc = fromZonedTime(`${sourceDateYMD}T${schedule.start_time}`, SCHEDULE_STORAGE_TZ);
        const endUtc = fromZonedTime(`${sourceEndDateYMD}T${schedule.end_time}`, SCHEDULE_STORAGE_TZ);
        if (!(startUtc instanceof Date) || !(endUtc instanceof Date) || endUtc <= startUtc) continue;

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const dayKey = weekDayKeys[dayIndex];
          for (let hour = 0; hour < 24; hour++) {
            const hh = String(hour).padStart(2, '0');
            const cellStartUtc = fromZonedTime(`${dayKey}T${hh}:00:00`, targetTimezone);
            const cellEndUtc = new Date(cellStartUtc.getTime() + 60 * 60 * 1000);
            const overlaps = cellStartUtc < endUtc && cellEndUtc > startUtc;
            if (!overlaps) continue;

            const key = `${dayIndex}_${hour}`;
            const existing = scheduleMap[key];
            const shouldReplace =
              !existing ||
              (isOverride && !existing.isOverride) ||
              (isOverride === existing.isOverride &&
                timeToMinutes(schedule.start_time) < timeToMinutes(existing.startTime));

            if (shouldReplace) {
              scheduleMap[key] = {
                setterId: schedule.setter_id,
                setterName: schedule.setters?.name || 'Unknown',
                scheduleId: schedule.id,
                startTime: schedule.start_time,
                endTime: schedule.end_time,
                isOverride,
                isOvernight,
                beforeShift: schedule.before_shift || false,
                schedule,
                date: sourceDateYMD, // Keep source date for edit/create-override flows.
              };
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
      const clickedDate = utcStorageYmdForColumnDayIndex(dayIndex);
      const updatedSchedule = {
        ...schedule,
        date: clickedDate,
        clickedDayIndex: dayIndex // Store which cell was clicked
      };
      setSelectedSchedule(schedule.scheduleId === selectedSchedule?.scheduleId ? null : updatedSchedule);
    }
  };

  const formatTime = (timeStr, scheduleDate) => {
    if (!timeStr) return '';
    const hhmm = timeStr.slice(0, 5);
    const [hours, minutes] = hhmm.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;

    const sourceDate = scheduleDate || utcStorageYmdForColumnDayIndex(0);
    const utcMoment = fromZonedTime(
      `${sourceDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
      SCHEDULE_STORAGE_TZ
    );
    const targetTz = timezone === 'local'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : timezone;

    return formatInTimeZone(utcMoment, targetTz, 'h:mm a');
  };

  /** Interpret stored UTC wall time on calendarDateYMD; display in setter TZ (or UTC if unset). */
  const formatTimeInSetterTz = (timeStr, calendarDateYMD, setterTimezone) => {
    if (!timeStr) return '';
    const hhmm = timeStr.slice(0, 5);
    const [hours, minutes] = hhmm.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;

    const sourceDate = calendarDateYMD || utcStorageYmdForColumnDayIndex(0);
    const tz =
      setterTimezone && String(setterTimezone).trim()
        ? String(setterTimezone).trim()
        : SCHEDULE_STORAGE_TZ;

    const utcMoment = fromZonedTime(
      `${sourceDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
      SCHEDULE_STORAGE_TZ
    );
    return formatInTimeZone(utcMoment, tz, 'h:mm a');
  };

  // Function to darken a hex color
  const darkenColor = (hex, percent = 20) => {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Darken by reducing RGB values
    const darkenedR = Math.max(0, Math.floor(r * (1 - percent / 100)));
    const darkenedG = Math.max(0, Math.floor(g * (1 - percent / 100)));
    const darkenedB = Math.max(0, Math.floor(b * (1 - percent / 100)));
    
    // Convert back to hex
    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
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
              {timezone === 'local' 
                ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    timeZone: timezone 
                  })
              }
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
                      ? (schedule.beforeShift 
                          ? '#9ca3af'
                          : setterColorMap[schedule.setterId] || '#f3f4f6')
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
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}>
                      {schedule.setterName}
                      {schedule.isOverride && (
                        <Pencil size={12} color="#6b7280" />
                      )}
                      {schedule.beforeShift && (
                        <>
                          <Clock size={12} color="#111827" />
                          <ArrowDown size={12} color="#111827" />
                        </>
                      )}
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
                      <div style={{ color: 'white' }}>
                        {schedule.setterName}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>
                        {formatTimeInSetterTz(
                          schedule.startTime,
                          schedule.date,
                          schedule.schedule?.setters?.timezone
                        )}{' '}
                        -{' '}
                        {formatTimeInSetterTz(
                          schedule.endTime,
                          schedule.isOvernight ? addOneCalendarDay(schedule.date) : schedule.date,
                          schedule.schedule?.setters?.timezone
                        )}
                        {schedule.isOvernight && ' (next day)'}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '2px' }}>
                        {schedule.schedule?.setters?.timezone?.trim()
                          ? `Setter TZ: ${schedule.schedule.setters.timezone.trim()}`
                          : `Setter TZ: ${SCHEDULE_STORAGE_TZ} (default)`}
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
                      {schedule.beforeShift && (
                        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px', fontStyle: 'italic', color: '#fca5a5' }}>
                          Before Shift
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
              {formatTime(selectedSchedule.startTime, selectedSchedule.date)} - {formatTime(selectedSchedule.endTime, selectedSchedule.date)}
              {selectedSchedule.isOvernight && ' (overnight - ends next day)'}
            </div>
            {selectedSchedule.beforeShift && (
              <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontStyle: 'italic' }}>
                Before Shift
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const schedule = schedules.find(s => s.id === selectedSchedule.scheduleId);
                if (schedule) {
                  // Pass the date for this occurrence if it's a recurring schedule
                  // Use the date from the clicked cell, not the stored date
                  const dateForOverride = schedule.specific_date ? null : selectedSchedule.date;
                  const viewOccurrenceYmd =
                    selectedSchedule.clickedDayIndex != null
                      ? formatDateLocal(weekDates[selectedSchedule.clickedDayIndex])
                      : undefined;
                  onEditSchedule(schedule, dateForOverride, viewOccurrenceYmd);
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

