import React, { useState, useEffect } from 'react';

const NO_SHOW_OPTIONS = [
  { value: 'no_show', label: 'No show' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'dead', label: 'Dead' },
];

export default function NoShowStateModal({ isOpen, onClose, onConfirm, leadName, currentNoShowState }) {
  const [selected, setSelected] = useState('no_show');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = currentNoShowState && NO_SHOW_OPTIONS.some(o => o.value === currentNoShowState)
        ? currentNoShowState
        : 'no_show';
      setSelected(current);
    }
  }, [isOpen, currentNoShowState]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      const success = await onConfirm(selected);
      if (success) {
        onClose();
        setSelected('no_show');
      }
    } catch (e) {
      console.error('[NoShowStateModal] Confirm error:', e);
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    onClose();
    setSelected('no_show');
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
      onClick={handleClose}
    >
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
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
          No show state
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#6b7280' }}>
          {leadName ? `Set no show state for ${leadName}` : 'Select the no show state for this lead:'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {NO_SHOW_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                border: `2px solid ${selected === opt.value ? '#4f46e5' : '#e5e7eb'}`,
                backgroundColor: selected === opt.value ? '#eef2ff' : '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: selected === opt.value ? '600' : '400',
              }}
            >
              <input
                type="radio"
                name="no_show_state"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                style={{ accentColor: '#4f46e5' }}
              />
              {opt.label}
            </label>
          ))}
          <div style={{
            borderTop: '1px dashed #e5e7eb',
            marginTop: '12px',
            paddingTop: '10px',
          }} />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#fafafa',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '400',
              color: '#9ca3af',
              fontStyle: 'italic',
            }}
          >
            <input
              type="radio"
              name="no_show_state"
              value="showed_up_yes"
              checked={selected === 'showed_up_yes'}
              onChange={() => setSelected('showed_up_yes')}
              style={{ accentColor: '#9ca3af' }}
            />
            <span style={{
              color: '#9ca3af',
              textDecoration: selected === 'showed_up_yes' ? 'underline' : 'none',
            }}>
              Showed up (revert to Yes)
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleClose}
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
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#fff',
              backgroundColor: confirming ? '#a5b4fc' : '#4f46e5',
              border: 'none',
              borderRadius: '8px',
              cursor: confirming ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {confirming && (
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            )}
            {confirming ? 'Updating...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
