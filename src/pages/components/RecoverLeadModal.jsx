import React, { useState } from 'react';

export default function RecoverLeadModal({ isOpen, onClose, lead, closerList = [], onSuccess, mode = 'full' }) {
  const [closerEmail, setCloserEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isCloserMode = mode === 'closer';
  const effectiveCloserEmail = isCloserMode
    ? (closerList?.find((c) => c.id === lead?.closer_id)?.workspace_email || closerList?.find((c) => c.id === lead?.closer_id)?.email)
    : closerEmail;

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const emailToUse = isCloserMode ? effectiveCloserEmail : closerEmail;
    if (!emailToUse || !date || !time) {
      setError(isCloserMode ? 'No closer assigned to this call. Please pick a date and time.' : 'Please select a closer, date, and time');
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
      const emailToSend = isCloserMode
        ? (effectiveCloserEmail || '').trim()
        : (emailToUse.includes('@') ? String(emailToUse).trim() : (closerList?.find((c) => c.id === emailToUse)?.workspace_email || closerList?.find((c) => c.id === emailToUse)?.email) ?? emailToUse);

      // Derive closer_id for CRM call creation
      const closerId = isCloserMode
        ? lead?.closer_id
        : closerList?.find((c) => (c.workspace_email || c.email) === emailToUse)?.id ?? closerList?.find((c) => c.id === emailToUse)?.id;

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
          {!isCloserMode && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                Closer (email)
              </label>
              <select
                value={closerEmail}
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
                <option value="">Select closer</option>
                {(closerList || []).filter((c) => c.workspace_email || c.email).map((c) => {
                  const calendarEmail = c.workspace_email || c.email;
                  return (
                    <option key={c.id} value={calendarEmail}>
                      {c.name} ({calendarEmail})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          {isCloserMode && effectiveCloserEmail && (
            <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
              Event will be created in <strong>{effectiveCloserEmail}</strong>&apos;s calendar (this call&apos;s closer).
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
