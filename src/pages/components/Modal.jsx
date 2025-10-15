import { useState } from 'react';
import './Modal.css';
import { supabase } from '../../lib/supabaseClient';
import { useEffect } from 'react';

export function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}


export const NotesModal = ({ isOpen, onClose, lead, callId, mode }) => {

    const [noteData, setNoteData] = useState(null);

    const table = mode === 'closer' ? 'closer_notes' : 'setter_notes';
    const noteId = mode === 'closer' ? lead.closer_note_id : lead.setter_note_id;
  
  // Fetch note data when modal opens
  useEffect(() => {
    const fetchNote = async () => {
      if (!isOpen || !lead) {
        setNoteData(null);
        return;
      }
      
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', noteId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching note:', error);
      }
      
      setNoteData(data);
    };

    fetchNote();
  }, [isOpen, noteId, mode]);


  
  const handleSubmit = async (e) => {

    const table = mode === 'closer' ? 'closer_notes' : 'setter_notes';

    e.preventDefault();

    console.log(noteId);
    const formData = new FormData(e.target);
    
    const notePayload = {
  commitment_level: parseInt(formData.get('commitment_level')) || null,
  practice_daily: formData.get('practice_daily') === 'on',
  motivation: formData.get('motivation'),
  decision_maker_present: formData.get('decision_maker_present') === 'on',
  prepared: formData.get('prepared') === 'on',
  show_up_confirmed: formData.get('show_up_confirmed') === 'on',
  notes: formData.get('notes')
};

if (noteId) {
    // UPDATE: note exists
    const { error } = await supabase
      .from(table)
      .update(notePayload)
      .eq('id', noteId);
    
    if (error) {
      console.error('Error updating note:', error);
      return;
    }
  } else {
    // INSERT: create new note
    const { data, error } = await supabase
      .from(table)
      .insert(notePayload)
      .select()
      .single();

      if(mode === 'setter') lead.setter_note_id = data.id; // Update the local
      if(mode === 'closer') lead.closer_note_id = data.id; // Update the local

    if (error) {
      console.error('Error inserting note:', error);
      return;
    }

    // Link note to call
    const noteIdField = mode === 'closer' ? 'closer_note_id' : 'setter_note_id';
    const { error: updateError } = await supabase
      .from('calls')
      .update({ [noteIdField]: data.id })
      .eq('id', callId);
    
    if (updateError) {
      console.error('Error updating calls table:', updateError);
      return;
    }
  }
  
  onClose();
};

  if (!isOpen) return null;

  const inputStyle = {
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    backgroundColor: 'white',
    color: '#111827'
  };

  const labelStyle = {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '6px'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 style={{ fontSize: '30px', marginBottom: '26px' }}>
        {noteData ? 'Edit' : 'Add'} Note for <b>{lead.id}</b>
      </h2>

<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
  
  <div>
    <label style={labelStyle}>🔥 Commitment level (1–10):</label>
    <input name="commitment_level" type="number" min="1" max="10" 
           defaultValue={noteData?.commitment_level || ''} style={inputStyle} />
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="practice_daily" type="checkbox" 
           defaultChecked={noteData?.practice_daily || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>⏱️ Practice daily (min. 30m)</label>
  </div>

  <div>
    <label style={labelStyle}>🎯 Motivation (why):</label>
    <textarea name="motivation" rows="3" 
              defaultValue={noteData?.motivation || ''} 
              style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit'}} />
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="decision_maker_present" type="checkbox" 
           defaultChecked={noteData?.decision_maker_present || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>👥 Decision maker present?</label>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="prepared" type="checkbox" 
           defaultChecked={noteData?.prepared || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>✅ Prepared for the call?</label>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="show_up_confirmed" type="checkbox" 
           defaultChecked={noteData?.show_up_confirmed || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>📅 Show-up time/date confirmed?</label>
  </div>

  <div>
    <label style={labelStyle}>⚠️ Extra notes:</label>
    <textarea name="notes" rows="3" 
              defaultValue={noteData?.notes || ''} 
              style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit'}} />
  </div>

  <button type="submit" style={{ 
    marginTop: '8px', 
    padding: '10px 20px', 
    backgroundColor: '#001749ff', 
    color: 'white', 
    border: 'none', 
    borderRadius: '6px', 
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  }}>
    Save Note
  </button>
</form>
    </Modal>
  );
};











const handleAddNoteClick = async (id, mode) => {
  const notetype = mode === 'closer' ? 'closer_notes' : 'setter_notes'; // Determine note type based on mode

  // Fetch the note for this lead
  const { data, error } = await supabase
    .from(notetype)
    .select('*')
    .eq('id', id) // or whatever your foreign key column is named
    .single(); // Use .single() if there's only one note per call
    
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error fetching note:', error);
  }
  
  setNoteData(data);
  setShowNoteModal(true);
};