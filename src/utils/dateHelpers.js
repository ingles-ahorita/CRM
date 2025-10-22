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