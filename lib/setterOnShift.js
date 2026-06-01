// Shared "who is on shift right now / next" logic.
// Source of truth replicated from lib/api-handlers/current-setter.js
// so other server handlers (e.g. iclosed-webhook) can call it without HTTP.
//
// All schedule times are interpreted as UTC (matches existing current-setter behavior).
// setter_schedules columns used: day_of_week (0-6, Sun=0), specific_date (date-override),
// start_time, end_time (HH:MM:SS, end<=start means overnight), setters(id, name).

import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
  );
}

function getUTCTime(now) {
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

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
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
  }
  return checkMinutes >= startMinutes && checkMinutes <= endMinutes;
}

/**
 * Returns the single setter currently on shift, or null.
 * Mirrors getCurrentSetterOnShift in lib/api-handlers/current-setter.js.
 */
export async function getCurrentSetterOnShift(now = new Date()) {
  const supabase = getClient();
  try {
    const utcNow = getUTCTime(now);
    const currentDate = `${utcNow.year}-${String(utcNow.month).padStart(2, '0')}-${String(utcNow.day).padStart(2, '0')}`;
    const currentDayOfWeek = utcNow.dayOfWeek;
    const currentTime = `${String(utcNow.hours).padStart(2, '0')}:${String(utcNow.minutes).padStart(2, '0')}:00`;
    const currentMinutes = timeToMinutes(currentTime);

    const nextDate = new Date(Date.UTC(utcNow.year, utcNow.month - 1, utcNow.day));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = formatDateUTC(nextDate);

    // 1. today's overrides (specific_date = today)
    const { data: todayOverrides } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name)')
      .eq('specific_date', currentDate)
      .not('specific_date', 'is', null);
    if (todayOverrides?.length) {
      const m = todayOverrides.find((s) => timeInRange(currentMinutes, s.start_time, s.end_time, true));
      if (m?.setters) return { id: m.setters.id, name: m.setters.name, reason: 'override_today' };
    }

    // 2. yesterday's override that runs overnight into today
    const { data: nextDayOverrides } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name)')
      .eq('specific_date', nextDateStr)
      .not('specific_date', 'is', null);
    if (nextDayOverrides?.length) {
      const m = nextDayOverrides.find((s) => {
        const overnight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
        return overnight && timeInRange(currentMinutes, s.start_time, s.end_time, false);
      });
      if (m?.setters) return { id: m.setters.id, name: m.setters.name, reason: 'override_overnight' };
    }

    // 3. today's recurring
    const { data: todayRecurring } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name)')
      .eq('day_of_week', currentDayOfWeek)
      .is('specific_date', null);
    if (todayRecurring?.length) {
      const m = todayRecurring.find((s) => timeInRange(currentMinutes, s.start_time, s.end_time, true));
      if (m?.setters) return { id: m.setters.id, name: m.setters.name, reason: 'recurring_today' };
    }

    // 4. yesterday's recurring overnight
    const prevDayOfWeek = (currentDayOfWeek - 1 + 7) % 7;
    const { data: prevDayRecurring } = await supabase
      .from('setter_schedules')
      .select('*, setters(id, name)')
      .eq('day_of_week', prevDayOfWeek)
      .is('specific_date', null);
    if (prevDayRecurring?.length) {
      const m = prevDayRecurring.find((s) => {
        const overnight = timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
        return overnight && timeInRange(currentMinutes, s.start_time, s.end_time, false);
      });
      if (m?.setters) return { id: m.setters.id, name: m.setters.name, reason: 'recurring_overnight' };
    }

    return null;
  } catch (err) {
    console.error('[setterOnShift] getCurrentSetterOnShift error', err);
    return null;
  }
}

/**
 * Returns the next setter whose shift starts after `now`, or null if none in window.
 * Uses a coarse 15-minute forward scan up to maxHoursAhead (default 72).
 * Good enough for "no one on the clock" fallback assignment.
 */
export async function getNextScheduledSetter(now = new Date(), maxHoursAhead = 72) {
  const stepMs = 15 * 60 * 1000;
  const limit = Math.ceil((maxHoursAhead * 60) / 15);
  for (let i = 1; i <= limit; i += 1) {
    const probe = new Date(now.getTime() + i * stepMs);
    // eslint-disable-next-line no-await-in-loop
    const s = await getCurrentSetterOnShift(probe);
    if (s) {
      return { ...s, reason: 'next_scheduled', scheduled_for: probe.toISOString() };
    }
  }
  return null;
}
