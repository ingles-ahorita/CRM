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
    const [isLoading, setIsLoading] = useState(false);
  

    const [noteData, setNoteData] = useState(null);

    const table = mode === 'closer' ? 'closer_notes' : 'setter_notes';
    const noteId = mode === 'closer' ? lead.closer_note_id : lead.setter_note_id;
  
  // Fetch note data when modal opens
  useEffect(() => {
    const fetchNote = async () => {
      if (!isOpen || !noteId) {
        setNoteData(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', noteId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching note:', error);
      }
      
      setNoteData(data);
      setIsLoading(false);
    };
    fetchNote();
        console.log("note data is: ", noteData);
  }, [isOpen, noteId, mode]);


  
  const handleSubmit = async (e) => {

    const table = mode === 'closer' ? 'closer_notes' : 'setter_notes';

    e.preventDefault();

    console.log(noteId);
    const formData = new FormData(e.target);
    
    const setterPayload = {
  commitment_level: parseInt(formData.get('commitment_level')) || null,
  practice_daily: formData.get('practice_daily') === 'on',
  motivation: formData.get('motivation'),
  decision_maker_present: formData.get('decision_maker_present') === 'on',
  prepared: formData.get('prepared') === 'on',
  show_up_confirmed: formData.get('show_up_confirmed') === 'on',
  notes: formData.get('notes')
};



const closerPayload = {
  prepared_score: parseInt(formData.get('prepared_score')) || null,
  prepared_reason: formData.get('prepared_reason'),
  budget_max: formData.get('budget_max'),
  objection: formData.get('objection'),
  notes: formData.get('notes')
};


const notePayload = mode === 'closer' ? closerPayload : setterPayload;



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
    width: '80%',
    backgroundColor: 'white',
    color: '#111827', MozAppearance: 'textfield', WebkitAppearance: 'none'
  };

  const labelStyle = {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '6px'
  };

  return (
    <>
    <style>{`
        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          border: 2px solid #d1d5db;
          border-radius: 3px;
          background-color: white;
          position: relative;
        }

        input[type="checkbox"]:checked {
          background-color: #001749ff;
          border-color: #001749ff;
        }
        
        input[type="checkbox"]:checked::after {
          content: '✓';
          position: absolute;
          color: white;
          font-size: 14px;
          left: 2px;
          top: -2px;
        }
      
      `}</style>

    {(mode === 'setter' )&&(
          <Modal isOpen={isOpen} onClose={onClose}>
      {isLoading ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '60px',
          gap: '16px',
          height: '500px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f4f6',
            borderTop: '4px solid #001749ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <span style={{ color: '#6b7280', fontSize: '14px' }}>Loading note...</span>
        </div>
      ) : ( <>
      <h2 style={{ fontSize: '30px', marginBottom: '26px' }}>
        {noteData ? 'Edit' : 'Add'} Note for <b>{lead.name}</b>
      </h2>

<form onSubmit={handleSubmit} key={noteData?.id || 'new'} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '40px', paddingRight: '40px', paddingBottom: '20px' }}>
  
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <label style={labelStyle}>🔥 Commitment level (1–10):</label>
    <input name="commitment_level" type="number" min="1" max="10" 
           defaultValue={noteData?.commitment_level || ''} style={{...inputStyle, width: '10%', textAlign: 'center'}} />
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
    {noteData ? 'Update Note' : 'Add Note'}
  </button>
</form>
      </> )}
    </Modal>)}


    {(mode === 'closer' )&&(
      <Modal isOpen={isOpen} onClose={onClose}>
  {isLoading ? (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '60px',
      gap: '16px',
      height: '500px'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '4px solid #f3f4f6',
        borderTop: '4px solid #001749ff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <span style={{ color: '#6b7280', fontSize: '14px' }}>Loading note...</span>
    </div>
  ) : (
    <>
      <h2 style={{ fontSize: '30px', marginBottom: '26px' }}>
        {noteData ? 'Edit' : 'Add'} Closer Note for <b>{lead.name}</b>
      </h2>

      <form onSubmit={handleSubmit} key={noteData?.id || 'new'} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '40px', paddingRight: '40px', paddingBottom: '20px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} >
          <label style={labelStyle}>🟢 Prepared score:</label>
            <input name="prepared_score" type="number" min="1" max="10" 
           defaultValue={noteData?.prepared_score || ''} style={{...inputStyle, width: '10%', textAlign: 'center'}} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <textarea name="prepared_reason" rows="3" placeholder='Reason for score'
                    defaultValue={noteData?.prepared_reason || ''} 
                    style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit'}} />
  </div>

        <div>
          <label style={labelStyle}>💲 Budget (max):</label>
          <input name="budget_max" type="text" 
                 defaultValue={noteData?.budget_max || ''} 
                 placeholder="e.g., $1000"
                 style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>⚡ Objection:</label>
          <textarea name="objection" rows="3" 
                    defaultValue={noteData?.objection || ''} 
                    style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit'}} />
        </div>

        <div>
          <label style={labelStyle}>📝 Note:</label><br></br>
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
          {noteData ? 'Update Note' : 'Add Note'}
        </button>
      </form>
    </>
  )}
</Modal>
    )}
     </>
  ); 
};




