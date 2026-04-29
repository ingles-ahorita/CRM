import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function RecoverLeadModal({ isOpen, onClose, lead, closerList = [], onSuccess, mode = 'full' }) {
  const [closerEmail, setCloserEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [availableClosers, setAvailableClosers] = useState(() => closerList || []);
  const [closersLoading, setClosersLoading] = useState(false);

  const isCloserMode = mode === 'closer';
  const assignedCloserEmail = useMemo(() => {
    if (!isCloserMode) return '';
    const assigned = availableClosers?.find((c) => String(c?.id) === String(lead?.closer_id));
    return assigned?.workspace_email || assigned?.email || '';
  }, [isCloserMode, availableClosers, lead?.closer_id]);

  const needsCloserPick = isCloserMode && !assignedCloserEmail;
  const selectedCloserId = String(closerEmail || '').trim();
  const selectedCloser = useMemo(() => {
    if (!selectedCloserId) return null;
    return (availableClosers || []).find((c) => String(c?.id) === selectedCloserId) || null;
  }, [selectedCloserId, availableClosers]);

  const effectiveCloserEmail = isCloserMode
    ? (assignedCloserEmail || selectedCloser?.workspace_email || selectedCloser?.email || '')
    : (selectedCloser?.workspace_email || selectedCloser?.email || '');

  const isValidEmail = (e) => typeof e === 'string' && e.includes('@');

  // Keep local closers in sync with prop; also fetch if empty.
  useEffect(() => {
    setAvailableClosers(Array.isArray(closerList) ? closerList : []);
  }, [closerList]);

  useEffect(() => {
    if (!isOpen) return;
    if ((availableClosers?.length || 0) > 0) return;
    let cancelled = false;
    async function loadClosers() {
      setClosersLoading(true);
      try {
        const { data, error: e } = await supabase
          .from('closers')
          .select('id, name, email')
          .order('name', { ascending: true });
        if (cancelled) return;
        if (e) throw e;
        setAvailableClosers(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
        console.warn('[RecoverLeadModal] failed to load closers:', e?.message || e);
        setAvailableClosers([]);
      } finally {
        if (!cancelled) setClosersLoading(false);
      }
    }
    loadClosers();
    return () => {
      cancelled = true;
    };
  }, [isOpen, availableClosers?.length]);

  // Clear error as soon as user updates any field.
  useEffect(() => {
    if (!error) return;
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closerEmail, date, time]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!effectiveCloserEmail || !date || !time) {
      setError('Please select a closer, date, and time');
      return;
    }
    if (!isValidEmail(effectiveCloserEmail)) {
      setError('Selected closer is missing a calendar email. Please update closer email in DB.');
      return;
    }
    setLoading(true);
    try {
      const [year, month, day] = date.split('-').map(Number);
      const [hour, min] = time.split(':').map(Number);
      const start = new Date(year, month - 1, day, hour, min, 0);
      const startDateTime = start.toISOString();
      const leadName = lead?.leads?.name ?? lead?.name ?? '';
      const leadId = lead?.lead_id ?? lead?.id;
      const leadEmailValue = lead?.email ?? lead?.leads?.email ?? '';

      // Ensure we send the actual email string
      const emailToSend = String(effectiveCloserEmail).trim();

      // Derive closer_id for CRM call creation:
      // - If call already has a closer_id, use it
      // - Otherwise (or if user picked a closer), use the selected closer's id
      const closerId =
        selectedCloser?.id ??
        lead?.closer_id ??
        undefined;

      const res = await fetch('/api/create-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closerEmail: emailToSend,
          startDateTime,
          leadName,
          leadId,
          leadEmail: leadEmailValue || undefined,
          closerId: closerId || undefined,
          setterId: lead?.setter_id ?? undefined,
          leadPhone: lead?.phone ?? lead?.leads?.phone ?? undefined,
          sourceType: lead?.source_type ?? lead?.leads?.source ?? undefined,
          mcApiKey: lead?.closers?.mc_api_key ?? undefined,
          closer_mc_id: lead?.closer_mc_id ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to create event');
      if (data.callId) {
        const baseMsg = 'Calendar event and new call created successfully';
        onSuccess?.(data.manychatWarning ? `${baseMsg}. ManyChat: ${data.manychatWarning}` : baseMsg);
      } else if (data.crmWarning) {
        onSuccess?.('Calendar event created, but CRM call failed: ' + data.crmWarning);
      } else if (data.manychatWarning) {
        onSuccess?.('Calendar event created. ManyChat: ' + data.manychatWarning);
      } else {
        onSuccess?.('Calendar event created successfully');
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '24px',
          minWidth: '320px',
          maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
          Recover lead
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#6b7280' }}>
          Create a 1-hour event in the closer&apos;s Google Calendar.
        </p>
        <form onSubmit={handleSubmit}>
          {(!isCloserMode || needsCloserPick) && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                Closer (email)
              </label>
              <select
                value={selectedCloserId}
                onChange={(e) => setCloserEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                }}
              >
                <option value="">
                  {closersLoading ? 'Loading closers…' : 'Select closer'}
                </option>
                {(availableClosers || []).map((c) => {
                  const calendarEmail = c.workspace_email || c.email;
                  const label = calendarEmail
                    ? `${c.name} (${calendarEmail})`
                    : `${c.name} (missing calendar email)`;
                  return (
                    <option key={c.id} value={String(c.id)} disabled={!calendarEmail}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          {isCloserMode && assignedCloserEmail && (
            <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
              Event will be created in <strong>{assignedCloserEmail}</strong>&apos;s calendar (this call&apos;s closer).
            </p>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
              }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
              }}
            />
          </div>
          {error && (
            <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', borderRadius: '6px' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#6b7280',
                backgroundColor: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#fff',
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating…' : 'Create event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
