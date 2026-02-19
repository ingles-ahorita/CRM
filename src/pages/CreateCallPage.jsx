import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { User, Calendar } from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 350;

/** IANA timezone list (use Intl.supportedValuesOf when available, else fallback) */
function getIanaTimezones() {
  try {
    if (typeof Intl !== 'undefined' && Intl.supportedValuesOf && Intl.supportedValuesOf('timeZone')) {
      return Intl.supportedValuesOf('timeZone').slice().sort();
    }
  } catch (_) {}
  return [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'America/Anchorage', 'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Berlin',
    'Europe/Rome', 'Europe/Amsterdam', 'Europe/Moscow',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Dubai',
    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
    'UTC'
  ].sort();
}

const IANA_TIMEZONES = getIanaTimezones();

/** Escape ilike special chars so search term is literal (%, _) */
function escapeIlike(q) {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function logError(source, err, details = {}) {
  const message = err?.message || String(err);
  console.error(`[CreateCallPage] ${source}:`, message, details);
  supabase
    .from('function_errors')
    .insert({
      function_name: 'CreateCallPage',
      error_message: message,
      error_details: JSON.stringify({ source, ...details, stack: err?.stack }),
      source: `CreateCallPage.jsx/${source}`
    })
    .then(({ error: logErr }) => {
      if (logErr) console.error('Failed to log to function_errors:', logErr);
    });
}

export default function CreateCallPage() {
  const navigate = useNavigate();
  const [setters, setSetters] = useState([]);
  const [closers, setClosers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Lead: existing (search) or new
  const [leadMode, setLeadMode] = useState('existing'); // 'existing' | 'new'
  const [leadSearch, setLeadSearch] = useState('');
  const [leadSearchResults, setLeadSearchResults] = useState([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null); // { lead_id, name, email, phone }
  const searchTimeoutRef = useRef(null);

  // New lead fields
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');

  // Call form
  const [formData, setFormData] = useState({
    setter_id: '',
    closer_id: '',
    book_date: '',
    call_date: '',
    timezone: ''
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [settersRes, closersRes] = await Promise.all([
          supabase.from('setters').select('id, name').eq('active', true).order('name', { ascending: true }),
          supabase.from('closers').select('id, name').eq('active', true).order('name', { ascending: true })
        ]);
        if (settersRes.error) throw settersRes.error;
        if (closersRes.error) throw closersRes.error;
        setSetters(settersRes.data || []);
        setClosers(closersRes.data || []);
      } catch (e) {
        setError(e.message || 'Failed to load setters/closers');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Search existing leads (leads table by name/email)
  useEffect(() => {
    if (leadMode !== 'existing') return;
    const q = leadSearch.trim();
    if (q.length < 2) {
      setLeadSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setLeadSearchLoading(true);
      const escaped = escapeIlike(q);
      const pattern = `%${escaped}%`;
      const quoted = pattern.includes(',') ? `"${pattern.replace(/"/g, '""')}"` : pattern;
      supabase
        .from('leads')
        .select('id, name, email, phone')
        .or(`name.ilike.${quoted},email.ilike.${quoted}`)
        .limit(30)
        .then(({ data, error: e }) => {
          if (e) {
            logError('lead-search', e, { query: q });
            setLeadSearchResults([]);
            setLeadSearchLoading(false);
            return;
          }
          const results = (data || []).map((row) => ({
            lead_id: row.id,
            name: row.name ?? '—',
            email: row.email ?? '—',
            phone: row.phone ?? null
          }));
          setLeadSearchResults(results);
        })
        .finally(() => setLeadSearchLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [leadMode, leadSearch]);

  const onSelectLead = (lead) => {
    setSelectedLead(lead);
    setLeadSearch(lead.name || lead.email || '');
    setLeadSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let leadId = null;
    let name = '';
    let email = '';
    let phone = '';
    let createdLeadId = null; // track so we can rollback if call fails

    if (leadMode === 'existing') {
      if (!selectedLead?.lead_id) {
        setError('Please search and select an existing lead.');
        return;
      }
      leadId = selectedLead.lead_id;
      name = selectedLead.name ?? '';
      email = selectedLead.email ?? '';
      phone = selectedLead.phone ?? '';
    } else {
      const nName = newLeadName.trim();
      const nEmail = newLeadEmail.trim();
      const nPhone = newLeadPhone.trim();
      if (!nName || !nEmail) {
        setError('Name and email are required for a new lead.');
        return;
      }
      setSubmitting(true);
      try {
        const { data: newLead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            name: nName,
            email: nEmail.toLowerCase(),
            phone: nPhone || null,
            source: 'referral'
          })
          .select('id')
          .single();
        if (leadErr) throw leadErr;
        leadId = newLead.id;
        createdLeadId = newLead.id;
        name = nName;
        email = nEmail;
        phone = nPhone;
      } catch (err) {
        logError('create-lead', err, { name: nName, email: nEmail });
        setError(err.message || 'Failed to create lead.');
        setSubmitting(false);
        return;
      }
    }

    if (!formData.closer_id) {
      setError('Please select a closer.');
      if (createdLeadId) {
        await supabase.from('leads').delete().eq('id', createdLeadId);
        createdLeadId = null;
      }
      setSubmitting(false);
      return;
    }

    const bookDate = formData.book_date ? new Date(formData.book_date).toISOString() : null;
    const callDate = formData.call_date ? new Date(formData.call_date).toISOString() : null;
    if (!bookDate && !callDate) {
      setError('Please set at least Book date or Call date.');
      if (createdLeadId) {
        await supabase.from('leads').delete().eq('id', createdLeadId);
        createdLeadId = null;
      }
      setSubmitting(false);
      return;
    }

    const callPayload = {
      source_type: leadMode === 'existing' ? 'referral' : 'manual',
      lead_id: leadId,
      name: name || null,
      email: email || null,
      phone: phone || null,
      book_date: bookDate,
      call_date: callDate,
      timezone: formData.timezone.trim() || null,
      setter_id: formData.setter_id || null,
      closer_id: formData.closer_id || null
    };

    setSubmitting(true);
    try {
      const { data: call, error: callErr } = await supabase
        .from('calls')
        .insert(callPayload)
        .select('id, lead_id')
        .single();

      if (callErr) throw callErr;
      setSuccess(`Call created successfully. Call ID: ${call.id}`);
      setSelectedLead(null);
      setLeadSearch('');
      setNewLeadName('');
      setNewLeadEmail('');
      setNewLeadPhone('');
      setFormData({ setter_id: '', closer_id: '', book_date: '', call_date: '', timezone: '' });
      setTimeout(() => {
        if (call?.lead_id) navigate(`/lead/${call.lead_id}`);
      }, 1500);
    } catch (err) {
      logError('create-call', err, { leadId, callPayload });
      setError(err.message || 'Failed to create call.');
      if (createdLeadId) {
        const { error: delErr } = await supabase.from('leads').delete().eq('id', createdLeadId);
        if (delErr) logError('rollback-lead-delete', delErr, { createdLeadId });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formStyle = {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    backgroundColor: 'white',
    color: '#111827'
  };
  const labelStyle = { fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px', display: 'block' };
  const sectionStyle = { marginBottom: '20px' };

  if (loading) {
    return (
      <div style={{ padding: 24, minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
          Create a call
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>
          Add a new call to the database. Link to an existing lead or create a new one.
        </p>

        <form onSubmit={handleSubmit} style={{ background: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {error && (
            <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '14px' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#f0fdf4', color: '#15803d', borderRadius: '6px', fontSize: '14px' }}>
              {success}
            </div>
          )}

          {/* Lead */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Lead</label>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => { setLeadMode('existing'); setSelectedLead(null); setLeadSearch(''); }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: leadMode === 'existing' ? '#eff6ff' : 'white',
                  color: leadMode === 'existing' ? '#2563eb' : '#374151',
                  fontWeight: leadMode === 'existing' ? '600' : '500',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Existing lead
              </button>
              <button
                type="button"
                onClick={() => { setLeadMode('new'); setSelectedLead(null); setLeadSearch(''); }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: leadMode === 'new' ? '#eff6ff' : 'white',
                  color: leadMode === 'new' ? '#2563eb' : '#374151',
                  fontWeight: leadMode === 'new' ? '600' : '500',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                New lead
              </button>
            </div>

            {leadMode === 'existing' && (
              <>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  style={formStyle}
                  autoComplete="off"
                />
                {leadSearchLoading && <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Searching...</p>}
                {leadSearchResults.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', border: '1px solid #e5e7eb', borderRadius: '6px', maxHeight: 200, overflowY: 'auto' }}>
                    {leadSearchResults.map((lead) => (
                      <li
                        key={lead.lead_id}
                        onClick={() => onSelectLead(lead)}
                        style={{
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f3f4f6',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                      >
                        <User size={16} color="#6b7280" style={{ flexShrink: 0 }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: '500' }}>{lead.name}</span>
                          <span style={{ color: '#9ca3af', fontSize: '13px', marginLeft: '6px' }}>{lead.email}</span>
                          {lead.phone && (
                            <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>{lead.phone}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedLead && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: '#059669' }}>
                    Selected: {selectedLead.name} ({selectedLead.email})
                    {selectedLead.phone && ` · ${selectedLead.phone}`}
                  </p>
                )}
              </>
            )}

            {leadMode === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Name *"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  style={formStyle}
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  style={formStyle}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  style={formStyle}
                />
              </div>
            )}
          </div>

          {/* Setter */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Setter</label>
            <select
              value={formData.setter_id}
              onChange={(e) => setFormData((f) => ({ ...f, setter_id: e.target.value }))}
              style={formStyle}
            >
              <option value="">— None —</option>
              {setters.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Closer */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Closer *</label>
            <select
              value={formData.closer_id}
              onChange={(e) => setFormData((f) => ({ ...f, closer_id: e.target.value }))}
              style={formStyle}
              required
            >
              <option value="">— Select closer —</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Book date */}
          <div style={sectionStyle}>
            <label style={labelStyle}>
              <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Book date
            </label>
            <input
              type="datetime-local"
              value={formData.book_date}
              onChange={(e) => setFormData((f) => ({ ...f, book_date: e.target.value }))}
              style={formStyle}
            />
          </div>

          {/* Call date */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Call date</label>
            <input
              type="datetime-local"
              value={formData.call_date}
              onChange={(e) => setFormData((f) => ({ ...f, call_date: e.target.value }))}
              style={formStyle}
            />
          </div>

          {/* Timezone */}
          <div style={sectionStyle}>
            <label style={labelStyle}>Timezone (optional)</label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData((f) => ({ ...f, timezone: e.target.value }))}
              style={formStyle}
            >
              <option value="">— None —</option>
              {IANA_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: submitting ? '#9ca3af' : '#2563eb',
                color: 'white',
                fontWeight: '600',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              {submitting ? 'Creating...' : 'Create call'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/management')}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
