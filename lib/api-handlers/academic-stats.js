/**
 * GET /api/academic-stats
 * Fetches dashboard stats from the academic app (e.g. avg attendance).
 * Academic app base URL: https://academic.inglesahorita.com
 */

const ACADEMIC_APP_URL = process.env.ACADEMIC_APP_URL || 'https://academic.inglesahorita.com';

/** Yesterday in UTC, YYYY-MM-DD. */
function getYesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Full UTC day bounds for a given date (YYYY-MM-DD): 00:00:00.000Z and 23:59:59.999Z. */
function getUTCDayBounds(dateStr) {
  const from = `${dateStr}T00:00:00.000+01:00`;
  const to = `${dateStr}T23:59:59.999+01:00`;
  return { from, to };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const yesterday = getYesterdayUTC();
  const startDate = req.query?.startDate ?? yesterday;
  const endDate = req.query?.endDate ?? yesterday;

  // Always send full UTC-day ISO bounds to the academic app
  const { from: fromStart } = getUTCDayBounds(startDate);
  const { to: toEnd } = getUTCDayBounds(endDate);

  const from = req.query?.from ?? fromStart;
  const to = req.query?.to ?? toEnd;

  const params = new URLSearchParams({
    startDate: from,
    endDate: to,
  });

  try {
    const response = await fetch(`${ACADEMIC_APP_URL}/api/attendance?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    

    if (!response.ok) {
      const text = await response.text();
      console.warn('[academic-stats] Academic app returned', response.status, text?.slice(0, 200));
      return res.status(200).json({
        avgAttendance: null,
        numberOfClasses: null,
        numberOfStudents: null,
        showUpRate: null,
        error: 'Academic app unavailable',
        raw: text,
      });
    }

    const data = await response.json().catch(() => ({}));
    const numberOfClasses = data.classCount ?? null;
    const numberOfStudents = data.totalAttendance ?? null;
    const showUpRate =
      data.showUpRate ?? data.show_up_rate ?? data.showupRate ?? data.data?.showUpRate ?? null;

    return res.status(200).json({
      avgAttendance: data.averageAttendance ?? data.avgAttendance ?? null,
      numberOfClasses: typeof numberOfClasses === 'number' ? numberOfClasses : null,
      numberOfStudents: typeof numberOfStudents === 'number' ? numberOfStudents : null,
      showUpRate: typeof showUpRate === 'number' ? showUpRate : null,
      startDate: from,
      endDate: to,
      raw: data,
    });
  } catch (err) {
    console.error('[academic-stats] Error fetching from academic app:', err.message);
    return res.status(200).json({
      avgAttendance: null,
      numberOfClasses: null,
      numberOfStudents: null,
      showUpRate: null,
      error: err.message || 'Failed to fetch',
    });
  }
}
