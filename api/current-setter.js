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
    
    console.log('=== getCurrentSetterOnShift Debug ===');
    console.log('Spain time:', currentDate, currentTime, `(day ${currentDayOfWeek})`);
    console.log('Current minutes:', currentMinutes);

    // Calculate next day for overnight shift checking
    const nextDate = new Date(spainNow.year, spainNow.month - 1, spainNow.day);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatDateLocal(nextDate);

    // Fetch schedules using REST API with discord_id cast to text to prevent precision loss
    const fetchSchedulesWithDiscordAsText = async (queryParams) => {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      // Build the query URL
      let url = `${supabaseUrl}/rest/v1/setter_schedules?select=*,setters(id,name,discord_id::text)`;
      
      // Add query parameters
      const params = new URLSearchParams();
      if (queryParams.specific_date) {
        params.append('specific_date', `eq.${queryParams.specific_date}`);
      }
      if (queryParams.day_of_week !== undefined) {
        params.append('day_of_week', `eq.${queryParams.day_of_week}`);
      }
      if (queryParams.is_null_specific_date) {
        params.append('specific_date', 'is.null');
      }
      
      if (params.toString()) {
        url += '&' + params.toString();
      }
      
      const response = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Supabase REST API error: ${response.status}`);
      }
      
      return await response.json();
    };

    // First, check for date-specific overrides on today
    let todayOverrides = [];
    try {
      todayOverrides = await fetchSchedules(
        supabase
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
          .not('specific_date', 'is', null)
      );
    } catch (todayError) {
      console.error('Error fetching today\'s override schedules:', todayError);
    }

    if (todayError) {
      console.error('Error fetching today\'s override schedules:', todayError);
    }

    // Check for date-specific overrides on next day (for overnight shifts ending today)
    let nextDayOverrides = [];
    try {
      nextDayOverrides = await fetchSchedules(
        supabase
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
          .not('specific_date', 'is', null)
      );
    } catch (nextDayError) {
      console.error('Error fetching next day override schedules:', nextDayError);
    }

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
          name: matchingOverride.setters.name,
          discord_id: matchingOverride.setters.discord_id ? String(matchingOverride.setters.discord_id) : null
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
        // Convert discord_id to string immediately to prevent precision loss
        const discordId = matchingOverride.setters.discord_id;
        return {
          id: matchingOverride.setters.id,
          name: matchingOverride.setters.name,
          discord_id: discordId != null ? String(discordId) : null
        };
      }
    }

    // If no override found, check recurring schedules for today
    let todayRecurring = [];
    try {
      todayRecurring = await fetchSchedules(
        supabase
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
          .is('specific_date', null)
      );
    } catch (recurringError) {
      console.error('Error fetching recurring schedules:', recurringError);
    }

    if (recurringError) {
      console.error('Error fetching recurring schedules:', recurringError);
      return null;
    }

    if (todayRecurring && todayRecurring.length > 0) {
      console.log('Checking today recurring:', todayRecurring.length, 'schedules');
      todayRecurring.forEach(schedule => {
        const matches = timeInRange(currentMinutes, schedule.start_time, schedule.end_time, true);
        console.log(`Schedule ${schedule.id}: ${schedule.start_time}-${schedule.end_time}, setter: ${schedule.setters?.name} (${schedule.setters?.id}), discord_id: ${schedule.setters?.discord_id}, matches: ${matches}`);
      });
      
      const matchingRecurring = todayRecurring.find(schedule =>
        timeInRange(currentMinutes, schedule.start_time, schedule.end_time, true)
      );
      
      if (matchingRecurring && matchingRecurring.setters) {
        console.log('Matched recurring:', matchingRecurring.setters.name, 'discord_id:', matchingRecurring.setters.discord_id);
        // Convert discord_id to string immediately to prevent precision loss
        const discordId = matchingRecurring.setters.discord_id;
        return {
          id: matchingRecurring.setters.id,
          name: matchingRecurring.setters.name,
          discord_id: discordId != null ? String(discordId) : null
        };
      }
    }

    // Check previous day's recurring schedules (for overnight shifts ending today)
    const prevDayOfWeek = (currentDayOfWeek - 1 + 7) % 7; // Wrap around
    let prevDayRecurring = [];
    try {
      prevDayRecurring = await fetchSchedules(
        supabase
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
          .is('specific_date', null)
      );
    } catch (prevDayError) {
      console.error('Error fetching previous day recurring schedules:', prevDayError);
    }

    if (!prevDayError && prevDayRecurring && prevDayRecurring.length > 0) {
      const matchingRecurring = prevDayRecurring.find(schedule => {
        const isOvernight = timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time);
        if (isOvernight) {
          return timeInRange(currentMinutes, schedule.start_time, schedule.end_time, false);
        }
        return false;
      });
      
      if (matchingRecurring && matchingRecurring.setters) {
        // Convert discord_id to string immediately to prevent precision loss
        const discordId = matchingRecurring.setters.discord_id;
        return {
          id: matchingRecurring.setters.id,
          name: matchingRecurring.setters.name,
          discord_id: discordId != null ? String(discordId) : null
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
    // Get Spain time for debugging
    const spainNow = getSpainTime();
    const currentDate = `${spainNow.year}-${String(spainNow.month).padStart(2, '0')}-${String(spainNow.day).padStart(2, '0')}`;
    const currentTime = `${String(spainNow.hours).padStart(2, '0')}:${String(spainNow.minutes).padStart(2, '0')}:${String(spainNow.seconds).padStart(2, '0')}`;
    
    const setter = await getCurrentSetterOnShift();
    
    if (setter) {
      // Log the discord_id to see what we're getting
      console.log('Returning setter:', {
        id: setter.id,
        name: setter.name,
        discord_id: setter.discord_id,
        discord_id_type: typeof setter.discord_id
      });
      
      return res.status(200).json({
        success: true,
        setter: {
          id: setter.id,
          name: setter.name,
          discord_id: setter.discord_id ? String(setter.discord_id) : null
        },
        debug: {
          timezone: 'Europe/Madrid',
          date: currentDate,
          time: currentTime,
          dayOfWeek: spainNow.dayOfWeek,
          serverTime: new Date().toISOString(),
          discordIdRaw: setter.discord_id,
          discordIdType: typeof setter.discord_id,
          note: 'If discord_id precision is lost, the database column type must be TEXT/VARCHAR, not BIGINT'
        }
      });
    } else {
      return res.status(200).json({
        success: true,
        setter: null,
        message: 'No setter is currently scheduled',
        debug: {
          timezone: 'Europe/Madrid',
          date: currentDate,
          time: currentTime,
          dayOfWeek: spainNow.dayOfWeek,
          serverTime: new Date().toISOString()
        }
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

