import { useState, useCallback } from 'react';

function utcDefaults() {
  const d = new Date();
  return {
    utcDate: d.toISOString().slice(0, 10),
    utcTime: d.toISOString().slice(11, 16),
  };
}

const card = {
  backgroundColor: 'white',
  borderRadius: '8px',
  padding: '24px',
  marginBottom: '24px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

const labelStyle = {
  display: 'block',
  fontSize: '14px',
  fontWeight: '500',
  color: '#374151',
  marginBottom: '8px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'ui-monospace, monospace',
};

export default function CurrentSetterApiTestPage() {
  const [{ utcDate, utcTime }, setUtc] = useState(utcDefaults);
  const [atIso, setAtIso] = useState('');
  const [liveResult, setLiveResult] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [liveUrl, setLiveUrl] = useState('');
  const [simUrl, setSimUrl] = useState('');
  const [loadingLive, setLoadingLive] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);
  const [errLive, setErrLive] = useState(null);
  const [errSim, setErrSim] = useState(null);

  const runFetch = useCallback(async (url, { setResult, setErr, setUrl, setLoading }) => {
    setLoading(true);
    setErr(null);
    setUrl(url);
    try {
      const r = await fetch(url);
      const body = await r.json().catch(() => ({}));
      setResult({ status: r.status, body });
      if (!r.ok) setErr(body?.error || `${r.status} ${r.statusText}`);
    } catch (e) {
      setErr(e.message || String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLive = () =>
    runFetch('/api/current-setter', {
      setResult: setLiveResult,
      setErr: setErrLive,
      setUrl: setLiveUrl,
      setLoading: setLoadingLive,
    });

  const fetchSimulated = () => {
    const params = new URLSearchParams();
    if (atIso.trim()) {
      params.set('at', atIso.trim());
    } else {
      params.set('utc_date', utcDate);
      params.set('utc_time', utcTime);
    }
    const url = `/api/current-setter?${params.toString()}`;
    runFetch(url, {
      setResult: setSimResult,
      setErr: setErrSim,
      setUrl: setSimUrl,
      setLoading: setLoadingSim,
    });
  };

  const applyPresetTime = (hhmm) => {
    setUtc((prev) => ({ ...prev, utcTime: hhmm }));
    setAtIso('');
  };

  const fillIsoFromUtcFields = () => {
    const t = utcTime.length === 5 ? `${utcTime}:00` : utcTime;
    setAtIso(`${utcDate}T${t}Z`);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
          Current setter API (test)
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '28px', fontSize: '15px', lineHeight: 1.5 }}>
          Calls <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>GET /api/current-setter</code>{' '}
          using the same UTC logic as production. Use simulated query params to see who would be on shift at other instants.
        </p>

        <div style={card}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
            Live (server clock)
          </h2>
          <button
            type="button"
            onClick={fetchLive}
            disabled={loadingLive}
            style={{
              padding: '10px 18px',
              backgroundColor: loadingLive ? '#9ca3af' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loadingLive ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingLive ? 'Loading…' : 'GET /api/current-setter'}
          </button>
          {liveUrl && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280', wordBreak: 'break-all' }}>
              <strong style={{ color: '#374151' }}>URL:</strong> {liveUrl}
            </div>
          )}
          {errLive && (
            <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '14px' }}>{errLive}</div>
          )}
          {liveResult && (
            <pre
              style={{
                marginTop: '16px',
                padding: '14px',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: '6px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '360px',
              }}
            >
              {JSON.stringify(liveResult, null, 2)}
            </pre>
          )}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
            Simulated UTC instant
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Either set <strong>UTC date + time</strong> (sent as <code>utc_date</code> & <code>utc_time</code>) or fill{' '}
            <strong>ISO `at`</strong> (takes precedence if non-empty).
          </p>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={labelStyle}>UTC date</label>
              <input
                type="date"
                value={utcDate}
                onChange={(e) => {
                  setUtc((p) => ({ ...p, utcDate: e.target.value }));
                  setAtIso('');
                }}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={labelStyle}>UTC time</label>
              <input
                type="time"
                value={utcTime}
                step={60}
                onChange={(e) => {
                  setUtc((p) => ({ ...p, utcTime: e.target.value }));
                  setAtIso('');
                }}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ ...labelStyle, marginBottom: '6px' }}>Quick UTC times (same date)</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['00:00', '08:00', '12:00', '16:00', '20:00', '23:30'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyPresetTime(t)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Optional: ISO `at` (overrides date/time above)</label>
            <input
              type="text"
              value={atIso}
              onChange={(e) => setAtIso(e.target.value)}
              placeholder="2026-04-13T14:30:00.000Z"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={fillIsoFromUtcFields}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: '#f9fafb',
                cursor: 'pointer',
              }}
            >
              Copy from UTC fields → `at`
            </button>
          </div>

          <button
            type="button"
            onClick={fetchSimulated}
            disabled={loadingSim}
            style={{
              padding: '10px 18px',
              backgroundColor: loadingSim ? '#9ca3af' : '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loadingSim ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingSim ? 'Loading…' : 'GET with simulation'}
          </button>

          {simUrl && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280', wordBreak: 'break-all' }}>
              <strong style={{ color: '#374151' }}>URL:</strong> {simUrl}
            </div>
          )}
          {errSim && (
            <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '14px' }}>{errSim}</div>
          )}
          {simResult && (
            <pre
              style={{
                marginTop: '16px',
                padding: '14px',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: '6px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '360px',
              }}
            >
              {JSON.stringify(simResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
