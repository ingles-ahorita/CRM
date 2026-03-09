/**
 * GET /api/closer-availability
 *
 * Fetches Calendly org members and availability schedules for assessment.
 * Returns all org members plus full availability data for closers (Emiliano, Daiana, Matias, Ana).
 */
const CALENDLY_PAT = process.env.CALENDLY_PAT || 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzU5MTQyODUwLCJqdGkiOiIyNTQxMTBjNC1iMzQ5LTQzMzQtODdhOS0xY2FlYWRhMmVjYTEiLCJ1c2VyX3V1aWQiOiIzZWQyOTYzNC1iYzY5LTQ4MjYtOGU2Yy1mNzJjMWEzZWIxMzgifQ.nB3bY9P-R8eezA0_Rk8QtAfo-3Hq8QqEASfLhCYJ8xIiiouBrGOLtT-MGyg7Xqmw0Y7VX-RHQBQxklpYAAtGFQ';
const BASE_URL = 'https://api.calendly.com';

const CLOSER_NAMES = ['Emiliano', 'Daiana', 'Matias', 'Ana'];

async function getJson(url) {
  const resp = await fetch(url, {
    headers: { Authorization: 'Bearer ' + CALENDLY_PAT }
  });
  return resp.json();
}

async function listAllMembers(orgUri) {
  let url = BASE_URL + '/organization_memberships?organization=' + encodeURIComponent(orgUri);
  const all = [];
  while (url) {
    const data = await getJson(url);
    all.push(...(data.collection || []));
    url = data.pagination?.next_page || null;
  }
  return all;
}

function getWeekDates(tz) {
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(date, tz) {
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

function sumIntervalsHours(intervals) {
  if (!intervals?.length) return 0;
  const parseHm = (s) => {
    const p = (s || '').split(':').map((n) => parseInt(n, 10) || 0);
    return (p[0] || 0) * 60 + (p[1] || 0);
  };
  const mins = intervals
    .filter((i) => i?.from && i?.to)
    .map((i) => [parseHm(i.from), parseHm(i.to)])
    .filter((pair) => pair[1] > pair[0])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  mins.forEach((iv) => {
    if (!merged.length) merged.push(iv);
    else {
      const last = merged[merged.length - 1];
      if (iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push(iv);
    }
  });
  const totalMinutes = merged.reduce((acc, iv) => acc + (iv[1] - iv[0]), 0);
  return totalMinutes / 60;
}

/** Week range in UTC, fixed for all. No timezone adaptation. Under 604800 sec (7 days). */
function getWeekRangeUTC() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 0
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  const startStr = mon.toISOString().split('.')[0] + 'Z';
  const startMs = mon.getTime();
  const endMs = startMs + (6 * 24 * 60 * 60 * 1000) + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000);
  const endStr = new Date(endMs).toISOString().split('.')[0] + 'Z';
  return { start: startStr, end: endStr };
}

/** UTC week dates [Mon,...,Sun] as YYYY-MM-DD. Same for all closers. */
function getUTCWeekDates() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Week dates [Mon,...,Sun] in the given timezone. Uses UTC week as reference, maps each day by weekday in TZ. */
function getLocalWeekDates(tz) {
  const utcDates = getUTCWeekDates();
  const tzSafe = tz || 'UTC';
  const byDow = {}; // dow index 0=Mon..6=Sun -> dateStr (local date in TZ)
  for (const dateStr of utcDates) {
    const noon = new Date(dateStr + 'T12:00:00.000Z');
    const dowKey = noon.toLocaleDateString('en-US', { timeZone: tzSafe, weekday: 'long' }).toLowerCase();
    const localDateStr = noon.toLocaleDateString('en-CA', { timeZone: tzSafe });
    const dowNum = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }[dowKey];
    if (dowNum !== undefined) byDow[dowNum] = localDateStr;
  }
  return [0, 1, 2, 3, 4, 5, 6].map((i) => byDow[i] ?? utcDates[i]);
}

