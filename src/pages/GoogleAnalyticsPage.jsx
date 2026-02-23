import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const defaultStart = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
})();
const defaultEnd = new Date().toISOString().slice(0, 10);

export default function GoogleAnalyticsPage() {
  const [pagePath, setPagePath] = useState('/');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ rows: [], pagePath: '', mock: false });

  const fetchViews = async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pagePath: pagePath || '/',
        startDate,
        endDate,
      });
      const res = await fetch(`/api/google-analytics?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const parts = [json.error || json.details || res.statusText];
        if (json.code) parts.push(`(code: ${json.code})`);
        if (json.detailsPayload) parts.push(typeof json.detailsPayload === 'object' ? JSON.stringify(json.detailsPayload) : json.detailsPayload);
        if (json.hint) parts.push(`— ${json.hint}`);
        setError(parts.join(' '));
        if (json.mock?.rows) setData({ rows: json.mock.rows, pagePath: pagePath || '/', mock: true });
        return;
      }
      setData({
        rows: json.rows || [],
        pagePath: json.pagePath || pagePath,
        mock: !!json.mock,
      });
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const chartData = data.rows.map((r) => ({
    date: r.date,
    views: r.views,
    label: r.date ? r.date.slice(5) : r.date,
  }));

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        Google Analytics
      </h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Views per day for a given page path (GA4). Configure GA4_PROPERTY_ID and service account to use real data.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-end',
          marginBottom: 24,
          padding: 20,
          backgroundColor: '#f9fafb',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Page path</span>
          <input
            type="text"
            value={pagePath}
            onChange={(e) => setPagePath(e.target.value)}
            placeholder="/pricing or /lead/123"
            style={{
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              minWidth: 200,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>
        <button
          type="button"
          onClick={fetchViews}
          disabled={loading}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: 'white',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Fetch views'}
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

      {data.mock && data.rows.length > 0 && (
        <div
          style={{
            padding: 10,
            marginBottom: 16,
            backgroundColor: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: 8,
            fontSize: 13,
            color: '#854d0e',
          }}
        >
          Using mock data (GA4 not configured or API error). Set GA4_PROPERTY_ID and service account for real data.
        </div>
      )}

      <div
        style={{
          backgroundColor: 'white',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
          Views per day {data.pagePath ? `(path contains "${data.pagePath}")` : ''}
        </h2>
        {chartData.length === 0 && !loading ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Enter a page path and click “Fetch views”.</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v ? v.slice(5) : '')}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || !label) return null;
                  return (
                    <div
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 13,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#111827' }}>{label}</div>
                      <div style={{ color: '#2563eb' }}>Views: {payload[0]?.value ?? 0}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="views" name="Views" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
