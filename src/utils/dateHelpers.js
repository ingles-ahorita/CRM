import { fromZonedTime, toZonedTime, format, formatInTimeZone } from 'date-fns-tz';
import { startOfMonth, endOfMonth, getYear, getMonth, parseISO, addDays, subDays, subWeeks } from 'date-fns';

/**
 * Default timezone for normalization (can be changed based on business needs)
 * Common options: 'UTC', 'America/New_York', 'Europe/Madrid', etc.
 */
export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Normalize a date to a specific timezone
 * Converts any date string/Date object to a Date object representing that moment in the target timezone
 * @param {string|Date} dateValue - Date string or Date object
 * @param {string} timezone - Target timezone (default: DEFAULT_TIMEZONE)
 * @returns {Date} Date object normalized to the target timezone
 */
export function normalizeToTimezone(dateValue, timezone = DEFAULT_TIMEZONE) {
  if (!dateValue) return null;
  
  // Parse date string as UTC if it doesn't have timezone indicator (matches SQL date_trunc behavior)
  let date;
  if (typeof dateValue === 'string') {
    // If no timezone indicator, append 'Z' to force UTC parsing
    const hasTimezone = dateValue.includes('Z') || dateValue.match(/[+-]\d{2}:?\d{2}$/);
    const isoString = hasTimezone ? dateValue : dateValue + 'Z';
    date = parseISO(isoString);
  } else {
    date = dateValue;
  }
  
  // If already in UTC or target timezone, convert to zoned time
  if (timezone === 'UTC') {
    // For UTC, we want the date as-is but ensure it's treated as UTC
    return new Date(date.toISOString());
  }
  
  // Convert UTC date to zoned time
  return toZonedTime(date, timezone);
}

/**
 * Get year and month from a date normalized to a timezone
 * @param {string|Date} dateValue - Date string or Date object
 * @param {string} timezone - Target timezone (default: DEFAULT_TIMEZONE)
 * @returns {Object} Object with year and month (1-indexed)
 */
export function getYearMonthInTimezone(dateValue, timezone = DEFAULT_TIMEZONE) {
  if (!dateValue) return null;
  
  // Parse date string as UTC if it doesn't have timezone indicator (matches SQL date_trunc behavior)
  let date;
  if (typeof dateValue === 'string') {
    // If no timezone indicator, append 'Z' to force UTC parsing
    const hasTimezone = dateValue.includes('Z') || dateValue.match(/[+-]\d{2}:?\d{2}$/);
    const isoString = hasTimezone ? dateValue : dateValue + 'Z';
    date = parseISO(isoString);
  } else {
    date = dateValue;
  }
  
  // For UTC, use native Date UTC methods to avoid timezone conversion issues
  if (timezone === 'UTC') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // getUTCMonth returns 0-indexed
    return {
      year,
      month,
      monthKey: `${year}-${String(month).padStart(2, '0')}`
    };
  }
  
  // For other timezones, use formatInTimeZone to extract year/month in that timezone
  // This ensures we get the correct values regardless of the system timezone
  const yearStr = formatInTimeZone(date, timezone, 'yyyy');
  const monthStr = formatInTimeZone(date, timezone, 'MM');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  return {
    year,
    month,
    monthKey: `${year}-${monthStr}`
  };
}

/**
 * Get start and end of month in a specific timezone
 * @param {string|Date} dateValue - Date string or Date object (any date in the month)
 * @param {string} timezone - Target timezone (default: DEFAULT_TIMEZONE)
 * @returns {Object} Object with startDate and endDate as Date objects
 */
export function getMonthRangeInTimezone(dateValue, timezone = DEFAULT_TIMEZONE) {
  if (!dateValue) return null;
  
  // Parse date string as UTC if it doesn't have timezone indicator
  let date;
  if (typeof dateValue === 'string') {
    const hasTimezone = dateValue.includes('Z') || dateValue.match(/[+-]\d{2}:?\d{2}$/);
    const isoString = hasTimezone ? dateValue : dateValue + 'Z';
    date = parseISO(isoString);
  } else {
    date = dateValue;
  }
  
  // For UTC, use UTC methods directly
  if (timezone === 'UTC') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed
    
    // Create start of month in UTC
    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    
    // Create end of month in UTC (last day of month, 23:59:59.999)
    const lastDay = new Date(Date.UTC(year, month + 1, 0)); // Day 0 of next month = last day of current month
    const monthEnd = new Date(Date.UTC(year, month, lastDay.getUTCDate(), 23, 59, 59, 999));
    
    return {
      startDate: monthStart,
      endDate: monthEnd
    };
  }
  
  // For non-UTC timezones, normalize to timezone, get start/end, then convert back to UTC
  const normalizedDate = normalizeToTimezone(date, timezone);
  if (!normalizedDate) return null;
  
  const monthStart = startOfMonth(normalizedDate);
  const monthEnd = endOfMonth(normalizedDate);
  
  // Convert the zoned times back to UTC
  const startUTC = fromZonedTime(monthStart, timezone);
  const endUTC = fromZonedTime(monthEnd, timezone);
  
  return {
    startDate: startUTC,
    endDate: endUTC
  };
}