/** Midnight-to-midnight bounds for a date in the given timezone, as UTC ms. */
function getLocalDayBounds(dateStr, tz) {
  const noonUtc = new Date(dateStr + 'T12:00:00.000Z');
  const localHour = parseInt(noonUtc.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10) || 0;
  const localMinute = parseInt(noonUtc.toLocaleString('en-US', { timeZone: tz, minute: 'numeric' }), 10) || 0;
  const dayStartMs = noonUtc.getTime() - (localHour * 60 + localMinute) * 60 * 1000;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  return { dayStartMs, dayEndMs };
}

/** Get availability windows [startMs, endMs] per day (UTC) from schedules. */
function getAvailabilityWindowsPerDay(schedules, tz, utcWeekDates) {
  const parseHm = (s) => {
    const p = (s || '').split(':').map((n) => parseInt(n, 10) || 0);
    return (p[0] || 0) * 60 + (p[1] || 0);
  };
  return utcWeekDates.map((dateStr) => {
    const noonUtc = new Date(dateStr + 'T12:00:00.000Z');
    const localHour = parseInt(noonUtc.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10) || 0;
    const localMinute = parseInt(noonUtc.toLocaleString('en-US', { timeZone: tz, minute: 'numeric' }), 10) || 0;
    const startOfDayMs = noonUtc.getTime() - (localHour * 60 + localMinute) * 60 * 1000;
    const localDateStr = noonUtc.toLocaleDateString('en-CA', { timeZone: tz });
    const dowKey = noonUtc.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const windows = [];
    for (const sched of schedules) {
      const rules = sched.rules || [];
      const weeklyRules = rules.filter((r) => r.type === 'wday');
      const dateRules = rules.filter((r) => r.type === 'date_specific_hours');
      const dateOverride = dateRules.find((r) => r.date === localDateStr);
      let intervals = [];
      if (dateOverride && Array.isArray(dateOverride.intervals)) {
        intervals = dateOverride.intervals;
      } else {
        weeklyRules.forEach((wr) => {
          (wr.intervals || []).forEach((interval) => {
            const days = wr.wday || [];
            if (days.includes(dowKey)) intervals.push(interval);
          });
        });
      }
      for (const iv of intervals || []) {
        if (!iv?.from || !iv?.to) continue;
        const fromMins = parseHm(iv.from);
        const toMins = parseHm(iv.to);
        if (toMins <= fromMins) continue;
        windows.push([
          startOfDayMs + fromMins * 60 * 1000,
          startOfDayMs + toMins * 60 * 1000,
        ]);
      }
    }
    windows.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const w of windows) {
      if (!merged.length) merged.push([...w]);
      else {
        const last = merged[merged.length - 1];
        if (w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
        else merged.push([...w]);
      }
    }
    return merged;
  });
}

/** Overlap of [a0,a1] with [b0,b1] in ms. */
function overlapMs(a0, a1, b0, b1) {
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  return Math.max(0, end - start);
}

/** Blocks are H:00 to H:45. Returns { count, blockHours } (blockHours = e.g. [14,15] for 2pm,3pm). */
function countBlockedHours(segments, dayStartMs) {
  const hourMs = 60 * 60 * 1000;
  const blockLenMs = 45 * 60 * 1000;
  const blocks = new Set();
  for (const [s, e] of segments) {
    for (let h = 0; h < 24; h++) {
      const blockStart = dayStartMs + h * hourMs;
      const blockEnd = blockStart + blockLenMs;
      if (s < blockEnd && e > blockStart) blocks.add(h);
    }
  }
  return { count: blocks.size, blockHours: [...blocks].sort((a, b) => a - b) };
}

