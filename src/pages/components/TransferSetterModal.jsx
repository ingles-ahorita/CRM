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
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '500',
          border: '1px solid #d1d5db',
          backgroundColor: '#e8e8e8ff',
          cursor: 'pointer',
          color: '#000000',
          outline: 'none'
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

const updateStatus = async (id, field, value, setterF, mcID) => {
  console.log('Updating', field, 'to', value, 'for lead ID:', id);
  setterF(value); // Update local state immediately for responsiveness

  let formattedValue = value;

  if (['picked_up', 'confirmed', 'showed_up', 'purchased'].includes(field)) {
    if (value === 'true' || value === true) {
      formattedValue = true;
    } else if (value === 'false' || value === false) {
      formattedValue = false;
    } else if (value === 'null' || value === null || value === '') {
      formattedValue = null;
    }
  } else if (field === 'setter_id') {
    formattedValue = value ? value : null;
  }

  const { error } = await supabase.from('calls').update({ [field]: formattedValue }).eq('id', id);
if(mcID) {
  const { error: mcError } = await ManychatService.updateManychatField(mcID, field, formattedValue);
  if (mcError) {
    console.error('Error updating manychat field:', mcError);
    return;
  }
}
  if (error) {
    console.error('Error updating lead:', error);
    return;
  }
};

export function TransferSetterModal({ 
  isOpen, 
  onClose, 
  lead, 
  setterOptions, 
  currentSetter, 
  onTransfer 
}) {
  const [tempSetter, setTempSetter] = useState(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');

  const handleTransfer = () => {
    console.log('Transferring to setter ID:', tempSetter);
    updateStatus(lead.id, 'setter_id', tempSetter, () => {}, lead.manychat_user_id);
    lead.setter_id = tempSetter; // Update the local lead object
    onTransfer(tempSetter); // Call the parent's transfer handler
    onClose();
  };

  const handleClose = () => {
    setTempSetter(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
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

      <button 
        onClick={handleTransfer} 
        style={{ 
          marginTop: '16px', 
          padding: '8px 16px', 
          backgroundColor: '#001749ff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          cursor: 'pointer' 
        }}
      >
        Transfer
      </button>
    </Modal>
  );
}
