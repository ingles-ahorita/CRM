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
const ORGANIC_PATH = '/masterclass-job';

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
  const [dataOrganic, setDataOrganic] = useState({ rows: [], pagePath: ORGANIC_PATH, mock: false });
  const [dataWholeSite, setDataWholeSite] = useState({ rows: [], mock: false });

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
      const params = (path) =>
        new URLSearchParams({ pagePath: path, startDate, endDate }).toString();
      const urlAds = `/api/google-analytics?${params(ADS_PATH)}`;
      const urlOrganic = `/api/google-analytics?${params(ORGANIC_PATH)}`;
      const urlWholeSite = `/api/google-analytics?${new URLSearchParams({ wholeSite: '1', startDate, endDate }).toString()}`;
      console.log('[GA] Fetching ads, organic & whole site');

      const [resAds, resOrganic, resWholeSite] = await Promise.all([
        fetch(urlAds),
        fetch(urlOrganic),
        fetch(urlWholeSite),
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

      const [jsonAds, jsonOrganic, jsonWholeSite] = await Promise.all([
        parse(resAds, 'ads'),
        parse(resOrganic, 'organic'),
        parse(resWholeSite, 'whole site'),
      ]);

      console.log('[GA] Success:', {
        ads: jsonAds.rows?.length ?? 0,
        organic: jsonOrganic.rows?.length ?? 0,
        wholeSite: jsonWholeSite.rows?.length ?? 0,
      });

      setDataAds({
        rows: jsonAds.rows || [],
        pagePath: jsonAds.pagePath || ADS_PATH,
        mock: !!jsonAds.mock,
      });
      setDataOrganic({
        rows: jsonOrganic.rows || [],
        pagePath: jsonOrganic.pagePath || ORGANIC_PATH,
        mock: !!jsonOrganic.mock,
      });
      setDataWholeSite({
        rows: jsonWholeSite.rows || [],
        mock: !!jsonWholeSite.mock,
      });
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
    }));

  const chartAds = toChartData(dataAds.rows);
  const chartOrganic = toChartData(dataOrganic.rows);
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
        Ads ({ADS_PATH}) · Organic ({ORGANIC_PATH})
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

      {(dataAds.mock && dataAds.rows.length > 0) || (dataOrganic.mock && dataOrganic.rows.length > 0) ? (
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
