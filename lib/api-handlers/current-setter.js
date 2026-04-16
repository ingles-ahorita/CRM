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
 * Gets UTC date/time components for an instant (default: real now).
 * Using UTC avoids DST shifts from local country timezone changes.
 */
function getUTCTime(now = new Date()) {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    hours: now.getUTCHours(),
    minutes: now.getUTCMinutes(),
    seconds: now.getUTCSeconds(),
    dayOfWeek: now.getUTCDay(),
  };
}

/**
 * Optional simulation for testing (query params). Returns { instant, error }.
 * - `at`: ISO 8601 (e.g. 2026-04-13T14:30:00.000Z)
 * - `utc_date` + `utc_time`: interpreted as UTC (date YYYY-MM-DD, time HH:MM or HH:MM:SS)
 */
function parseSimulatedUtcInstant(query) {
  if (!query || typeof query !== 'object') return { instant: null, error: null };

  const atRaw = query.at;
  if (atRaw != null && String(atRaw).trim() !== '') {
    const d = new Date(String(atRaw).trim());
    if (Number.isNaN(d.getTime())) {
      return {
        instant: null,
        error: 'Invalid `at` — use ISO 8601 (e.g. 2026-04-13T14:30:00.000Z)',
      };
    }
    return { instant: d, error: null };
  }

  const hasUd = query.utc_date != null && String(query.utc_date).trim() !== '';
  const hasUt = query.utc_time != null && String(query.utc_time).trim() !== '';
  if (!hasUd && !hasUt) return { instant: null, error: null };
  if (hasUd !== hasUt) {
    return {
      instant: null,
      error: 'Provide both utc_date and utc_time, or use `at`, or omit all for live time.',
    };
  }

  const dateStr = String(query.utc_date).trim();
  const timeStr = String(query.utc_time).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { instant: null, error: 'utc_date must be YYYY-MM-DD' };
  }

  const colonParts = timeStr.split(':');
  const timeNorm =
    colonParts.length === 2 ? `${timeStr}:00` : timeStr;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeNorm)) {
    return { instant: null, error: 'utc_time must be HH:MM or HH:MM:SS' };
  }

  const d = new Date(`${dateStr}T${timeNorm}Z`);
  if (Number.isNaN(d.getTime())) {
    return { instant: null, error: 'Invalid utc_date / utc_time combination' };
  }
  return { instant: d, error: null };
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
}

function formatDateUTC(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
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

async function getCurrentSetterOnShift(now = new Date()) {
  try {
    const utcNow = getUTCTime(now);
    const currentDate = `${utcNow.year}-${String(utcNow.month).padStart(2, '0')}-${String(utcNow.day).padStart(2, '0')}`;
    const currentDayOfWeek = utcNow.dayOfWeek;
    const currentTime = `${String(utcNow.hours).padStart(2, '0')}:${String(utcNow.minutes).padStart(2, '0')}:00`;
    const currentMinutes = timeToMinutes(currentTime);

    const nextDate = new Date(Date.UTC(utcNow.year, utcNow.month - 1, utcNow.day));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = formatDateUTC(nextDate);

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
    const q = req.query || {};
    const { instant: simulated, error: simError } = parseSimulatedUtcInstant(q);
    if (simError) {
      return res.status(400).json({ success: false, error: simError });
    }

    const effectiveNow = simulated ?? new Date();
    const utcNow = getUTCTime(effectiveNow);
    const currentDate = `${utcNow.year}-${String(utcNow.month).padStart(2, '0')}-${String(utcNow.day).padStart(2, '0')}`;
    const currentTime = `${String(utcNow.hours).padStart(2, '0')}:${String(utcNow.minutes).padStart(2, '0')}:${String(utcNow.seconds).padStart(2, '0')}`;
    const wallIso = new Date().toISOString();

    const setter = await getCurrentSetterOnShift(effectiveNow);

    const debug = {
      timezone: 'UTC',
      date: currentDate,
      time: currentTime,
      dayOfWeek: utcNow.dayOfWeek,
      evaluatedAt: effectiveNow.toISOString(),
      simulated: Boolean(simulated),
      serverTime: wallIso,
    };

    if (setter) {
      return res.status(200).json({
        success: true,
        setter: {
          id: setter.id,
          name: setter.name,
          discord_id: setter.discord_id
        },
        debug,
      });
    }
    return res.status(200).json({
      success: true,
      setter: null,
      message: 'No setter is currently scheduled',
      debug,
    });
  } catch (error) {
    console.error('Error in current-setter API:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get current setter',
      message: error.message
    });
  }
}
