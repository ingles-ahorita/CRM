import { useState } from 'react';
import './Modal.css';
import { supabase } from '../../lib/supabaseClient';
import { useEffect } from 'react';

export function Modal({ isOpen, onClose, children, className = "" }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${className}`} onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}


export const NotesModal = ({ isOpen, onClose, lead, callId, mode }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [outcome, setOutcome] = useState('');
    const [offers, setOffers] = useState([]);
    const [selectedOffer, setSelectedOffer] = useState(null);

    const [noteData, setNoteData] = useState(null);

    const table = mode === 'closer' ? 'outcome_log' : 'setter_notes';
    const noteId = mode === 'closer' ? lead.closer_note_id : lead.setter_note_id;
  
  // Fetch offers when modal opens (for closer mode)
  useEffect(() => {
    if (!isOpen || mode !== 'closer') {
      setOffers([]);
      return;
    }

    const fetchOffers = async () => {
      const { data, error } = await supabase
        .from('offers')
        .select('id, name, base_commission')
        .eq('active', true)
        .order('name');
      
      if (error) {
        console.error('Error fetching offers:', error);
      } else {
        setOffers(data || []);
      }
    };
    fetchOffers();
  }, [isOpen, mode]);

  // Fetch note data when modal opens
  useEffect(() => {

          if (!isOpen || !noteId) {
        setNoteData(null);
        setIsLoading(false);
        setOutcome('');
        setSelectedOffer(null);
        return;
      }

    const fetchNote = async () => {
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
      // Set outcome state when note data is loaded
      if (data?.outcome) {
        setOutcome(data.outcome);
      } else {
        setOutcome('');
      }
      // Set selected offer when note data is loaded
      if (data?.offer_id) {
        setSelectedOffer(data.offer_id);
      } else {
        setSelectedOffer(null);
      }
    };
    fetchNote();
        console.log("note data is: ", noteData);
  }, [isOpen, noteId, mode]);


  
  const handleSubmit = async (e) => {

    const table = mode === 'closer' ? 'outcome_log' : 'setter_notes';

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



// Calculate commission: base_commission - (percentage of discount)
// Only calculate when outcome is 'yes' and an offer is selected
const outcomeValue = formData.get('outcome') || '';
const discountValue = formData.get('discount') || '';
const offerId = formData.get('offer_id') || null;
let commission = null;

if (outcomeValue === 'yes' && offerId) {
  const selectedOfferObj = offers.find(o => o.id === offerId);
  if (selectedOfferObj && selectedOfferObj.base_commission) {
    if (discountValue) {
      // Discount is always a percentage
      const discountStr = discountValue.toString().trim();
      // let discountPercent = parseFloat(discountStr.replace('%', '')) || 0;
      commission = selectedOfferObj.base_commission - (selectedOfferObj.base_commission * discountValue / 100);
    } else {
      // No discount, use full base_commission
      commission = selectedOfferObj.base_commission;
    }
  }
}

// Extract and format purchase_date
const purchasedDateValue = formData.get('purchase_date') || null;
const purchasedDate = purchasedDateValue 
  ? new Date(purchasedDateValue).toISOString() 
  : null;

const closerPayload = {
  outcome: formData.get('outcome') || null,
  offer_id: offerId || null,
  discount: discountValue || null,
  commission: commission,
  purchase_date: purchasedDate,
  prepared_score: parseInt(formData.get('prepared_score')) || null,
  prepared_reason: formData.get('prepared_reason'),
  budget_max: formData.get('budget_max'),
  objection: formData.get('objection'),
  notes: formData.get('notes'),
  closer_id: lead.closer_id || null,
  setter_id: lead.setter_id || null,
  call_id: callId || null
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

    // Update purchase status based on outcome (for closer mode only)
    // Only set purchased=true when outcome is 'yes'
    if (mode === 'closer' && notePayload.outcome) {
      let purchasedValue = null;
      
      if (notePayload.outcome === 'yes') {
        purchasedValue = true;
      } else {
        purchasedValue = false;
      }
      // For 'lock_in' and 'follow_up', leave purchased as null/unchanged
      
      if (purchasedValue !== null) {
        const { error: purchaseError } = await supabase
          .from('calls')
          .update({ 
            purchased: purchasedValue,
            purchased_at: purchasedValue ? new Date().toISOString() : null
          })
          .eq('id', callId);
        
        if (purchaseError) {
          console.error('Error updating purchase status:', purchaseError);
        }
      }
      lead.purchased = purchasedValue;
    }
  } else {
    // INSERT: create new note
    const { data, error } = await supabase
      .from(table)
      .insert(notePayload)
      .select()
      .single();

    if (error) {
      console.error('Error inserting note:', error);
      return;
    }

    if (!data || !data.id) {
      console.error('No data returned from insert');
      return;
    }

    // Update local lead object
    if(mode === 'setter') lead.setter_note_id = data.id;
    if(mode === 'closer') {
      lead.closer_note_id = data.id;
      lead.purchased = notePayload.outcome === 'yes' ? true : false;
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

    // Update purchase status based on outcome (for closer mode only)
    // Only set purchased=true when outcome is 'yes'
    if (mode === 'closer' && notePayload.outcome) {
      let purchasedValue = null;
      
      if (notePayload.outcome === 'yes') {
        purchasedValue = true;
      } else {
        purchasedValue = false;
      }
      // For 'lock_in' and 'follow_up', leave purchased as null/unchanged
      
      if (purchasedValue !== null) {
        const { error: purchaseError } = await supabase
          .from('calls')
          .update({ 
            purchased: purchasedValue,
            purchased_at: purchasedValue ? new Date().toISOString() : null
          })
          .eq('id', callId);
        
        if (purchaseError) {
          console.error('Error updating purchase status:', purchaseError);
        }
      }
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
           defaultValue={noteData?.commitment_level || ''} style={{...inputStyle, width: '14%', textAlign: 'left'}} />
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

  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
  <button type="button" onClick={onClose} style={{ 
      padding: '10px 20px', 
      backgroundColor: '#6b7280', 
      color: 'white', 
      border: 'none', 
      borderRadius: '6px', 
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      flex: 1
    }}>
      Cancel
    </button>
    <button type="submit" style={{ 
      padding: '10px 20px', 
      backgroundColor: '#001749ff', 
      color: 'white', 
      border: 'none', 
      borderRadius: '6px', 
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      flex: 1
    }}>
      {noteData ? 'Update Note' : 'Add Note'}
    </button>
  </div>
</form>
      </> )}
    </Modal>)}


    {(mode === 'closer')&&(
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
        {noteData ? 'Edit' : 'Add'} Note for <b>{lead.name}</b>
      </h2>

      <form onSubmit={handleSubmit} key={noteData?.id || 'new'} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '40px', paddingRight: '40px', paddingBottom: '20px' }}>
        
        {/* Outcome Dropdown - Only for closer mode */}
        {mode === 'closer' && (
          <div>
            <label style={labelStyle}>📊 Outcome: <span style={{ color: 'red' }}>*</span></label>
            <select
              name="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              style={{...inputStyle, cursor: 'pointer', width: '100%'}}
              required
            >
              <option value="">Select outcome...</option>
              <option value="yes">YES</option>
              <option value="no">NO</option>
              <option value="lock_in">LOCK IN</option>
              <option value="follow_up">FOLLOW UP NEEDED</option>
              <option value="refund">REFUND</option>
            </select>
          </div>
        )}

        {/* Conditional Offer & Discount - Only show when outcome is yes */}
        {mode === 'closer' && outcome === 'yes' && (
          <>
            <div>
              <label style={labelStyle}>💰 Offer: <span style={{ color: 'red' }}>*</span></label>
              <select
                name="offer_id"
                value={selectedOffer || ''}
                onChange={(e) => setSelectedOffer(e.target.value)}
                style={{...inputStyle, cursor: 'pointer', width: '100%'}}
                required={outcome === 'yes'}
              >
                <option value="">Select an offer...</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>💸 Discount:</label>
              <input
                name="discount"
                type="text"
                defaultValue={noteData?.discount || ''}
                placeholder="e.g., 20%, $50, etc."
                style={{...inputStyle, width: '100%'}}
              />
            </div>
          </>
        )}

        {/* Purchased Date - Only show when outcome is yes or lock_in */}
        {mode === 'closer' && (outcome === 'yes' || outcome === 'lock_in' || outcome === 'refund') && (
          <div>
            <label style={labelStyle}>📅 Purchased Date:</label>
            <input
              name="purchase_date"
              type="date"
              defaultValue={
                noteData?.purchase_date 
                  ? new Date(noteData.purchase_date).toISOString().split('T')[0]
                  : new Date().toISOString().split('T')[0]
              }
              style={{...inputStyle, width: '100%'}}
            />
          </div>
        )}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} >
          <label style={labelStyle}>🟢 Prepared score:</label>
            <input name="prepared_score" type="number" min="1" max="10" 
           defaultValue={noteData?.prepared_score || ''} style={{...inputStyle, width: '14%', textAlign: 'center'}} />
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

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button type="button" onClick={onClose} style={{ 
            padding: '10px 20px', 
            backgroundColor: '#6b7280', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            flex: 1
          }}>
            Cancel
          </button>
          <button type="submit" style={{ 
            padding: '10px 20px', 
            backgroundColor: '#001749ff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            flex: 1
          }}>
            {noteData ? 'Update Note' : 'Add Note'}
          </button>
        </div>
      </form>
    </>
  )}
</Modal>
    )}
     </>
  ); 
};

export const ViewNotesModal = ({ isOpen, onClose, lead, callId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [setterNote, setSetterNote] = useState(null);
  const [closerNote, setCloserNote] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSetterNote(null);
      setCloserNote(null);
      setIsLoading(false);
      return;
    }

    const fetchNotes = async () => {
      setIsLoading(true);

      // Fetch setter note if exists
      if (lead.setter_note_id) {
        const { data, error } = await supabase
          .from('setter_notes')
          .select('*')
          .eq('id', lead.setter_note_id)
          .single();
        
        if (!error) setSetterNote(data);
      }

      // Fetch closer note if exists
      if (lead.closer_note_id) {
        const { data, error } = await supabase
          .from('outcome_log')
          .select('*, offer:offer_id(id, name)')
          .eq('id', lead.closer_note_id)
          .single();
        
        if (!error) setCloserNote(data);
      }

      setIsLoading(false);
    };

    fetchNotes();
  }, [isOpen, lead.setter_note_id, lead.closer_note_id]);

  if (!isOpen) return null;

  const sectionStyle = {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  const labelStyle = {
    fontSize: '13px',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '4px'
  };

  const valueStyle = {
    fontSize: '15px',
    color: '#111827',
    marginBottom: '12px'
  };

  const checkmarkStyle = (value) => ({
    display: 'inline-block',
    width: '20px',
    height: '20px',
    borderRadius: '3px',
    backgroundColor: value ? '#10b981' : '#e5e7eb',
    color: 'white',
    textAlign: 'center',
    lineHeight: '20px',
    marginRight: '8px'
  });

  return (
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
          <span style={{ color: '#6b7280', fontSize: '14px' }}>Loading notes...</span>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: '30px', marginBottom: '26px' }}>
            Notes for <b>{lead.name}</b>
          </h2>

          <div style={{ paddingLeft: '40px', paddingRight: '40px', paddingBottom: '20px', maxHeight: '600px', overflowY: 'auto' }}>
            
            {/* Setter Notes Section */}
            {setterNote ? (
              <div style={sectionStyle}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#001749ff' }}>
                  📞 Setter Notes
                </h3>

                <div>
                  <div style={labelStyle}>🔥 Commitment Level</div>
                  <div style={valueStyle}>
                    <span style={{ 
                      backgroundColor: '#001749ff', 
                      color: 'white', 
                      padding: '4px 12px', 
                      borderRadius: '20px',
                      fontWeight: '600'
                    }}>
                      {setterNote.commitment_level || 'N/A'}/10
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.practice_daily)}>
                    {setterNote.practice_daily ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>⏱️ Practice daily (min. 30m)</span>
                </div>

                {setterNote.motivation && (
                  <div>
                    <div style={labelStyle}>🎯 Motivation</div>
                    <div style={valueStyle}>{setterNote.motivation}</div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.decision_maker_present)}>
                    {setterNote.decision_maker_present ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>👥 Decision maker present</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.prepared)}>
                    {setterNote.prepared ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>✅ Prepared for call</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.show_up_confirmed)}>
                    {setterNote.show_up_confirmed ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>📅 Show-up confirmed</span>
                </div>

                {setterNote.notes && (
                  <div>
                    <div style={labelStyle}>⚠️ Extra Notes</div>
                    <div style={valueStyle}>{setterNote.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...sectionStyle, textAlign: 'center', color: '#9ca3af' }}>
                <p>No setter notes available</p>
              </div>
            )}

            {/* Closer Notes Section */}
            {closerNote ? (
              <div style={sectionStyle}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#001749ff' }}>
                  💼 Closer Notes
                </h3>

                {closerNote.outcome && (
                  <div>
                    <div style={labelStyle}>📊 Outcome</div>
                    <div style={valueStyle}>
                      <span style={{ 
                        backgroundColor: closerNote.outcome === 'yes' || closerNote.outcome === 'lock_in' ? '#10b981' : 
                                       closerNote.outcome === 'no' ? '#ef4444' : '#f59e0b', 
                        color: 'white', 
                        padding: '4px 12px', 
                        borderRadius: '20px',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        {closerNote.outcome === 'yes' ? 'YES' : 
                         closerNote.outcome === 'no' ? 'NO' : 
                         closerNote.outcome === 'lock_in' ? 'LOCK IN' : 
                         closerNote.outcome === 'follow_up' ? 'FOLLOW UP NEEDED' : 
                         closerNote.outcome}
                      </span>
                    </div>
                  </div>
                )}

                {closerNote.outcome === 'yes' && closerNote.offer_id && (
                  <div>
                    <div style={labelStyle}>💰 Offer</div>
                    <div style={valueStyle}>{closerNote.offer?.name || closerNote.offer_id}</div>
                  </div>
                )}

                {closerNote.outcome === 'yes' && closerNote.discount && (
                  <div>
                    <div style={labelStyle}>💸 Discount</div>
                    <div style={valueStyle}>{closerNote.discount}</div>
                  </div>
                )}

                {closerNote.outcome === 'yes' && closerNote.commission !== null && closerNote.commission !== undefined && (
                  <div>
                    <div style={labelStyle}>💵 Commission</div>
                    <div style={valueStyle}>${closerNote.commission.toFixed(2)}</div>
                  </div>
                )}

                {closerNote.purchase_date && (closerNote.outcome === 'yes' || closerNote.outcome === 'lock_in' || closerNote.outcome === 'refund') && (
                  <div>
                    <div style={labelStyle}>📅 Purchased Date</div>
                    <div style={valueStyle}>
                      {new Date(closerNote.purchase_date).toLocaleDateString()}
                    </div>
                  </div>
                )}

                <div>
                  <div style={labelStyle}>🟢 Prepared Score</div>
                  <div style={valueStyle}>
                    <span style={{ 
                      backgroundColor: '#10b981', 
                      color: 'white', 
                      padding: '4px 12px', 
                      borderRadius: '20px',
                      fontWeight: '600'
                    }}>
                      {closerNote.prepared_score || 'N/A'}/10
                    </span>
                  </div>
                </div>

                {closerNote.prepared_reason && (
                  <div>
                    <div style={labelStyle}>Reason for Score</div>
                    <div style={valueStyle}>{closerNote.prepared_reason}</div>
                  </div>
                )}

                {closerNote.budget_max && (
                  <div>
                    <div style={labelStyle}>💲 Budget (Max)</div>
                    <div style={valueStyle}>{closerNote.budget_max}</div>
                  </div>
                )}

                {closerNote.objection && (
                  <div>
                    <div style={labelStyle}>⚡ Objection</div>
                    <div style={valueStyle}>{closerNote.objection}</div>
                  </div>
                )}

                {closerNote.notes && (
                  <div>
                    <div style={labelStyle}>📝 Notes</div>
                    <div style={valueStyle}>{closerNote.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...sectionStyle, textAlign: 'center', color: '#9ca3af' }}>
                <p>No closer notes available</p>
              </div>
            )}

          </div>
        </>
      )}
    </Modal>
  );
};

export const PurchaseLogModal = ({ isOpen, onClose, lead, callId, onPurchaseComplete, initialPurchaseValue }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [offer, setOffer] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [purchaseValue, setPurchaseValue] = useState('true'); // 'true' or 'false'

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Set purchase value based on what was selected in dropdown
      if (initialPurchaseValue !== null && initialPurchaseValue !== undefined) {
        const value = initialPurchaseValue === 'true' || initialPurchaseValue === true ? 'true' : 'false';
        setPurchaseValue(value);
      } else {
        setPurchaseValue('true');
      }
    } else {
      setOffer('');
      setDiscount('');
      setNotes('');
      setFollowUp(false);
      setPurchaseValue('true');
    }
  }, [isOpen, initialPurchaseValue]);

  // List of offers - you can customize this or fetch from a table
  const offers = [
    'Offer 1',
    'Offer 2',
    'Offer 3',
    'Premium Package',
    'Standard Package',
    'Basic Package'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!offer) {
      alert('Please select an offer');
      return;
    }

    setIsLoading(true);

    try {
      // Create purchase log entry
      const purchaseLogData = {
        call_id: callId,
        offer: offer,
        discount: discount || null,
        notes: notes || null,
        follow_up: followUp,
        purchased: purchaseValue === 'true'
      };

      const { data: purchaseLog, error: purchaseLogError } = await supabase
        .from('purchase_logs')
        .insert(purchaseLogData)
        .select()
        .single();

      if (purchaseLogError) {
        console.error('Error creating purchase log:', purchaseLogError);
        // If table doesn't exist, we'll still update the purchase status
        // but log the error
      }

      // Update the purchase status
      const formattedValue = purchaseValue === 'true' ? true : false;
      const { error: updateError } = await supabase
        .from('calls')
        .update({ 
          purchased: formattedValue,
          purchased_at: formattedValue ? new Date().toISOString() : null
        })
        .eq('id', callId);

      if (updateError) {
        console.error('Error updating purchase status:', updateError);
        alert('Failed to update purchase status. Please try again.');
        setIsLoading(false);
        return;
      }

      // Call the callback to update the UI
      if (onPurchaseComplete) {
        onPurchaseComplete(formattedValue);
      }

      onClose();
    } catch (err) {
      console.error('Error in purchase log:', err);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
    marginBottom: '6px',
    display: 'block'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
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
            <span style={{ color: '#6b7280', fontSize: '14px' }}>Saving purchase log...</span>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '30px', marginBottom: '26px' }}>
              Purchase Log for <b>{lead.name}</b>
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '40px', paddingRight: '40px', paddingBottom: '20px' }}>
              
              {/* Purchase Status */}
              <div>
                <label style={labelStyle}>Purchase Status:</label>
                <select
                  value={purchaseValue}
                  onChange={(e) => setPurchaseValue(e.target.value)}
                  style={selectStyle}
                  required
                >
                  <option value="true">Yes - Purchased</option>
                  <option value="false">No - Not Purchased</option>
                </select>
              </div>

              {/* Offer Dropdown */}
              <div>
                <label style={labelStyle}>💰 Offer: <span style={{ color: 'red' }}>*</span></label>
                <select
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  style={selectStyle}
                  required
                >
                  <option value="">Select an offer...</option>
                  {offers.map((offerOption, index) => (
                    <option key={index} value={offerOption}>
                      {offerOption}
                    </option>
                  ))}
                </select>
              </div>

              {/* Discount */}
              <div>
                <label style={labelStyle}>💸 Discount:</label>
                <input
                  type="text"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="e.g., 20%, $50, etc."
                  style={inputStyle}
                />
              </div>

              {/* Closer's Notes */}
              <div>
                <label style={labelStyle}>📝 Closer's Notes:</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows="4"
                  placeholder="Add any additional notes..."
                  style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit'}}
                />
              </div>

              {/* Follow-up Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={followUp}
                  onChange={(e) => setFollowUp(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label style={labelStyle}>📞 Follow-up needed?</label>
              </div>

              <button
                type="submit"
                style={{ 
                  marginTop: '8px', 
                  padding: '10px 20px', 
                  backgroundColor: '#001749ff', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Save Purchase Log
              </button>
            </form>
          </>
        )}
      </Modal>
    </>
  );
};