/** Compute busy hours per day in LOCAL time: only within availability, 45-min blocks (H:00–H:45 local). Returns { busyPerDay, debug, slotBlocks }. */
function computeBusyHoursPerDay(collection, localWeekDates, availabilityPerDay, tz) {
  const result = new Array(7).fill(0);
  const debug = [];
  const slotBlocks = [];
  if (!Array.isArray(collection) || !localWeekDates?.length) return { busyPerDay: result, debug, slotBlocks };

  const validSlots = collection.filter((c) => c?.start_time && c?.end_time);
  const tzSafe = tz || 'UTC';

  for (const item of validSlots) {
    const slotStart = new Date(item.start_time).getTime();
    const slotEnd = new Date(item.end_time).getTime();
    const byDay = [];
    for (let i = 0; i < 7; i++) {
      const { dayStartMs, dayEndMs } = getLocalDayBounds(localWeekDates[i], tzSafe);
      const availWindows = availabilityPerDay[i] || [];
      const slotInDayStart = Math.max(slotStart, dayStartMs);
      const slotInDayEnd = Math.min(slotEnd, dayEndMs);
      const overlaps = [];
      for (const [w0, w1] of availWindows) {
        const oStart = Math.max(slotInDayStart, w0);
        const oEnd = Math.min(slotInDayEnd, w1);
        if (oEnd > oStart) overlaps.push([oStart, oEnd]);
      }
      const merged = [];
      overlaps.sort((a, b) => a[0] - b[0]);
      for (const [s, e] of overlaps) {
        if (!merged.length) merged.push([s, e]);
        else {
          const last = merged[merged.length - 1];
          if (s <= last[1]) last[1] = Math.max(last[1], e);
          else merged.push([s, e]);
        }
      }
      const { count, blockHours } = countBlockedHours(merged, dayStartMs);
      byDay.push({
        date: localWeekDates[i],
        blocksCount: count,
        blockHours: blockHours.map((h) => `${h}:00–${h}:45`),
      });
    }
    slotBlocks.push({ start: item.start_time, end: item.end_time, byDay });
  }

  for (let i = 0; i < 7; i++) {
    const { dayStartMs, dayEndMs } = getLocalDayBounds(localWeekDates[i], tzSafe);
    const availWindows = availabilityPerDay[i] || [];
    const segments = [];
    for (const item of collection) {
      const slotStart = new Date(item?.start_time).getTime();
      const slotEnd = new Date(item?.end_time).getTime();
      if (!item?.start_time || !item?.end_time || slotEnd <= slotStart) continue;
      const slotInDayStart = Math.max(slotStart, dayStartMs);
      const slotInDayEnd = Math.min(slotEnd, dayEndMs);
      if (slotInDayEnd <= slotInDayStart) continue;
      for (const [w0, w1] of availWindows) {
        const oStart = Math.max(slotInDayStart, w0);
        const oEnd = Math.min(slotInDayEnd, w1);
        if (oEnd > oStart) segments.push([oStart, oEnd]);
      }
    }
    segments.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of segments) {
      if (!merged.length) merged.push([s, e]);
      else {
        const last = merged[merged.length - 1];
        if (s <= last[1]) last[1] = Math.max(last[1], e);
        else merged.push([s, e]);
      }
    }
    const { count: blocked, blockHours } = countBlockedHours(merged, dayStartMs);
    result[i] = blocked;
    debug.push({
      date: localWeekDates[i],
      rawSlots: validSlots.map((c) => ({ start: c.start_time, end: c.end_time })),
      segmentsAfterAvail: merged.map(([s, e]) => ({
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        hours: ((e - s) / (1000 * 60 * 60)).toFixed(2),
      })),
      blockedCount: blocked,
      blockHours: blockHours.map((h) => `${h}:00–${h}:45`),
    });
  }
  return { busyPerDay: result.map((h) => Math.round(h * 10) / 10), debug, slotBlocks };
}

