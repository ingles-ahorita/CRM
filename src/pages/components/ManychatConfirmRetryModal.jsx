import { useState, useEffect } from 'react';
import { Modal } from './Modal';

// Codes for which letting the user correct the phone number is meaningful.
const PHONE_EDITABLE_CODES = new Set(['PHONE_NOT_FOUND', 'NO_PHONE', 'UNKNOWN']);

const spinnerStyle = {
  width: 16,
  height: 16,
  border: '2px solid rgba(255,255,255,0.5)',
  borderTop: '2px solid #fff',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  display: 'inline-block',
};

/**
 * Modal shown when confirming a lead (Confirmed → YES) fails.
 *
 * Props:
 *  - state: { open, lead, reason, code, stage, phone, cachedSubscriberId, busy }
 *  - onRetry(phoneOverride)  → re-run the confirm sequence
 *  - onConfirmDbOnly()       → confirm in DB only (skip ManyChat) — only offered on ManyChat-stage failures
 *  - onClose()               → leave the lead unconfirmed
 */
export default function ManychatConfirmRetryModal({ state, onRetry, onConfirmDbOnly, onClose }) {
  const { open, lead, reason, code, stage, phone, busy } = state || {};
  const [phoneInput, setPhoneInput] = useState(phone || '');

  // Keep the editable field in sync when a new failure opens the modal.
  useEffect(() => {
    if (open) setPhoneInput(phone || '');
  }, [open, phone]);

  if (!open) return null;

  const showPhoneEdit = stage === 'manychat' && PHONE_EDITABLE_CODES.has(code);
  const allowDbOnly = stage === 'manychat'; // DB itself works in this case

  return (
    <Modal isOpen={open} onClose={busy ? () => {} : onClose}>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '24px', maxWidth: 460 }}>
        <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Couldn’t confirm this lead
        </h2>

        <p style={{ marginBottom: 16, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
          {reason || 'Something went wrong while confirming.'}
        </p>

        {showPhoneEdit && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              WhatsApp number {lead?.name ? `for ${lead.name}` : ''}
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              disabled={busy}
              placeholder="+15551234567"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 14,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              Use international format, e.g. +1 then the number, no spaces.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '9px 16px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>

          {allowDbOnly && (
            <button
              onClick={() => onConfirmDbOnly?.()}
              disabled={busy}
              style={{
                padding: '9px 16px',
                backgroundColor: '#fff',
                color: '#b45309',
                border: '1px solid #f59e0b',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
              title="Mark Confirmed in the CRM without syncing ManyChat"
            >
              Confirm anyway (no ManyChat)
            </button>
          )}

          <button
            onClick={() => onRetry?.(showPhoneEdit ? phoneInput?.trim() : undefined)}
            disabled={busy}
            style={{
              padding: '9px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {busy && <span style={spinnerStyle} />}
            {busy ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    </Modal>
  );
}