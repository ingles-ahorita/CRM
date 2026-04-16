import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { X } from 'lucide-react';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/** DB schedule wall times + dates are UTC (matches ScheduleGrid). */
const SCHEDULE_STORAGE_TZ = 'UTC';

function resolveViewTimezone(viewTimezone) {
  return viewTimezone === 'local'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : viewTimezone;
}

function formatDateInTimezone(date, tz) {
  if (!date) return '';
  if (tz === 'local') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
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
}

/** UTC calendar date for the grid column (noon that civil day in view TZ → UTC YMD). */
function utcStorageYmdForWeekColumn(weekDates, dayIndex, viewTimezone) {
  if (!weekDates?.length || dayIndex < 0 || dayIndex >= weekDates.length) return '';
  const vt = resolveViewTimezone(viewTimezone);
  const viewYmd = formatDateInTimezone(weekDates[dayIndex], vt);
  return formatInTimeZone(
    fromZonedTime(`${viewYmd}T12:00:00`, vt),
    SCHEDULE_STORAGE_TZ,
    'yyyy-MM-dd'
  );
}

function addOneCalendarDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function padDbTime(t) {
  if (!t) return '00:00:00';
  const p = String(t).split(':');
  const hh = String(parseInt(p[0], 10) || 0).padStart(2, '0');
  const mm = String(parseInt(p[1], 10) || 0).padStart(2, '0');
  const ss = String(parseInt(p[2], 10) || 0).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function ScheduleForm({ 
  isOpen, 
  onClose, 
  setters, 
  editingSchedule, 
  isDateOverrideMode, 
  selectedDate,
  weekDates,
  existingSchedules = [],
  onSave,
  viewTimezone = 'UTC',
  viewTimezoneLabel = '',
  utcOccurrenceYmd = null,
  viewOccurrenceYmd = null
}) {
  const [formData, setFormData] = useState({
    setter_id: '',
    days_of_week: [], // Array for multiple days
    start_time: '',
    end_time: '',
    specific_date: '',
    before_shift: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editAsOverride, setEditAsOverride] = useState(false); // When editing recurring, choose to edit as override
  const [overrideDate, setOverrideDate] = useState(null); // Date for override when editing recurring schedule

  useEffect(() => {
    if (editingSchedule) {
      const vt = resolveViewTimezone(viewTimezone);
      const isRecurring = editingSchedule.specific_date === null;

      const lineMins = (ts) => {
        const [h, m] = String(ts || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
        return h * 60 + m;
      };

      const gridIdx =
        editingSchedule.day_of_week != null
          ? editingSchedule.day_of_week === 0
            ? 6
            : editingSchedule.day_of_week - 1
          : 0;
      const storageAnchorYmd = editingSchedule.specific_date
        ? editingSchedule.specific_date
        : utcOccurrenceYmd ||
          (weekDates?.length
            ? utcStorageYmdForWeekColumn(weekDates, gridIdx, viewTimezone)
            : formatInTimeZone(new Date(), SCHEDULE_STORAGE_TZ, 'yyyy-MM-dd'));

      const st = padDbTime(editingSchedule.start_time);
      const et = padDbTime(editingSchedule.end_time);
      const overnightDb = lineMins(editingSchedule.end_time) <= lineMins(editingSchedule.start_time);
      const startUtc = fromZonedTime(`${storageAnchorYmd}T${st}`, SCHEDULE_STORAGE_TZ);
      const endYmd = overnightDb ? addOneCalendarDay(storageAnchorYmd) : storageAnchorYmd;
      const endUtc = fromZonedTime(`${endYmd}T${et}`, SCHEDULE_STORAGE_TZ);

      const startView = formatInTimeZone(startUtc, vt, 'HH:mm');
      const endView = formatInTimeZone(endUtc, vt, 'HH:mm');
      const specificView = editingSchedule.specific_date
        ? formatInTimeZone(startUtc, vt, 'yyyy-MM-dd')
        : '';

      if (isRecurring) {
        if (viewOccurrenceYmd) {
          setOverrideDate(viewOccurrenceYmd);
        } else if (selectedDate) {
          setOverrideDate(formatDateInTimezone(selectedDate, vt));
        } else if (weekDates && weekDates.length > 0) {
          const dbDay = editingSchedule.day_of_week;
          const gridDay = dbDay === 0 ? 6 : dbDay - 1;
          if (gridDay >= 0 && gridDay < weekDates.length) {
            setOverrideDate(formatDateInTimezone(weekDates[gridDay], vt));
          } else {
            setOverrideDate(formatDateInTimezone(weekDates[0], vt));
          }
        }
      } else {
        setOverrideDate(null);
      }

      setEditAsOverride(false);

      setFormData({
        setter_id: editingSchedule.setter_id || '',
        days_of_week:
          editingSchedule.day_of_week !== null && editingSchedule.day_of_week !== undefined
            ? [editingSchedule.day_of_week.toString()]
            : [],
        start_time: startView,
        end_time: endView,
        specific_date: specificView,
        before_shift: editingSchedule.before_shift || false
      });
    } else {
      setFormData({
        setter_id: '',
        days_of_week: [],
        start_time: '',
        end_time: '',
        specific_date: '',
        before_shift: false
      });
      setEditAsOverride(false);
      setOverrideDate(null);
    }
  }, [
    editingSchedule,
    isOpen,
    selectedDate,
    weekDates,
    viewTimezone,
    utcOccurrenceYmd,
    viewOccurrenceYmd
  ]);

  useEffect(() => {
    const vt = resolveViewTimezone(viewTimezone);
    if (isDateOverrideMode && selectedDate && !editingSchedule) {
      const dateStr = formatDateInTimezone(selectedDate, vt);
      setFormData((prev) => ({ ...prev, specific_date: dateStr, days_of_week: [] }));
    } else if (isDateOverrideMode && !selectedDate && !editingSchedule) {
      setFormData((prev) => ({ ...prev, specific_date: '', days_of_week: [] }));
    }
  }, [isDateOverrideMode, selectedDate, viewTimezone, editingSchedule]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validation
      if (!formData.setter_id) {
        throw new Error('Please select a setter');
      }
      if (!formData.start_time || !formData.end_time) {
        throw new Error('Please provide start and end times');
      }
      
      // Determine if this is an override (date-specific) schedule
      const effectiveIsOverride = isDateOverrideMode || editAsOverride || (editingSchedule && editingSchedule.specific_date !== null);
      
      if (effectiveIsOverride && !formData.specific_date && !overrideDate) {
        throw new Error('Please select a date for the override');
      }
      if (!effectiveIsOverride && formData.days_of_week.length === 0) {
        throw new Error('Please select at least one day of the week');
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.start_time) || !timeRegex.test(formData.end_time)) {
        throw new Error('Time must be in HH:MM format (e.g., 14:30)');
      }

      // Validate times (allow overnight shifts where end < start)
      const startMinutes = timeToMinutes(formData.start_time);
      const endMinutes = timeToMinutes(formData.end_time);
      // Allow end time to be before start time (overnight shift) or after start time (same-day shift)
      // But not equal (would be 0 duration)
      if (endMinutes === startMinutes) {
        throw new Error('Start and end times cannot be the same');
      }

      const vt = resolveViewTimezone(viewTimezone);
      const overnightForm = endMinutes <= startMinutes;

      const viewPairToUtcStorage = (viewYmd, startHm, endHm) => {
        const sUtc = fromZonedTime(`${viewYmd}T${startHm}:00`, vt);
        const endYmd = overnightForm ? addOneCalendarDay(viewYmd) : viewYmd;
        const eUtc = fromZonedTime(`${endYmd}T${endHm}:00`, vt);
        return {
          start_time: formatInTimeZone(sUtc, SCHEDULE_STORAGE_TZ, 'HH:mm:ss'),
          end_time: formatInTimeZone(eUtc, SCHEDULE_STORAGE_TZ, 'HH:mm:ss'),
          specific_date_utc: formatInTimeZone(sUtc, SCHEDULE_STORAGE_TZ, 'yyyy-MM-dd')
        };
      };

      if (editingSchedule) {
        const isRecurring = editingSchedule.specific_date === null;

        if (isRecurring && editAsOverride && overrideDate) {
          const { start_time, end_time, specific_date_utc } = viewPairToUtcStorage(
            overrideDate,
            formData.start_time,
            formData.end_time
          );
          const conflicts = checkConflicts(
            formData.setter_id,
            [],
            start_time,
            end_time,
            specific_date_utc
          );
          if (conflicts.length > 0) {
            const conflictMessages = conflicts.map((c) => c.message).join('\n');
            throw new Error(
              `Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`
            );
          }
          const { error: insertError } = await supabase.from('setter_schedules').insert({
            setter_id: formData.setter_id,
            start_time,
            end_time,
            before_shift: formData.before_shift || false,
            specific_date: specific_date_utc,
            day_of_week: null
          });
          if (insertError) throw insertError;
        } else {
          let start_time;
          let end_time;
          let specific_date_utc;

          if (isDateOverrideMode || (editingSchedule && editingSchedule.specific_date !== null)) {
            const viewYmd = formData.specific_date || overrideDate;
            if (!viewYmd) throw new Error('Please select a date for the override');
            ({ start_time, end_time, specific_date_utc } = viewPairToUtcStorage(
              viewYmd,
              formData.start_time,
              formData.end_time
            ));
            const conflicts = checkConflicts(
              formData.setter_id,
              [],
              start_time,
              end_time,
              specific_date_utc
            );
            if (conflicts.length > 0) {
              const conflictMessages = conflicts.map((c) => c.message).join('\n');
              throw new Error(
                `Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`
              );
            }
          } else {
            const dbDay = parseInt(formData.days_of_week[0], 10);
            const gridDay = dbDay === 0 ? 6 : dbDay - 1;
            const viewYmd = formatDateInTimezone(weekDates[gridDay], vt);
            ({ start_time, end_time } = viewPairToUtcStorage(
              viewYmd,
              formData.start_time,
              formData.end_time
            ));
            const conflicts = checkConflicts(
              formData.setter_id,
              formData.days_of_week,
              start_time,
              end_time,
              null
            );
            if (conflicts.length > 0) {
              const conflictMessages = conflicts.map((c) => c.message).join('\n');
              throw new Error(
                `Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`
              );
            }
          }

          const payload = {
            setter_id: formData.setter_id,
            start_time,
            end_time,
            before_shift: formData.before_shift || false
          };
          if (isDateOverrideMode || editingSchedule.specific_date !== null) {
            payload.specific_date = specific_date_utc;
            payload.day_of_week = null;
          } else {
            payload.day_of_week = parseInt(formData.days_of_week[0], 10);
            payload.specific_date = null;
          }

          const { error: updateError } = await supabase
            .from('setter_schedules')
            .update(payload)
            .eq('id', editingSchedule.id);

          if (updateError) throw updateError;
        }
      } else if (isDateOverrideMode) {
        const viewYmd = formData.specific_date;
        if (!viewYmd) throw new Error('Please select a date for the override');
        const { start_time, end_time, specific_date_utc } = viewPairToUtcStorage(
          viewYmd,
          formData.start_time,
          formData.end_time
        );
        const conflicts = checkConflicts(
          formData.setter_id,
          [],
          start_time,
          end_time,
          specific_date_utc
        );
        if (conflicts.length > 0) {
          const conflictMessages = conflicts.map((c) => c.message).join('\n');
          throw new Error(
            `Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`
          );
        }
        const { error: insertError } = await supabase.from('setter_schedules').insert({
          setter_id: formData.setter_id,
          start_time,
          end_time,
          before_shift: formData.before_shift || false,
          specific_date: specific_date_utc,
          day_of_week: null
        });
        if (insertError) throw insertError;
      } else {
        const schedulesToInsert = [];
        for (const dayValue of formData.days_of_week) {
          const dbDay = parseInt(dayValue, 10);
          const gridDay = dbDay === 0 ? 6 : dbDay - 1;
          const viewYmd = formatDateInTimezone(weekDates[gridDay], vt);
          const { start_time, end_time } = viewPairToUtcStorage(
            viewYmd,
            formData.start_time,
            formData.end_time
          );
          const conflicts = checkConflicts(
            formData.setter_id,
            [dayValue],
            start_time,
            end_time,
            null
          );
          if (conflicts.length > 0) {
            const conflictMessages = conflicts.map((c) => c.message).join('\n');
            throw new Error(
              `Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`
            );
          }
          schedulesToInsert.push({
            setter_id: formData.setter_id,
            start_time,
            end_time,
            before_shift: formData.before_shift || false,
            day_of_week: dbDay,
            specific_date: null
          });
        }

        const { error: insertError } = await supabase
          .from('setter_schedules')
          .insert(schedulesToInsert);

        if (insertError) throw insertError;
      }

      onSave();
    } catch (err) {
      console.error('Error saving schedule:', err);
      setError(err.message || 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  // Database format: 0=Sunday, 1=Monday, ..., 6=Saturday
  const dayOptions = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' }
  ];

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    // Handle both HH:MM and HH:MM:SS formats
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    return hours * 60 + minutes;
  };

  /** Half-open minute ranges [s, e) on one calendar day. */
  const rangesOverlapM = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

  /**
   * Overlap for two shifts on the *same* recurring weekday (UTC wall times).
   * Overnight = end <= start: evening [start, 24h) on day D, morning [0, end) on D+1 only.
   * Same-day shift lives entirely on D — it must not be compared to the overnight morning tail (that's D+1).
   */
  const timesOverlap = (start1, end1, start2, end2) => {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);

    const o1 = e1 <= s1;
    const o2 = e2 <= s2;

    if (!o1 && !o2) {
      return rangesOverlapM(s1, e1, s2, e2);
    }
    if (o1 && !o2) {
      return rangesOverlapM(s1, 24 * 60, s2, e2);
    }
    if (!o1 && o2) {
      return rangesOverlapM(s1, e1, s2, 24 * 60);
    }
    return rangesOverlapM(s1, 24 * 60, s2, 24 * 60) || rangesOverlapM(0, e1, 0, e2);
  };

  // Check for conflicts with existing schedules
  const checkConflicts = (setterId, daysOfWeek, startTime, endTime, specificDate) => {
    const conflicts = [];
    
    // Filter schedules for the same setter, excluding the one being edited
    const relevantSchedules = existingSchedules.filter(s => {
      if (s.setter_id !== setterId) return false;
      if (editingSchedule && s.id === editingSchedule.id) return false; // Exclude current schedule when editing
      return true;
    });

    if (isDateOverrideMode && specificDate) {
      // Check date-specific conflicts
      // For overnight shifts, also check the next day
      const conflictingSchedule = relevantSchedules.find(s => {
        if (!s.specific_date) return false; // Only check other date-specific schedules
        
        // Check same date
        if (s.specific_date === specificDate) {
          return timesOverlap(startTime, endTime, s.start_time, s.end_time);
        }
        
        // For overnight shifts, also check next day
        const isOvernight = timeToMinutes(endTime) <= timeToMinutes(startTime);
        if (isOvernight) {
          // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion)
          const formatDateLocal = (dateStr) => {
            const date = new Date(dateStr);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          };
          const nextDate = new Date(specificDate);
          nextDate.setDate(nextDate.getDate() + 1);
          const nextDateStr = formatDateLocal(nextDate);
          if (s.specific_date === nextDateStr) {
            return timesOverlap(startTime, endTime, s.start_time, s.end_time);
          }
        }
        
        return false;
      });

      if (conflictingSchedule) {
        const setterName = setters.find(s => s.id === setterId)?.name || 'Unknown';
        const isOvernight = timeToMinutes(endTime) <= timeToMinutes(startTime);
        const conflictDate = conflictingSchedule.specific_date === specificDate 
          ? new Date(specificDate).toLocaleDateString()
          : new Date(conflictingSchedule.specific_date).toLocaleDateString();
        conflicts.push({
          type: 'date',
          date: specificDate,
          conflictingSchedule: conflictingSchedule,
          message: `${setterName} already has a schedule on ${conflictDate}${isOvernight ? ' (overnight shift conflicts)' : ''} that overlaps with ${startTime.substring(0, 5)} - ${endTime.substring(0, 5)}`
        });
      }
    } else {
      // Check recurring schedule conflicts
      const isOvernight = timeToMinutes(endTime) <= timeToMinutes(startTime);
      
      daysOfWeek.forEach(dayValue => {
        const dayOfWeek = parseInt(dayValue);
        
        // Check same day
        const conflictingSchedule = relevantSchedules.find(s => {
          // Only check recurring schedules (not date-specific)
          if (s.specific_date !== null) return false;
          // Must be same day of week
          if (s.day_of_week !== dayOfWeek) return false;
          // Check time overlap
          return timesOverlap(startTime, endTime, s.start_time, s.end_time);
        });

        if (conflictingSchedule) {
          const dayName = dayOptions.find(d => d.value === dayValue)?.label || 'Unknown';
          const setterName = setters.find(s => s.id === setterId)?.name || 'Unknown';
          conflicts.push({
            type: 'recurring',
            day: dayName,
            dayOfWeek: dayOfWeek,
            conflictingSchedule: conflictingSchedule,
            message: `${setterName} already has a recurring schedule on ${dayName}${isOvernight ? ' (overnight shift)' : ''} that overlaps with ${startTime.substring(0, 5)} - ${endTime.substring(0, 5)}`
          });
        }
        
        // Also check previous day for overnight shifts that extend into this day
        // (e.g., if creating Wednesday schedule, check if Tuesday has overnight shift ending Wednesday)
        // Only check if our schedule starts early enough to potentially conflict
        // (if our schedule starts after the previous day's overnight shift ends, no conflict)
        const prevDayOfWeek = (dayOfWeek - 1 + 7) % 7; // Wrap around
        const prevDayOvernightSchedule = relevantSchedules.find((s) => {
          if (s.specific_date !== null) return false;
          if (s.day_of_week !== prevDayOfWeek) return false;
          const prevIsOvernight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
          if (!prevIsOvernight) return false;
          // Previous day's spill on *our* calendar day: [0, prevEnd)
          const prevEndM = timeToMinutes(s.end_time);
          const ourS = timeToMinutes(startTime);
          const ourE = timeToMinutes(endTime);
          const ourOvernight = ourE <= ourS;
          if (ourOvernight) {
            // Our evening on this day only vs their morning spill
            return rangesOverlapM(0, prevEndM, ourS, 24 * 60);
          }
          return rangesOverlapM(0, prevEndM, ourS, ourE);
        });
        
        if (prevDayOvernightSchedule) {
          const dayName = dayOptions.find(d => d.value === dayValue)?.label || 'Unknown';
          const prevDayName = dayOptions.find(d => parseInt(d.value) === prevDayOfWeek)?.label || 'Unknown';
          const setterName = setters.find(s => s.id === setterId)?.name || 'Unknown';
          conflicts.push({
            type: 'recurring',
            day: dayName,
            dayOfWeek: dayOfWeek,
            conflictingSchedule: prevDayOvernightSchedule,
            message: `${setterName} already has a recurring overnight schedule on ${prevDayName} that extends into ${dayName} and overlaps with ${startTime.substring(0, 5)} - ${endTime.substring(0, 5)}`
          });
        }
        
        // For overnight shifts, also check the next day
        // Only check if the next day's schedule starts early enough to conflict with our end part
        if (isOvernight) {
          const nextDayOfWeek = (dayOfWeek + 1) % 7; // Wrap around (Sunday=0, Monday=1, etc.)
          const ourEndM = timeToMinutes(endTime);
          const conflictingNextDay = relevantSchedules.find((s) => {
            if (s.specific_date !== null) return false;
            if (s.day_of_week !== nextDayOfWeek) return false;
            const sS = timeToMinutes(s.start_time);
            const sE = timeToMinutes(s.end_time);
            const sOvernight = sE <= sS;
            // Our spill on the *next* calendar day: [0, ourEndM)
            if (!sOvernight) {
              return rangesOverlapM(0, ourEndM, sS, sE);
            }
            // Their overnight on that day only uses evening [sS, 24h); morning [0,sE) is the *following* day
            return rangesOverlapM(0, ourEndM, sS, 24 * 60);
          });

          if (conflictingNextDay) {
            const dayName = dayOptions.find(d => d.value === dayValue)?.label || 'Unknown';
            const nextDayName = dayOptions.find(d => parseInt(d.value) === nextDayOfWeek)?.label || 'Unknown';
            const setterName = setters.find(s => s.id === setterId)?.name || 'Unknown';
            conflicts.push({
              type: 'recurring',
              day: nextDayName,
              dayOfWeek: nextDayOfWeek,
              conflictingSchedule: conflictingNextDay,
              message: `${setterName} already has a recurring schedule on ${nextDayName} that conflicts with the overnight shift ending on ${nextDayName} (${startTime.substring(0, 5)} - ${endTime.substring(0, 5)})`
            });
          }
        }
      });
    }

    return conflicts;
  };

  if (!isOpen) return null;

  const vtRender = resolveViewTimezone(viewTimezone);
  const overrideDateLabel =
    overrideDate &&
    formatInTimeZone(fromZonedTime(`${overrideDate}T12:00:00`, vtRender), vtRender, 'EEE, MMM d, yyyy');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '24px'
    }}
    onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: 'bold', 
            color: '#111827' 
          }}>
            {editingSchedule ? 'Edit Schedule' : isDateOverrideMode ? 'Add Date Override' : 'Add Recurring Schedule'}
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#f3f4f6',
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
            <X size={20} color="#374151" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '16px',
            whiteSpace: 'pre-line'
          }}>
            {error}
          </div>
        )}

        {/* Edit Mode Selection - Only show when editing a recurring schedule */}
        {editingSchedule && editingSchedule.specific_date === null && overrideDate && (
          <div style={{
            padding: '16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '12px' }}>
              Edit Options
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="editMode"
                  checked={!editAsOverride}
                  onChange={() => {
                    setEditAsOverride(false);
                    setFormData(prev => ({ ...prev, specific_date: '', days_of_week: editingSchedule.day_of_week !== null ? [editingSchedule.day_of_week.toString()] : [] }));
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#0ea5e9' }}
                />
                <span style={{ fontSize: '14px', color: '#0c4a6e' }}>
                  Edit recurring schedule (affects all future occurrences)
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="editMode"
                  checked={editAsOverride}
                  onChange={() => {
                    setEditAsOverride(true);
                    setFormData(prev => ({ ...prev, specific_date: overrideDate, days_of_week: [] }));
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#0ea5e9' }}
                />
                <span style={{ fontSize: '14px', color: '#0c4a6e' }}>
                  Create date override for {overrideDateLabel || overrideDate} only
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Setter Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '8px'
            }}>
              Setter *
            </label>
            <select
              value={formData.setter_id}
              onChange={(e) => setFormData(prev => ({ ...prev, setter_id: e.target.value }))}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                color: '#111827',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4f46e5';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              <option value="">Select a setter</option>
              {setters.map(setter => (
                <option key={setter.id} value={setter.id}>
                  {setter.name}
                </option>
              ))}
            </select>
          </div>

          {/* Day Selection (for recurring schedules) */}
          {!isDateOverrideMode && !editAsOverride && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                Days of Week * {editingSchedule ? '(Edit single day)' : '(Select multiple days)'}
              </label>
              {editingSchedule ? (
                // Single select for editing
                <select
                  value={formData.days_of_week[0] || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    days_of_week: e.target.value ? [e.target.value] : [] 
                  }))}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    color: '#111827',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#4f46e5';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  <option value="">Select a day</option>
                  {dayOptions.map(day => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              ) : (
                // Multi-select checkboxes for creating new schedules
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                  minHeight: '60px'
                }}>
                  {dayOptions.map(day => {
                    const isSelected = formData.days_of_week.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? '#eef2ff' : 'white',
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #d1d5db',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          userSelect: 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = 'white';
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              console.log('Adding day of week:', day.value, day.label);
                              setFormData(prev => ({
                                ...prev,
                                days_of_week: [...prev.days_of_week, day.value]
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                days_of_week: prev.days_of_week.filter(d => d !== day.value)
                              }));
                            }
                          }}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: '#4f46e5'
                          }}
                        />
                        <span style={{
                          fontSize: '14px',
                          fontWeight: isSelected ? '600' : '400',
                          color: isSelected ? '#4f46e5' : '#374151'
                        }}>
                          {day.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {!editingSchedule && formData.days_of_week.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  {formData.days_of_week.length} day{formData.days_of_week.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
          )}

          {/* Date Selection (for date overrides) */}
          {(isDateOverrideMode || editAsOverride) && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                Date *
              </label>
              <input
                type="date"
                value={formData.specific_date}
                onChange={(e) => setFormData(prev => ({ ...prev, specific_date: e.target.value }))}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  color: '#111827',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f46e5';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              />
              {weekDates.length > 0 && (
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: '#6b7280',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <span>Quick select:</span>
                  {weekDates.map((date, index) => {
                    const dateStr = formatDateInTimezone(date, vtRender);
                    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, specific_date: dateStr }))}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: formData.specific_date === dateStr 
                            ? '1px solid #4f46e5' 
                            : '1px solid #d1d5db',
                          backgroundColor: formData.specific_date === dateStr 
                            ? '#eef2ff' 
                            : 'white',
                          color: formData.specific_date === dateStr 
                            ? '#4f46e5' 
                            : '#374151',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {dayNames[index]} {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Time Selection */}
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#6b7280' }}>
            Times use the schedule page timezone:{' '}
            <span style={{ fontWeight: '600', color: '#374151' }}>
              {viewTimezoneLabel || (viewTimezone === 'local' ? 'Browser local' : viewTimezone)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                Start Time *
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                required
                step="60"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  color: '#111827',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f46e5';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '8px'
              }}>
                End Time *
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                required
                step="60"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  color: '#111827',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#4f46e5';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              />
            </div>
          </div>

          {/* Before Shift Checkbox */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={formData.before_shift}
                onChange={(e) => setFormData(prev => ({ ...prev, before_shift: e.target.checked }))}
                style={{
                  width: '20px',
                  height: '20px',
                  cursor: 'pointer',
                  accentColor: '#4f46e5'
                }}
              />
              <span style={{ 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151'
              }}>
                Before Shift (display name in red)
              </span>
            </label>
          </div>

          {/* Form Actions */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            justifyContent: 'flex-end',
            marginTop: '24px'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: loading ? '#9ca3af' : '#4f46e5',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#4338ca';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                }
              }}
            >
              {loading 
                ? 'Saving...' 
                : editingSchedule 
                  ? 'Update Schedule' 
                  : formData.days_of_week.length > 1
                    ? `Create ${formData.days_of_week.length} Schedules`
                    : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