/** Sum busy hours from user_busy_times collection (items have start_time, end_time in ISO 8601). */
function sumBusyHours(collection) {
  if (!Array.isArray(collection) || collection.length === 0) return 0;
  let totalMs = 0;
  const intervals = [];
  for (const item of collection) {
    const s = item?.start_time;
    const e = item?.end_time;
    if (!s || !e) continue;
    const startMs = new Date(s).getTime();
    const endMs = new Date(e).getTime();
    if (endMs > startMs) {
      intervals.push([startMs, endMs]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of intervals) {
    if (!merged.length) merged.push(iv);
    else {
      const last = merged[merged.length - 1];
      if (iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push(iv);
    }
  }
  totalMs = merged.reduce((acc, iv) => acc + (iv[1] - iv[0]), 0);
  return totalMs / (1000 * 60 * 60);
}

/** Compute available hours per day for the given local week dates. Uses closer's timezone. */
function computeHoursPerDay(schedules, timezone, localWeekDates) {
  const tz = timezone || 'Europe/Madrid';
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayData = localWeekDates.map((dateStr, dayIndex) => {
    const noonUtc = new Date(dateStr + 'T12:00:00Z');
    const dowKey = noonUtc.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }).toLowerCase();
    const localDateStr = noonUtc.toLocaleDateString('en-CA', { timeZone: tz });
    let totalHours = 0;
    for (const sched of schedules) {
      const rules = sched.rules || [];
      const weeklyRules = rules.filter((r) => r.type === 'wday');
      const dateRules = rules.filter((r) => r.type === 'date_specific_hours');
      const dateOverride = dateRules.find((r) => r.date === localDateStr);
      let intervals = [];
      if (dateOverride && Array.isArray(dateOverride.intervals)) {
        intervals = dateOverride.intervals;
      } else {
        weeklyRules.forEach((wr) => {
          (wr.intervals || []).forEach((interval) => {
            const days = wr.wday || [];
            if (days.includes(dowKey)) intervals.push(interval);
          });
        });
      }
      totalHours += sumIntervalsHours(intervals);
    }
    const shortLabel = noonUtc.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
    return { date: dateStr, dayLabel: shortLabel, weekday: dayLabels[dayIndex], hours: Math.round(totalHours * 10) / 10 };
  });
  return dayData;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const me = await getJson(BASE_URL + '/users/me');
    const orgUri = me.resource?.current_organization;
    if (!orgUri) {
      return res.status(500).json({ error: 'No organization found', me });
    }

    const members = await listAllMembers(orgUri);
    const allMembers = members.map((m) => ({
      uri: m.user?.uri,
      name: m.user?.name,
      email: m.user?.email,
      timezone: m.user?.timezone,
      schedulingUrl: m.user?.scheduling_url,
      isCloser: CLOSER_NAMES.includes(m.user?.name?.trim?.()),
    }));

    const closers = allMembers.filter((m) => m.isCloser);

    // Fixed week range in UTC for all closers - no timezone adaptation, under 604800 sec
    const { start: weekStart, end: weekEnd } = getWeekRangeUTC();
    const rangeSeconds = (new Date(weekEnd).getTime() - new Date(weekStart).getTime()) / 1000;
    const utcWeekDates = getUTCWeekDates();

    const availabilityByCloser = [];
    const hoursGrid = [];
    const busyTimesByCloser = [];
    const occupancyByCloser = [];

    for (const closer of closers) {
      if (!closer.uri) continue;
      const schedResp = await getJson(BASE_URL + '/user_availability_schedules?user=' + encodeURIComponent(closer.uri));
      const schedules = schedResp.collection || [];
      const scheds = schedules.map((s) => ({
        uri: s.uri,
        name: s.name,
        rules: s.rules || [],
        rulesCount: (s.rules || []).length,
      }));
      availabilityByCloser.push({
        name: closer.name,
        uri: closer.uri,
        timezone: closer.timezone,
        schedulesCount: schedules.length,
        schedules: scheds,
      });
      const localWeekDates = getLocalWeekDates(closer.timezone);
      const days = computeHoursPerDay(scheds, closer.timezone, localWeekDates);
      const availableWeekTotal = days.reduce((s, d) => s + (d.hours || 0), 0);

      // user_busy_times: same start_time/end_time for all closers (only user varies)
      let busyCollection = [];
      let busyError = null;
      let busyRaw = null;
      const busyParams = { user: closer.uri, start_time: weekStart, end_time: weekEnd };
      const busyUrl = BASE_URL + '/user_busy_times?' + new URLSearchParams(busyParams);
      const busyResp = await fetch(busyUrl, {
        headers: { Authorization: 'Bearer ' + CALENDLY_PAT }
      });
      const busyData = await busyResp.json();
      busyRaw = { params: { start_time: weekStart, end_time: weekEnd }, status: busyResp.status, response: busyData };
      if (busyResp.ok && Array.isArray(busyData.collection)) {
        busyCollection = busyData.collection;
      } else {
        busyError = busyData?.message || busyData?.errors?.[0]?.message || `HTTP ${busyResp.status}`;
        // Fallback: scheduled_events (accepts past dates)
        const eventsUrl = BASE_URL + '/scheduled_events?' + new URLSearchParams({
          user: closer.uri,
          min_start_time: weekStart,
          max_start_time: weekEnd,
          status: 'active',
        });
        const eventsResp = await fetch(eventsUrl, { headers: { Authorization: 'Bearer ' + CALENDLY_PAT } });
        const eventsData = await eventsResp.json();
        if (eventsResp.ok && Array.isArray(eventsData.collection)) {
          let allEvents = [...(eventsData.collection || [])];
          let nextPage = eventsData.pagination?.next_page;
          while (nextPage) {
            const pageResp = await fetch(nextPage, { headers: { Authorization: 'Bearer ' + CALENDLY_PAT } });
            const pageData = await pageResp.json();
            allEvents = allEvents.concat(pageData.collection || []);
            nextPage = pageData.pagination?.next_page;
          }
          busyCollection = allEvents.filter((e) => e.start_time && e.end_time).map((e) => ({ start_time: e.start_time, end_time: e.end_time }));
          busyError = null;
        }
      }

      const availabilityPerDay = getAvailabilityWindowsPerDay(scheds, closer.timezone || 'Europe/Madrid', localWeekDates);
      const { busyPerDay, debug: busyDebug, slotBlocks } = computeBusyHoursPerDay(busyCollection, localWeekDates, availabilityPerDay, closer.timezone);
      const busyHoursTotal = busyPerDay.reduce((s, h) => s + h, 0);
      const daysWithBusy = days.map((d, i) => ({ ...d, busyHours: busyPerDay[i] ?? 0 }));
      hoursGrid.push({ name: closer.name, timezone: closer.timezone, days: daysWithBusy });

      const occupancyPct = availableWeekTotal > 0
        ? Math.round((busyHoursTotal / availableWeekTotal) * 100)
        : 0;

      busyTimesByCloser.push({
        name: closer.name,
        uri: closer.uri,
        timezone: closer.timezone,
        busySlots: busyCollection,
        slotBlocks, // per-slot: byDay with blocksCount & blockHours for hover debug
        busyHoursTotal: Math.round(busyHoursTotal * 10) / 10,
        error: busyError,
        raw: busyRaw,
        busyDebug: busyDebug,
      });

      occupancyByCloser.push({
        name: closer.name,
        availableHours: Math.round(availableWeekTotal * 10) / 10,
        busyHours: Math.round(busyHoursTotal * 10) / 10,
        occupancyPct,
        freeHours: Math.round((availableWeekTotal - busyHoursTotal) * 10) / 10,
      });
    }

    const missingClosers = CLOSER_NAMES.filter(
      (n) => !allMembers.some((m) => (m.name || '').trim() === n)
    );

    return res.status(200).json({
      closerNames: CLOSER_NAMES,
      allMembers,
      closersFound: closers.length,
      availabilityByCloser,
      hoursGrid,
      busyTimesByCloser,
      occupancyByCloser,
      busyTimesRange: {
        start_time: weekStart,
        end_time: weekEnd,
        rangeSeconds,
        note: 'Fixed UTC range for all closers. No timezone adaptation.',
      },
      missingClosers,
      rawMe: me.resource || me,
    });
  } catch (err) {
    console.error('[closer-availability]', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
