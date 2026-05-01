/**
 * GET /api/academic-stats
 * Fetches dashboard stats from the academic app (e.g. attendance / show-up rate).
 * Default date range: previous operational day, where the day starts at
 * ACADEMIC_DAY_START_HOUR_LOCAL in BUSINESS_TIMEZONE (same idea as "start shift").
 */

import { subDays, addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const ACADEMIC_APP_URL = process.env.ACADEMIC_APP_URL || 'https://academic.inglesahorita.com';
const ACADEMIC_ATTENDANCE_PATH = process.env.ACADEMIC_ATTENDANCE_PATH || '/api/attendance';

const BUSINESS_TZ =
  process.env.BUSINESS_TIMEZONE ||
  process.env.ACADEMIC_STATS_TIMEZONE ||
  'Europe/Madrid';

function shiftStartHourLocal() {
  const raw = process.env.ACADEMIC_DAY_START_HOUR_LOCAL ?? '6';
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 6;
  return Math.max(0, Math.min(23, n));
}

/**
 * Calendar date (yyyy-MM-dd) of the operational "business day" containing `now`:
 * before shift start hour, that is still the previous calendar day's business day.
 */
function businessYmdForInstant(now, tz, startHour) {
  const hour = Number(formatInTimeZone(now, tz, 'H'));
  const ymd = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  if (hour >= startHour) return ymd;
  const anchor = fromZonedTime(`${ymd}T12:00:00`, tz);
  return formatInTimeZone(subDays(anchor, 1), tz, 'yyyy-MM-dd');
}

/**
 * Completed operational day immediately before the current one: [prevStart, currentStart).
 * Matches academic "yesterday" when days are counted from shift start.
 */
function getPreviousShiftDayBounds(now = new Date()) {
  const startH = shiftStartHourLocal();
  const tz = BUSINESS_TZ;
  const currentBizYmd = businessYmdForInstant(now, tz, startH);
  const anchor = fromZonedTime(`${currentBizYmd}T12:00:00`, tz);
  const prevBizYmd = formatInTimeZone(subDays(anchor, 1), tz, 'yyyy-MM-dd');
  const pad = (n) => String(n).padStart(2, '0');
  const fromInstant = fromZonedTime(`${prevBizYmd}T${pad(startH)}:00:00.000`, tz);
  const toInstant = fromZonedTime(`${currentBizYmd}T${pad(startH)}:00:00.000`, tz);
  const toInclusive = new Date(toInstant.getTime() - 1);
  return {
    from: formatInTimeZone(fromInstant, tz, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    to: formatInTimeZone(toInclusive, tz, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    operationalYmd: prevBizYmd,
  };
}

function num(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unwrapPayload(data) {
  if (!data || typeof data !== 'object') return {};
  if (data.data != null && typeof data.data === 'object' && !Array.isArray(data.data)) {
    return { ...data, ...data.data };
  }
  return data;
}

/**
 * Normalize academic /api/attendance JSON (field names vary by version).
 */
function normalizeAttendance(data) {
  const r = unwrapPayload(data);
  let showUpRate = num(
    r.showUpRate ??
      r.show_up_rate ??
      r.showupRate ??
      r.attendanceRate ??
      r.rate ??
      r.percentage,
  );
  if (showUpRate != null && showUpRate >= 0 && showUpRate <= 1) {
    showUpRate *= 100;
  }

  const attended = num(
    r.attended ??
      r.present ??
      r.presentCount ??
      r.showedUp ??
      r.attendanceCount ??
      r.attendedStudents ??
      r.studentsPresent ??
      r.presents,
  );
  const expected = num(
    r.expected ??
      r.scheduled ??
      r.totalStudents ??
      r.enrolled ??
      r.totalExpected ??
      r.studentsExpected ??
      r.eligible ??
      r.booked,
  );

  const classCount = num(
    r.classCount ?? r.classesCount ?? r.numberOfClasses ?? r.sessionsCount ?? r.classes,
  );
  const totalAttendance = num(
    r.totalAttendance ?? r.totalAttendances ?? r.attendanceTotal ?? r.checkIns,
  );

  const attendancePresent = attended ?? totalAttendance ?? null;
  const attendanceTotal = expected ?? classCount ?? null;

  if (showUpRate == null && attendancePresent != null && attendanceTotal != null && attendanceTotal > 0) {
    showUpRate = (attendancePresent / attendanceTotal) * 100;
  }

  const avgAttendance = num(
    r.averageAttendance ?? r.avgAttendance ?? data?.averageAttendance ?? data?.avgAttendance,
  );

  return {
    avgAttendance,
    numberOfClasses: classCount ?? null,
    numberOfStudents: totalAttendance ?? null,
    attendancePresent,
    attendanceTotal,
    showUpRate,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shiftBounds = getPreviousShiftDayBounds();
  let from = req.query?.from ?? shiftBounds.from;
  let to = req.query?.to ?? shiftBounds.to;

  if (req.query?.startDate && req.query?.endDate && !req.query?.from && !req.query?.to) {
    const pad = (n) => String(n).padStart(2, '0');
    const startH = shiftStartHourLocal();
    const tz = BUSINESS_TZ;
    const startYmd = String(req.query.startDate).slice(0, 10);
    const endYmd = String(req.query.endDate).slice(0, 10);
    const fromInstant = fromZonedTime(`${startYmd}T${pad(startH)}:00:00.000`, tz);
    const endNoon = fromZonedTime(`${endYmd}T12:00:00`, tz);
    const nextYmd = formatInTimeZone(addDays(endNoon, 1), tz, 'yyyy-MM-dd');
    const toExclusive = fromZonedTime(`${nextYmd}T${pad(startH)}:00:00.000`, tz);
    from = formatInTimeZone(fromInstant, tz, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
    to = formatInTimeZone(new Date(toExclusive.getTime() - 1), tz, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
  }

  const params = new URLSearchParams({ startDate: from, endDate: to });
  const extra = process.env.ACADEMIC_ATTENDANCE_QUERY;
  if (extra) {
    const q = new URLSearchParams(extra.startsWith('?') ? extra.slice(1) : extra);
    q.forEach((v, k) => params.append(k, v));
  }

  const headers = { Accept: 'application/json' };
  if (process.env.ACADEMIC_API_BEARER) {
    headers.Authorization = `Bearer ${process.env.ACADEMIC_API_BEARER}`;
  }

  try {
    const url = `${ACADEMIC_APP_URL.replace(/\/$/, '')}${ACADEMIC_ATTENDANCE_PATH}?${params}`;
    const response = await fetch(url, { method: 'GET', headers });

    const text = await response.text();
    const looksJson =
      (response.headers.get('content-type') || '').includes('application/json') ||
      /^\s*[\[{]/.test(text);

    if (!response.ok) {
      console.warn('[academic-stats] Academic app returned', response.status, text?.slice(0, 200));
      return res.status(200).json({
        avgAttendance: null,
        numberOfClasses: null,
        numberOfStudents: null,
        attendancePresent: null,
        attendanceTotal: null,
        showUpRate: null,
        error: 'Academic app unavailable',
        raw: text?.slice(0, 500),
        window: { from, to, timezone: BUSINESS_TZ, shiftStartHourLocal: shiftStartHourLocal() },
      });
    }

    if (!looksJson || /<!doctype/i.test(text)) {
      console.warn('[academic-stats] Non-JSON response from academic app', text?.slice(0, 120));
      return res.status(200).json({
        avgAttendance: null,
        numberOfClasses: null,
        numberOfStudents: null,
        attendancePresent: null,
        attendanceTotal: null,
        showUpRate: null,
        error: 'Academic app returned non-JSON (check ACADEMIC_APP_URL / API route / auth)',
        raw: text?.slice(0, 300),
        window: { from, to, timezone: BUSINESS_TZ, shiftStartHourLocal: shiftStartHourLocal() },
      });
    }

    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }

    const norm = normalizeAttendance(parsed);

    return res.status(200).json({
      avgAttendance: norm.avgAttendance,
      numberOfClasses: norm.numberOfClasses,
      numberOfStudents: norm.numberOfStudents,
      attendancePresent: norm.attendancePresent,
      attendanceTotal: norm.attendanceTotal,
      showUpRate: norm.showUpRate,
      startDate: from,
      endDate: to,
      window: {
        from,
        to,
        operationalYmd: shiftBounds.operationalYmd,
        timezone: BUSINESS_TZ,
        shiftStartHourLocal: shiftStartHourLocal(),
      },
      raw: parsed,
    });
  } catch (err) {
    console.error('[academic-stats] Error fetching from academic app:', err.message);
    return res.status(200).json({
      avgAttendance: null,
      numberOfClasses: null,
      numberOfStudents: null,
      attendancePresent: null,
      attendanceTotal: null,
      showUpRate: null,
      error: err.message || 'Failed to fetch',
    });
  }
}
