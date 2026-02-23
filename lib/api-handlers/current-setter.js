import { createClient } from '@supabase/supabase-js';

// In Vercel serverless functions, use the raw env var names
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Import the getCurrentSetterOnShift logic
// Since we can't import from src/, we'll copy the essential parts here
// But actually, let's just recreate it simply here

/**
 * Gets the current date and time components in Spain timezone (CET/CEST)
 */
function getSpainTime() {
  const now = new Date();
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
  
  const [datePart, timePart] = spainTimeStr.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hours, minutes, seconds] = timePart.split(':');
  const spainDate = new Date(year, month - 1, day, hours, minutes, seconds);
  
  return {
    year: parseInt(year),
    month: parseInt(month),
    day: parseInt(day),
    hours: parseInt(hours),
    minutes: parseInt(minutes),
    seconds: parseInt(seconds),
    dayOfWeek: spainDate.getDay()
  };
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
}

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeInRange(checkMinutes, startTime, endTime, isStartDay = true) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const isOvernight = endMinutes <= startMinutes;
  
  if (isOvernight) {
    return isStartDay ? checkMinutes >= startMinutes : checkMinutes <= endMinutes;
  } else {
    return checkMinutes >= startMinutes && checkMinutes <= endMinutes;
  }
}

async function getCurrentSetterOnShift() {
  try {
    const spainNow = getSpainTime();
    const currentDate = `${spainNow.year}-${String(spainNow.month).padStart(2, '0')}-${String(spainNow.day).padStart(2, '0')}`;
    const currentDayOfWeek = spainNow.dayOfWeek;
    const currentTime = `${String(spainNow.hours).padStart(2, '0')}:${String(spainNow.minutes).padStart(2, '0')}:00`;
    const currentMinutes = timeToMinutes(currentTime);

    const nextDate = new Date(spainNow.year, spainNow.month - 1, spainNow.day);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatDateLocal(nextDate);

    // Check today's overrides
    const { data: todayOverrides } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name, discord_id)')
      .eq('specific_date', currentDate)
      .not('specific_date', 'is', null);

    if (todayOverrides?.length > 0) {
      const matching = todayOverrides.find(s => 
        timeInRange(currentMinutes, s.start_time, s.end_time, true)
      );
      if (matching?.setters) {
        return {
          id: matching.setters.id,
          name: matching.setters.name,
          discord_id: matching.setters.discord_id ? String(matching.setters.discord_id) : null
        };
      }
    }

    // Check next day's overrides (for overnight shifts)
    const { data: nextDayOverrides } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name, discord_id)')
      .eq('specific_date', nextDateStr)
      .not('specific_date', 'is', null);

    if (nextDayOverrides?.length > 0) {
      const matching = nextDayOverrides.find(s => {
        const isOvernight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
        return isOvernight && timeInRange(currentMinutes, s.start_time, s.end_time, false);
      });
      if (matching?.setters) {
        return {
          id: matching.setters.id,
          name: matching.setters.name,
          discord_id: matching.setters.discord_id ? String(matching.setters.discord_id) : null
        };
      }
    }

    // Check recurring schedules for today
    const { data: todayRecurring } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name, discord_id)')
      .eq('day_of_week', currentDayOfWeek)
      .is('specific_date', null);

    if (todayRecurring?.length > 0) {
      const matching = todayRecurring.find(s =>
        timeInRange(currentMinutes, s.start_time, s.end_time, true)
      );
      if (matching?.setters) {
        return {
          id: matching.setters.id,
          name: matching.setters.name,
          discord_id: matching.setters.discord_id ? String(matching.setters.discord_id) : null
        };
      }
    }

    // Check previous day's recurring schedules (for overnight shifts)
    const prevDayOfWeek = (currentDayOfWeek - 1 + 7) % 7;
    const { data: prevDayRecurring } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name, discord_id)')
      .eq('day_of_week', prevDayOfWeek)
      .is('specific_date', null);

    if (prevDayRecurring?.length > 0) {
      const matching = prevDayRecurring.find(s => {
        const isOvernight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
        return isOvernight && timeInRange(currentMinutes, s.start_time, s.end_time, false);
      });
      if (matching?.setters) {
        return {
          id: matching.setters.id,
          name: matching.setters.name,
          discord_id: matching.setters.discord_id ? String(matching.setters.discord_id) : null
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Error in getCurrentSetterOnShift:', err);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const spainNow = getSpainTime();
    const currentDate = `${spainNow.year}-${String(spainNow.month).padStart(2, '0')}-${String(spainNow.day).padStart(2, '0')}`;
    const currentTime = `${String(spainNow.hours).padStart(2, '0')}:${String(spainNow.minutes).padStart(2, '0')}:${String(spainNow.seconds).padStart(2, '0')}`;
    
    const setter = await getCurrentSetterOnShift();
    
    if (setter) {
      return res.status(200).json({
        success: true,
        setter: {
          id: setter.id,
          name: setter.name,
          discord_id: setter.discord_id
        },
        debug: {
          timezone: 'Europe/Madrid',
          date: currentDate,
          time: currentTime,
          dayOfWeek: spainNow.dayOfWeek,
          serverTime: new Date().toISOString()
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
