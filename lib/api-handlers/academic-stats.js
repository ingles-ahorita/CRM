/**
 * GET /api/academic-stats
 * Fetches dashboard stats from the academic app (e.g. avg attendance).
 * Academic app base URL: https://academic.inglesahorita.com
 */

const ACADEMIC_APP_URL = process.env.ACADEMIC_APP_URL || 'https://academic.inglesahorita.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(`${ACADEMIC_APP_URL}/api/attendance`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('[academic-stats] Academic app returned', response.status, text?.slice(0, 200));
      return res.status(200).json({
        avgAttendance: null,
        error: 'Academic app unavailable',
        details: response.status,
      });
    }

    const data = await response.json().catch(() => ({}));
    // Support { avgAttendance: number } or { average_attendance: number } or nested
    const avgAttendance =
      data.avgAttendance ??
      data.average_attendance ??
      data.attendance?.average ??
      data.data?.avgAttendance ??
      null;

    return res.status(200).json({
      avgAttendance: avgAttendance ?? null,
      raw: data,
    });
  } catch (err) {
    console.error('[academic-stats] Error fetching from academic app:', err.message);
    return res.status(200).json({
      avgAttendance: null,
      error: err.message || 'Failed to fetch',
    });
  }
}
