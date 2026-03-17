import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const ADS_PATH = '/ads-new-masterclass-job';
const ADS_OPT_IN_PATH = '/ads-opt-in-masterclass';
const ORGANIC_VSL_PATH = '/masterclass-job';
const ORGANIC_OPT_IN_PATHS = '/pro,/'; // /pro and root

const defaultStart = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
})();
const defaultEnd = new Date().toISOString().slice(0, 10);

export default function GoogleAnalyticsPage() {
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataAds, setDataAds] = useState({ rows: [], pagePath: ADS_PATH, mock: false });
  const [dataOrganic, setDataOrganic] = useState({ rows: [], pagePath: '(all except ads)', mock: false });
  const [dataWholeSite, setDataWholeSite] = useState({ rows: [], mock: false });
  const [dataAdsOptIn, setDataAdsOptIn] = useState({ rows: [], pagePath: ADS_OPT_IN_PATH, mock: false });
  const [dataOrganicOptIn, setDataOrganicOptIn] = useState({ rows: [], pagePath: '(/pro, /)', mock: false });
  const [sessionsAdsVsl, setSessionsAdsVsl] = useState({ rows: [] });
  const [sessionsAdsOptIn, setSessionsAdsOptIn] = useState({ rows: [] });
  const [sessionsOrganicVsl, setSessionsOrganicVsl] = useState({ rows: [] });
  const [sessionsOrganicOptIn, setSessionsOrganicOptIn] = useState({ rows: [] });

  const formatDateLabel = (d) => {
    if (!d) return d;
    const s = String(d);
    if (s.length === 8) return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
    if (s.length === 10 && s[4] === '-' && s[7] === '-') return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`;
    return d;
  };

  const fetchViews = async () => {
    setError(null);
    setLoading(true);
    try {
      const urlAds = `/api/google-analytics?${new URLSearchParams({ pagePath: ADS_PATH, startDate, endDate }).toString()}`;
      const urlOrganic = `/api/google-analytics?${new URLSearchParams({ pagePath: ORGANIC_VSL_PATH, startDate, endDate }).toString()}`;
      const urlWholeSite = `/api/google-analytics?${new URLSearchParams({ wholeSite: '1', startDate, endDate }).toString()}`;
      const urlAdsOptIn = `/api/google-analytics?${new URLSearchParams({ pagePath: ADS_OPT_IN_PATH, startDate, endDate }).toString()}`;
      const urlOrganicOptIn = `/api/google-analytics?${new URLSearchParams({ pagePaths: ORGANIC_OPT_IN_PATHS, startDate, endDate }).toString()}`;
      const sessionsParams = { startDate, endDate, metric: 'sessions' };
      const urlSessionsAdsVsl = `/api/google-analytics?${new URLSearchParams({ ...sessionsParams, pagePath: ADS_PATH }).toString()}`;
      const urlSessionsAdsOptIn = `/api/google-analytics?${new URLSearchParams({ ...sessionsParams, pagePath: ADS_OPT_IN_PATH }).toString()}`;
      const urlSessionsOrganicVsl = `/api/google-analytics?${new URLSearchParams({ ...sessionsParams, pagePath: ORGANIC_VSL_PATH }).toString()}`;
      const urlSessionsOrganicOptIn = `/api/google-analytics?${new URLSearchParams({ ...sessionsParams, pagePaths: ORGANIC_OPT_IN_PATHS }).toString()}`;
      console.log('[GA] Fetching ads, organic, whole site, opt-in, conversion sessions');

      const [resAds, resOrganic, resWholeSite, resAdsOptIn, resOrganicOptIn, resSessAdsVsl, resSessAdsOptIn, resSessOrgVsl, resSessOrgOptIn] = await Promise.all([
        fetch(urlAds),
        fetch(urlOrganic),
        fetch(urlWholeSite),
        fetch(urlAdsOptIn),
        fetch(urlOrganicOptIn),
        fetch(urlSessionsAdsVsl),
        fetch(urlSessionsAdsOptIn),
        fetch(urlSessionsOrganicVsl),
        fetch(urlSessionsOrganicOptIn),
      ]);

      const parse = async (res, label) => {
        const text = await res.text();
        console.log(`[GA] ${label}:`, {
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get('content-type'),
          bodyLength: text?.length,
        });
        let json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (parseErr) {
          console.error(`[GA] ${label} JSON parse failed:`, parseErr.message);
          throw new Error(`Invalid response (${label}): ${parseErr.message}`);
        }
      if (!res.ok) {
        const parts = [json.error || json.details || res.statusText];
        if (json.code) parts.push(`(code: ${json.code})`);
        if (json.hint) parts.push(`— ${json.hint}`);
          throw new Error(parts.join(' '));
        }
        return json;
      };

      const [jsonAds, jsonOrganic, jsonWholeSite, jsonAdsOptIn, jsonOrganicOptIn, jsonSessAdsVsl, jsonSessAdsOptIn, jsonSessOrgVsl, jsonSessOrgOptIn] = await Promise.all([
        parse(resAds, 'ads'),
        parse(resOrganic, 'organic'),
        parse(resWholeSite, 'whole site'),
        parse(resAdsOptIn, 'ads opt-in'),
        parse(resOrganicOptIn, 'organic opt-in'),
        parse(resSessAdsVsl, 'sessions ads vsl'),
        parse(resSessAdsOptIn, 'sessions ads opt-in'),
        parse(resSessOrgVsl, 'sessions organic vsl'),
        parse(resSessOrgOptIn, 'sessions organic opt-in'),
      ]);

      console.log('[GA] Success:', {
        ads: jsonAds.rows?.length ?? 0,
        organic: jsonOrganic.rows?.length ?? 0,
        wholeSite: jsonWholeSite.rows?.length ?? 0,
        adsOptIn: jsonAdsOptIn.rows?.length ?? 0,
        organicOptIn: jsonOrganicOptIn.rows?.length ?? 0,
      });

      setDataAds({
        rows: jsonAds.rows || [],
        pagePath: jsonAds.pagePath || ADS_PATH,
        mock: !!jsonAds.mock,
      });
      setDataOrganic({
        rows: jsonOrganic.rows || [],
        pagePath: jsonOrganic.pagePath || ORGANIC_VSL_PATH,
        mock: !!jsonOrganic.mock,
      });
      setDataWholeSite({
        rows: jsonWholeSite.rows || [],
        mock: !!jsonWholeSite.mock,
      });
      setDataAdsOptIn({
        rows: jsonAdsOptIn.rows || [],
        pagePath: jsonAdsOptIn.pagePath || ADS_OPT_IN_PATH,
        mock: !!jsonAdsOptIn.mock,
      });
      setDataOrganicOptIn({
        rows: jsonOrganicOptIn.rows || [],
        pagePath: jsonOrganicOptIn.pagePath || '(/pro, /)',
        mock: !!jsonOrganicOptIn.mock,
      });
      setSessionsAdsVsl({ rows: jsonSessAdsVsl.rows || [] });
      setSessionsAdsOptIn({ rows: jsonSessAdsOptIn.rows || [] });
      setSessionsOrganicVsl({ rows: jsonSessOrgVsl.rows || [] });
      setSessionsOrganicOptIn({ rows: jsonSessOrgOptIn.rows || [] });
    } catch (err) {
      console.error('[GA] Request failed:', err);
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const toChartData = (rows) =>
    (rows || []).map((r) => ({
      date: r.date,
      views: r.views,
      eventCount: r.eventCount ?? 0,
      bookingRate: r.bookingRate ?? 0,
      label: r.date ? r.date.slice(5) : r.date,
      ...(r.byPath && { byPath: r.byPath }),
    }));

  const chartAds = toChartData(dataAds.rows);
  const chartOrganic = toChartData(dataOrganic.rows);
  const chartAdsOptIn = toChartData(dataAdsOptIn.rows);
  const chartOrganicOptIn = toChartData(dataOrganicOptIn.rows);

  const toSessionsByDate = (rows) => {
    const map = {};
    (rows || []).forEach((r) => {
      if (r.date) map[r.date] = r.sessions ?? 0;
    });
    return map;
  };
  const sessAdsVsl = toSessionsByDate(sessionsAdsVsl.rows);
  const sessAdsOptIn = toSessionsByDate(sessionsAdsOptIn.rows);
  const sessOrgVsl = toSessionsByDate(sessionsOrganicVsl.rows);
  const sessOrgOptIn = toSessionsByDate(sessionsOrganicOptIn.rows);
  const allDates = [...new Set([
    ...Object.keys(sessAdsVsl),
    ...Object.keys(sessAdsOptIn),
    ...Object.keys(sessOrgVsl),
    ...Object.keys(sessOrgOptIn),
  ])].sort();
  const chartConversionAds = allDates.map((date) => {
    const optIn = sessAdsOptIn[date] ?? 0;
    const vsl = sessAdsVsl[date] ?? 0;
    const rate = optIn > 0 ? Math.round((vsl / optIn) * 10000) / 100 : null;
    return { date, optIn, vsl, conversionRate: rate, label: date ? date.slice(5) : date };
  });
  const chartConversionOrganic = allDates.map((date) => {
    const optIn = sessOrgOptIn[date] ?? 0;
    const vsl = sessOrgVsl[date] ?? 0;
    const rate = optIn > 0 ? Math.round((vsl / optIn) * 10000) / 100 : null;
    return { date, optIn, vsl, conversionRate: rate, label: date ? date.slice(5) : date };
  });

  const chartWholeSite = (dataWholeSite.rows || []).map((r) => ({
    date: r.date,
    eventCount: r.eventCount ?? 0,
    label: r.date ? r.date.slice(5) : r.date,
  }));
  const hasData = chartAds.length > 0 || chartOrganic.length > 0;
  const fmt2 = (n) => (n != null && !Number.isNaN(n) ? Number(n).toFixed(2) : '—');

  useEffect(() => {
    fetchViews();
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        Google Analytics
      </h1>
      <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>
        Ads VSL ({ADS_PATH}) · Organic VSL ({ORGANIC_VSL_PATH}) · Opt-in Ads ({ADS_OPT_IN_PATH}) · Opt-in Organic (/pro, /)
      </p>
      <p style={{ color: '#9ca3af', marginBottom: 16, fontSize: 12 }}>
        Dates and daily totals use your GA4 property timezone (Admin → Property Settings → Time zone).
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>End</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>
        <button
          type="button"
          onClick={fetchViews}
          disabled={loading}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: 'white',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {(dataAds.mock && dataAds.rows.length > 0) || (dataOrganic.mock && dataOrganic.rows.length > 0) || (dataAdsOptIn.mock && dataAdsOptIn.rows.length > 0) || (dataOrganicOptIn.mock && dataOrganicOptIn.rows.length > 0) ? (
        <div style={{ padding: 8, marginBottom: 12, backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, fontSize: 12, color: '#854d0e' }}>
          Using mock data. Set GA4_PROPERTY_ID and service account for real data.
        </div>
      ) : null}

        <div
          style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Ads views</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{ADS_PATH}</p>
          {chartAds.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartAds} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#2563eb' }}>Views: {p?.views ?? 0}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="views" name="Views" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Organic views</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{ORGANIC_VSL_PATH}</p>
          {chartOrganic.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartOrganic} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#059669' }}>Views: {p?.views ?? 0}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="views" name="Views" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Ads booking rate %</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{ADS_PATH}</p>
          {chartAds.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : chartAds.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartAds} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals tick={{ fontSize: 10 }} width={36} tickFormatter={(v) => `${fmt2(v)}%`} domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div>Views: {p?.views ?? 0} · call_booked: {p?.eventCount ?? 0} · {p?.bookingRate != null ? `${fmt2(p.bookingRate)}%` : '—'}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="bookingRate" name="Booking rate %" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Organic booking rate %</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{ORGANIC_VSL_PATH}</p>
          {chartOrganic.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : chartOrganic.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartOrganic} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals tick={{ fontSize: 10 }} width={36} tickFormatter={(v) => `${fmt2(v)}%`} domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div>Views: {p?.views ?? 0} · call_booked: {p?.eventCount ?? 0} · {p?.bookingRate != null ? `${fmt2(p.bookingRate)}%` : '—'}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="bookingRate" name="Booking rate %" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Opt-in page views – Ads</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{ADS_OPT_IN_PATH}</p>
          {chartAdsOptIn.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartAdsOptIn} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#dc2626' }}>Views: {p?.views ?? 0}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="views" name="Views" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Opt-in page views – Organic</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>/pro, / (root)</p>
          {chartOrganicOptIn.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartOrganicOptIn} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    const total = p?.views ?? 0;
                    const byPath = p?.byPath;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#16a34a' }}>Views: {total}</div>
                        {byPath && Object.keys(byPath).length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                            {Object.entries(byPath)
                              .sort(([, a], [, b]) => b - a)
                              .map(([path, count]) => (
                                <div key={path}>
                                  {path === '/' ? '/(root)' : path}: {count}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="views" name="Views" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Opt-in conversion rate – Ads</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>VSL sessions / opt-in sessions ({ADS_PATH} / {ADS_OPT_IN_PATH})</p>
          {chartConversionAds.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartConversionAds} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals tick={{ fontSize: 10 }} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    const optIn = p?.optIn ?? 0;
                    const vsl = p?.vsl ?? 0;
                    const rate = p?.conversionRate;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#dc2626' }}>{vsl} / {optIn} = {rate != null ? `${fmt2(rate)}%` : '—'}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="conversionRate" name="Conversion %" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Opt-in conversion rate – Organic</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>VSL ({ORGANIC_VSL_PATH}) / opt-in (/pro, /)</p>
          {chartConversionOrganic.length === 0 && !loading ? (
            <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartConversionOrganic} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
                <YAxis allowDecimals tick={{ fontSize: 10 }} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    const p = payload[0]?.payload;
                    const optIn = p?.optIn ?? 0;
                    const vsl = p?.vsl ?? 0;
                    const rate = p?.conversionRate;
                    return (
                      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                        <div style={{ color: '#16a34a' }}>{vsl} / {optIn} = {rate != null ? `${fmt2(rate)}%` : '—'}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="conversionRate" name="Conversion %" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          backgroundColor: 'white',
          padding: 12,
          borderRadius: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Call booked (whole site)</h2>
        {chartWholeSite.length === 0 && !loading ? (
          <p style={{ color: '#9ca3af', fontSize: 12 }}>Loading…</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartWholeSite} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : '')} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || !label) return null;
                  const p = payload[0]?.payload;
                  return (
                    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontWeight: 600 }}>{formatDateLabel(label)}</div>
                      <div style={{ color: '#7c3aed' }}>call_booked: {p?.eventCount ?? 0}</div>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="eventCount" name="call_booked" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
