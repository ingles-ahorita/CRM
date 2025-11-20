import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { X } from 'lucide-react';

export default function ScheduleForm({ 
  isOpen, 
  onClose, 
  setters, 
  editingSchedule, 
  isDateOverrideMode, 
  selectedDate,
  weekDates,
  existingSchedules = [],
  onSave 
}) {
  const [formData, setFormData] = useState({
    setter_id: '',
    days_of_week: [], // Array for multiple days
    start_time: '',
    end_time: '',
    specific_date: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editAsOverride, setEditAsOverride] = useState(false); // When editing recurring, choose to edit as override
  const [overrideDate, setOverrideDate] = useState(null); // Date for override when editing recurring schedule

  useEffect(() => {
    if (editingSchedule) {
      // Strip seconds from time if present (database returns HH:MM:SS, input needs HH:MM)
      const formatTimeForInput = (timeStr) => {
        if (!timeStr) return '';
        return timeStr.substring(0, 5); // Take first 5 characters (HH:MM)
      };
      
      const isRecurring = editingSchedule.specific_date === null;
      
      // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion)
      const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // Set overrideDate if editing a recurring schedule
      if (isRecurring) {
        if (selectedDate) {
          setOverrideDate(formatDateLocal(selectedDate));
        } else if (weekDates && weekDates.length > 0) {
          // If no selectedDate but we have weekDates, use the day of week from the schedule
          const dbDay = editingSchedule.day_of_week;
          const gridDay = dbDay === 0 ? 6 : dbDay - 1; // Convert to grid format
          if (gridDay >= 0 && gridDay < weekDates.length) {
            setOverrideDate(formatDateLocal(weekDates[gridDay]));
          } else {
            // Fallback: use Monday of current week
            setOverrideDate(formatDateLocal(weekDates[0]));
          }
        }
      } else {
        setOverrideDate(null);
      }
      
      setEditAsOverride(false); // Reset edit mode
      
      setFormData({
        setter_id: editingSchedule.setter_id || '',
        days_of_week: editingSchedule.day_of_week !== null && editingSchedule.day_of_week !== undefined 
          ? [editingSchedule.day_of_week.toString()] 
          : [],
        start_time: formatTimeForInput(editingSchedule.start_time),
        end_time: formatTimeForInput(editingSchedule.end_time),
        specific_date: editingSchedule.specific_date || ''
      });
    } else {
      setFormData({
        setter_id: '',
        days_of_week: [],
        start_time: '',
        end_time: '',
        specific_date: ''
      });
      setEditAsOverride(false);
      setOverrideDate(null);
    }
  }, [editingSchedule, isOpen, selectedDate, weekDates]);

  useEffect(() => {
    if (isDateOverrideMode && selectedDate) {
      // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion)
      const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const dateStr = formatDateLocal(selectedDate);
      setFormData(prev => ({ ...prev, specific_date: dateStr, days_of_week: [] }));
    } else if (isDateOverrideMode && !selectedDate) {
      setFormData(prev => ({ ...prev, specific_date: '', days_of_week: [] }));
    }
  }, [isDateOverrideMode, selectedDate]);

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

      // Check for conflicts
      const conflicts = checkConflicts(
        formData.setter_id,
        effectiveIsOverride ? [] : formData.days_of_week,
        formData.start_time + ':00',
        formData.end_time + ':00',
        effectiveIsOverride ? (formData.specific_date || overrideDate) : null
      );

      if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c => c.message).join('\n');
        throw new Error(`Schedule conflicts detected:\n\n${conflictMessages}\n\nPlease adjust the time or remove the conflicting schedule first.`);
      }

      const basePayload = {
        setter_id: formData.setter_id,
        start_time: formData.start_time + ':00', // Add seconds for database
        end_time: formData.end_time + ':00',
      };

      if (editingSchedule) {
        const isRecurring = editingSchedule.specific_date === null;
        
        if (isRecurring && editAsOverride && overrideDate) {
          // Editing a recurring schedule but creating a date override instead
          // Create new date override, don't modify the recurring schedule
          const payload = {
            ...basePayload,
            specific_date: overrideDate,
            day_of_week: null
          };
          
          const { error: insertError } = await supabase
            .from('setter_schedules')
            .insert(payload);
          
          if (insertError) throw insertError;
        } else {
          // Update existing schedule
          const payload = { ...basePayload };
          if (isDateOverrideMode || editAsOverride) {
            // For date overrides, use the formData date if provided, otherwise keep the original date
            // This prevents timezone shifts when updating
            if (formData.specific_date) {
              payload.specific_date = formData.specific_date;
            } else if (overrideDate) {
              payload.specific_date = overrideDate;
            } else if (editingSchedule.specific_date) {
              // Keep the original date if no new date is provided
              payload.specific_date = editingSchedule.specific_date;
            }
            payload.day_of_week = null;
          } else {
            payload.day_of_week = parseInt(formData.days_of_week[0]);
            payload.specific_date = null;
          }

          const { error: updateError } = await supabase
            .from('setter_schedules')
            .update(payload)
            .eq('id', editingSchedule.id);

          if (updateError) throw updateError;
        }
      } else {
        // Create new schedules - one for each selected day
        if (isDateOverrideMode) {
          // Single date override
          const payload = {
            ...basePayload,
            specific_date: formData.specific_date,
            day_of_week: null
          };
          const { error: insertError } = await supabase
            .from('setter_schedules')
            .insert(payload);
          if (insertError) throw insertError;
        } else {
          // Multiple recurring schedules - one per selected day
          const schedulesToInsert = formData.days_of_week.map(dayValue => ({
            ...basePayload,
            day_of_week: parseInt(dayValue),
            specific_date: null
          }));

          const { error: insertError } = await supabase
            .from('setter_schedules')
            .insert(schedulesToInsert);

          if (insertError) throw insertError;
        }
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

  // Check for time overlap between two time ranges (handles overnight shifts)
  const timesOverlap = (start1, end1, start2, end2) => {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);
    
    const isOvernight1 = e1 <= s1;
    const isOvernight2 = e2 <= s2;
    
    // If both are same-day shifts, normal overlap check
    if (!isOvernight1 && !isOvernight2) {
      return s1 < e2 && s2 < e1;
    }
    
    // If one is overnight, we need special handling
    // For overnight shifts, they overlap if:
    // - They overlap in the "first part" (start to 23:59)
    // - OR they overlap in the "second part" (00:00 to end)
    
    if (isOvernight1 && !isOvernight2) {
      // Shift 1 is overnight (e.g., 22:00-02:00), shift 2 is same-day (e.g., 09:00-17:00)
      // Check if shift 2 overlaps with first part (s1 to 23:59) OR second part (00:00 to e1)
      // First part: shift 2 overlaps if it's between s1 and 23:59
      const overlapsFirstPart = s2 >= s1 && s2 < 24 * 60;
      // Second part: shift 2 overlaps if it's between 00:00 and e1
      const overlapsSecondPart = s2 < e1 && e2 > 0;
      return overlapsFirstPart || overlapsSecondPart;
    }
    
    if (!isOvernight1 && isOvernight2) {
      // Shift 1 is same-day, shift 2 is overnight
      // Check if shift 1 overlaps with first part (s2 to 23:59) OR second part (00:00 to e2)
      const overlapsFirstPart = s1 >= s2 && s1 < 24 * 60;
      const overlapsSecondPart = s1 < e2 && e1 > 0;
      return overlapsFirstPart || overlapsSecondPart;
    }
    
    // Both are overnight - they always overlap (both cover midnight)
    return true;
  };

  // Check for conflicts with existing schedules
  const checkConflicts = (setterId, daysOfWeek, startTime, endTime, specificDate) => {
    console.log('checkConflicts', setterId, daysOfWeek, startTime, endTime, specificDate);
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
        const prevDayOvernightSchedule = relevantSchedules.find(s => {
          if (s.specific_date !== null) return false;
          if (s.day_of_week !== prevDayOfWeek) return false;
          // Check if previous day has an overnight shift that extends into our day
          const prevIsOvernight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
          if (!prevIsOvernight) return false;
          // Previous day's overnight shift ends at s.end_time (e.g., 02:00)
          // Check if our schedule overlaps with the end part (00:00 to s.end_time)
          // Only check if our schedule starts before or at the time the previous shift ends
          const ourStartMinutes = timeToMinutes(startTime);
          const prevEndMinutes = timeToMinutes(s.end_time);
          if (ourStartMinutes > prevEndMinutes) return false; // Our schedule starts after previous shift ends, no conflict
          const endPartStart = '00:00:00';
          return timesOverlap(endPartStart, s.end_time, startTime, endTime);
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
          const conflictingNextDay = relevantSchedules.find(s => {
            if (s.specific_date !== null) return false;
            if (s.day_of_week !== nextDayOfWeek) return false;
            // Check if the next day's schedule overlaps with the end part of our overnight shift (00:00 to end)
            // For the next day check, we only care about the end part: 00:00 to endTime
            // Only check if next day's schedule starts before or at our end time
            const nextStartMinutes = timeToMinutes(s.start_time);
            const ourEndMinutes = timeToMinutes(endTime);
            if (nextStartMinutes > ourEndMinutes) return false; // Next day's schedule starts after our shift ends, no conflict
            const endPartStart = '00:00:00';
            return timesOverlap(endPartStart, endTime, s.start_time, s.end_time);
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
                  Create date override for {new Date(overrideDate).toLocaleDateString()} only
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
                    // Helper function to format date as YYYY-MM-DD in local time (no timezone conversion)
                    const formatDateLocal = (date) => {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    };
                    const dateStr = formatDateLocal(date);
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