/**
 * Get week bounds in UTC (Monday 00:00 UTC – Sunday 23:59:59.999 UTC).
 * Week always starts on Monday. Use for consistent weekly stats.
 * @param {Date|string} dateValue - Any date in the target week
 * @returns {{ weekStart: Date, weekEnd: Date }}
 */
export function getWeekBoundsUTC(dateValue) {
  const date = typeof dateValue === 'string' ? parseISO(dateValue.includes('Z') ? dateValue : dateValue + 'Z') : new Date(dateValue);
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday, 6 = Sunday
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dayOfWeek, 0, 0, 0, 0));
  const weekEnd = addDays(weekStart, 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

/**
 * Last N days in UTC (YYYY-MM-DD), oldest first. Ends at today (UTC).
 * @param {number} n - Number of days
 * @returns {string[]}
 */
export function getLastDaysUTC(n) {
  const out = [];
  const today = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
    0, 0, 0, 0
  ));
  for (let i = n - 1; i >= 0; i--) {
    const d = subDays(today, i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Day bounds in local timezone (browser's timezone).
 * Use for tab filtering (Today, Yesterday, etc.) so users see their local day.
 * @param {Date|string} dateValue
 * @returns {{ dayStart: Date, dayEnd: Date }}
 */
export function getDayBoundsLocal(dateValue) {
  const date = typeof dateValue === 'string' ? parseISO(dateValue.includes('Z') ? dateValue : dateValue + 'Z') : new Date(dateValue);
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const dayStart = new Date(y, m, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m, d, 23, 59, 59, 999);
  return { dayStart, dayEnd };
}

/**
 * Day bounds in UTC for a given date (00:00:00.000Z – 23:59:59.999Z).
 * @param {Date|string} dateValue
 * @returns {{ dayStart: Date, dayEnd: Date }}
 */
export function getDayBoundsUTC(dateValue) {
  const date = typeof dateValue === 'string' ? parseISO(dateValue.includes('Z') ? dateValue : dateValue + 'Z') : new Date(dateValue);
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  return { dayStart, dayEnd };
}

/**
 * Week bounds for a given week offset (0 = current week, 1 = previous week, etc.).
 * @param {number} weekOffset
 * @returns {{ weekStart: Date, weekEnd: Date }}
 */
export function getWeekBoundsForOffset(weekOffset = 0) {
  const now = new Date();
  const { weekStart } = getWeekBoundsUTC(now);
  const targetWeekStart = weekOffset === 0 ? weekStart : subWeeks(weekStart, weekOffset);
  return getWeekBoundsUTC(targetWeekStart);
}

/**
 * Format date as ISO UTC string for start of day (00:00:00.000Z).
 * @param {Date} date
 */
export function formatDateUTCStart(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
}

/**
 * Format date as ISO UTC string for end of day (23:59:59.999Z).
 * @param {Date} date
 */
export function formatDateUTCEnd(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T23:59:59.999Z`;
}

/**
 * Compare two dates normalized to the same timezone
 * Useful for checking if dates are in the same month
 * @param {string|Date} date1 - First date
 * @param {string|Date} date2 - Second date
 * @param {string} timezone - Target timezone (default: DEFAULT_TIMEZONE)
 * @returns {boolean} True if dates are in the same month
 */
export function isSameMonthInTimezone(date1, date2, timezone = DEFAULT_TIMEZONE) {
  if (!date1 || !date2) return false;
  
  const month1 = getYearMonthInTimezone(date1, timezone);
  const month2 = getYearMonthInTimezone(date2, timezone);
  
  if (!month1 || !month2) return false;
  
  return month1.year === month2.year && month1.month === month2.month;
}

export function formatTimeAgo(dateString) {
  if (!dateString) return '-';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export function formatTimeWithRelative(dateString, timezone) {
  if (!dateString) return '-';
  // If no timezone is given, use user's local timezone
  if (!timezone) timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Date(dateString);
  const timeStr = date.toLocaleString('en-US', {
    year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: timezone
  });
  
  const diffMs = Date.now() - date;
  const diffMinutes = Math.floor(diffMs / 60000);
  
  return timeStr;
}

export function getUTCOffset(timeZone) {
  if (!timeZone) return;
  
  const date = new Date();
  
  // Format date in target timezone
  const tzString = date.toLocaleString('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Format date in UTC
  const utcString = date.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Calculate offset in minutes
  const tzTime = new Date(tzString).getTime();
  const utcTime = new Date(utcString).getTime();
  const offsetMinutes = (tzTime - utcTime) / (1000 * 60);
  
  // Convert to hours and minutes
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;
  
  // Format as ±HH:MM
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}