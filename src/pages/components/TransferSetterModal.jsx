import { useState } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabaseClient';
import * as ManychatService from '../../utils/manychatService';

const SetterDropdown = ({ value, onChange, label, options }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <label style={{ fontSize: '10px', color: '#6b7280', fontWeight: '500' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
            width: '50%',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          border: '1.5px solid rgb(133, 133, 133)',      // subtle purple border
          backgroundColor: '#fafaff',          // soft modern background
          cursor: 'pointer',
          color: '#343353',
          outline: 'none',
          boxShadow: '0 2px 8px rgba(168,139,250,0.08)', // gentle shadow
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        <option value="">Select setter</option>
        {options.map(({ id, name }) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
    </div>
  );
};

const transferLead = async (callId, newSetterId, currentSetterId, transferNote, transferredBy, mcID) => {
  console.log('Transferring lead', callId, 'to setter', newSetterId);

  // Create transfer log entry first
  const { error: logError } = await supabase
    .from('transfer_log')
    .insert({
      call_id: callId,
      from_setter_id: currentSetterId,
      to_setter_id: newSetterId,
      transferred_by: transferredBy,
      note: transferNote,
      created_at: new Date().toISOString()
    });

  if (logError) {
    console.error('Error creating transfer log:', logError);
    return false;
  }

  // Update the call's setter_id
  const { error: callError } = await supabase
    .from('calls')
    .update({ setter_id: newSetterId })
    .eq('id', callId);

  if (callError) {
    console.error('Error updating call setter:', callError);
    return false;
  }

  // Update Manychat if available
//   if (mcID) {
//     const { error: mcError } = await ManychatService.updateManychatField(mcID, 'setter_id', newSetterId);
//     if (mcError) {
//       console.error('Error updating manychat field:', mcError);
//       // Don't return false here, the main transfer still succeeded
//     }
//   }

  return true;
};

export function TransferSetterModal({ 
  isOpen, 
  onClose, 
  lead, 
  setterOptions,  
  onTransfer,
  currentUserId = null
}) {
  const [tempSetter, setTempSetter] = useState(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
  const [transferNote, setTransferNote] = useState('');

  const handleTransfer = async () => {
    // Validate that transfer note is provided
    if (!transferNote.trim()) {
      alert('Transfer note is required. Please provide a reason for the transfer.');
      return;
    }

    console.log('Transferring to setter ID:', tempSetter);
    
    const success = await transferLead(
      lead.id,
      tempSetter,
      lead.setter_id,
      transferNote,
      currentUserId,
      lead.manychat_user_id
    );

    if (success) {
      lead.setter_id = tempSetter; // Update the local lead object
      onTransfer(tempSetter); // Call the parent's transfer handler
      onClose();
    } else {
      alert('Failed to transfer lead. Please try again.');
    }
  };

  const handleClose = () => {
    setTempSetter(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
    setTransferNote('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <span style={{ display: 'block', fontSize: '30px', marginBottom: '26px' }}>
        Transfer <b>{lead.name}</b> to
      </span>
      <SetterDropdown
        value={tempSetter}
        onChange={(value) => setTempSetter(value)}
        label="Setter"
        options={setterOptions}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
        <label style={{ fontSize: '10px', color: '#6b7280', fontWeight: '500' }}>
          Transfer Note (required)
        </label>
        <textarea
          value={transferNote}
          onChange={(e) => setTransferNote(e.target.value)}
          placeholder="Add a note about why you're transferring this lead..."
          required
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            border: transferNote.trim() ? '1.5px solid rgb(133, 133, 133)' : '1.5px solid #ef4444',
            backgroundColor: transferNote.trim() ? '#fafaff' : '#fef2f2',
            color: '#343353',
            outline: 'none',
            boxShadow: transferNote.trim() ? '0 2px 8px rgba(168,139,250,0.08)' : '0 2px 8px rgba(239,68,68,0.15)',
            transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
            resize: 'vertical',
            minHeight: '60px',
            fontFamily: 'inherit'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#a855f7';
            e.target.style.boxShadow = '0 2px 8px rgba(168,139,250,0.15)';
            e.target.style.backgroundColor = '#fafaff';
          }}
          onBlur={(e) => {
            if (transferNote.trim()) {
              e.target.style.borderColor = 'rgb(133, 133, 133)';
              e.target.style.boxShadow = '0 2px 8px rgba(168,139,250,0.08)';
              e.target.style.backgroundColor = '#fafaff';
            } else {
              e.target.style.borderColor = '#ef4444';
              e.target.style.boxShadow = '0 2px 8px rgba(239,68,68,0.15)';
              e.target.style.backgroundColor = '#fef2f2';
            }
          }}
        />
        {!transferNote.trim() && (
          <div style={{ 
            fontSize: '12px', 
            color: '#ef4444', 
            marginTop: '4px',
            fontWeight: '500'
          }}>
            * Transfer note is required
          </div>
        )}
      </div>

      <button 
        onClick={handleTransfer} 
        disabled={!transferNote.trim()}
        style={{ 
          marginTop: '16px', 
          padding: '8px 16px', 
          backgroundColor: transferNote.trim() ? '#001749ff' : '#9ca3af', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          cursor: transferNote.trim() ? 'pointer' : 'not-allowed',
          opacity: transferNote.trim() ? 1 : 0.6,
          transition: 'all 0.2s'
        }}
      >
        Transfer
      </button>
    </Modal>
  );
}
