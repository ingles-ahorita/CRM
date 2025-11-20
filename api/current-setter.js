import { createClient } from '@supabase/supabase-js';

// In Vercel serverless functions, use the raw env var names
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Gets the current date and time components in Spain timezone (CET/CEST)
 * @returns {Object} Object with date, time, dayOfWeek, and minutes
 */
function getSpainTime() {
  // Spain uses Europe/Madrid timezone (CET/CEST)
  const now = new Date();
  // Get Spain time as a formatted string, then parse it
  const spainTimeStr = now.toLocaleString('en-US', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the formatted string (format: MM/DD/YYYY, HH:MM:SS)
  const [datePart, timePart] = spainTimeStr.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hours, minutes, seconds] = timePart.split(':');
  
  // Create a date object in local time (but represents Spain time)
  const spainDate = new Date(year, month - 1, day, hours, minutes, seconds);
  
  return {
    date: spainDate,
    year: parseInt(year),
    month: parseInt(month),
    day: parseInt(day),
    hours: parseInt(hours),
    minutes: parseInt(minutes),
    seconds: parseInt(seconds),
    dayOfWeek: spainDate.getDay()
  };
}

/**
 * Converts time string (HH:MM:SS or HH:MM) to minutes since midnight
 * @param {string} timeStr - Time string in format HH:MM:SS or HH:MM
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  return hours * 60 + minutes;
}

/**
 * Formats a date as YYYY-MM-DD in local time (no timezone conversion)
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a time falls within a schedule range, handling overnight shifts
 * @param {number} checkMinutes - Minutes since midnight to check
 * @param {string} startTime - Start time (HH:MM:SS)
 * @param {string} endTime - End time (HH:MM:SS)
 * @param {boolean} isStartDay - Whether we're checking the start day (true) or end day (false) of an overnight shift
 * @returns {boolean} True if time is within range
 */
function timeInRange(checkMinutes, startTime, endTime, isStartDay = true) {
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
}

/**
 * Gets the setter who should be on shift right now based on schedules
 * Checks both date-specific overrides and recurring schedules
 * @returns {Promise<{id: string, name: string} | null>} The setter's id and name, or null if no setter is scheduled
 */
async function getCurrentSetterOnShift() {
  try {
    // Get current time in Spain timezone
    const spainNow = getSpainTime();
    const currentDate = `${spainNow.year}-${String(spainNow.month).padStart(2, '0')}-${String(spainNow.day).padStart(2, '0')}`;
    const currentDayOfWeek = spainNow.dayOfWeek; // 0=Sunday, 1=Monday, etc.
    const currentTime = `${String(spainNow.hours).padStart(2, '0')}:${String(spainNow.minutes).padStart(2, '0')}:00`;
    const currentMinutes = timeToMinutes(currentTime);

    // Calculate next day for overnight shift checking
    const nextDate = new Date(spainNow.year, spainNow.month - 1, spainNow.day);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatDateLocal(nextDate);

    // First, check for date-specific overrides on today
    const { data: todayOverrides, error: todayError } = await supabase
      .from('setter_schedules')
      .select(`
        *,
        setters (
          id,
          name,
          discord_id
        )
      `)
      .eq('specific_date', currentDate)
      .not('specific_date', 'is', null);

    if (todayError) {
      console.error('Error fetching today\'s override schedules:', todayError);
    }

    // Check for date-specific overrides on next day (for overnight shifts ending today)
    const { data: nextDayOverrides, error: nextDayError } = await supabase
      .from('setter_schedules')
      .select(`
        *,
        setters (
          id,
          name,
          discord_id
        )
      `)
      .eq('specific_date', nextDateStr)
      .not('specific_date', 'is', null);

    if (nextDayError) {
      console.error('Error fetching next day override schedules:', nextDayError);
    }

    // Check today's overrides (start day of overnight shifts)
    if (todayOverrides && todayOverrides.length > 0) {
      const matchingOverride = todayOverrides.find(schedule => 
        timeInRange(currentMinutes, schedule.start_time, schedule.end_time, true)
      );
      
      if (matchingOverride && matchingOverride.setters) {
        return {
          id: matchingOverride.setters.id,
          name: matchingOverride.setters.name
        };
      }
    }

    // Check next day's overrides (end day of overnight shifts)
    if (nextDayOverrides && nextDayOverrides.length > 0) {
      const matchingOverride = nextDayOverrides.find(schedule => {
        const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
        if (isOvernight) {
          return timeInRange(currentMinutes, schedule.start_time, schedule.end_time, false);
        }
        return false;
      });
      
      if (matchingOverride && matchingOverride.setters) {
        return {
          id: matchingOverride.setters.id,
          name: matchingOverride.setters.name
        };
      }
    }

    // If no override found, check recurring schedules for today
    const { data: todayRecurring, error: recurringError } = await supabase
      .from('setter_schedules')
      .select(`
        *,
        setters (
          id,
          name,
          discord_id
        )
      `)
      .eq('day_of_week', currentDayOfWeek)
      .is('specific_date', null);

    if (recurringError) {
      console.error('Error fetching recurring schedules:', recurringError);
      return null;
    }

    if (todayRecurring && todayRecurring.length > 0) {
      const matchingRecurring = todayRecurring.find(schedule =>
        timeInRange(currentMinutes, schedule.start_time, schedule.end_time, true)
      );
      
      if (matchingRecurring && matchingRecurring.setters) {
        return {
          id: matchingRecurring.setters.id,
          name: matchingRecurring.setters.name
        };
      }
    }

    // Check previous day's recurring schedules (for overnight shifts ending today)
    const prevDayOfWeek = (currentDayOfWeek - 1 + 7) % 7; // Wrap around
    const { data: prevDayRecurring, error: prevDayError } = await supabase
      .from('setter_schedules')
      .select(`
        *,
        setters (
          id,
          name,
          discord_id
        )
      `)
      .eq('day_of_week', prevDayOfWeek)
      .is('specific_date', null);

    if (!prevDayError && prevDayRecurring && prevDayRecurring.length > 0) {
      const matchingRecurring = prevDayRecurring.find(schedule => {
        const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
        if (isOvernight) {
          return timeInRange(currentMinutes, schedule.start_time, schedule.end_time, false);
        }
        return false;
      });
      
      if (matchingRecurring && matchingRecurring.setters) {
        return {
          id: matchingRecurring.setters.id,
          name: matchingRecurring.setters.name
        };
      }
    }

    // No setter found
    return null;
  } catch (err) {
    console.error('Error in getCurrentSetterOnShift:', err);
    return null;
  }
}

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const setter = await getCurrentSetterOnShift();
    
    if (setter) {
      return res.status(200).json({
        success: true,
        setter: {
          id: setter.id,
          name: setter.name,
          time: currentTime
        }
      });
    } else {
      return res.status(200).json({
        success: true,
        setter: null,
        message: 'No setter is currently scheduled'
      });
    }
  } catch (error) {
    console.error('Error in current-setter API:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get current setter',
      message: error.message
    });
  }
}

