import { useState } from 'react';
import './Modal.css';
import { supabase } from '../../lib/supabaseClient';
import { useEffect } from 'react';
import * as DateHelpers from '../../utils/dateHelpers';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
    const [calendlyQuestions, setCalendlyQuestions] = useState(null);
    const [calendlyQuestionsExpanded, setCalendlyQuestionsExpanded] = useState(false);

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
        .select('id, name, base_commission, PIF_commission')
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

  // Fetch calendly_questions when modal opens (for setter mode)
  useEffect(() => {
    if (!isOpen || mode !== 'setter') {
      setCalendlyQuestions(null);
      setCalendlyQuestionsExpanded(false);
      return;
    }

    const fetchCalendlyQuestions = async () => {
      const callIdToFetch = callId || lead.id;
      if (callIdToFetch) {
        const { data: callData, error: callError } = await supabase
          .from('calls')
          .select('calendly_questions')
          .eq('id', callIdToFetch)
          .single();
        
        if (!callError && callData?.calendly_questions) {
          const parsed = parseCalendlyQuestions(callData.calendly_questions);
          setCalendlyQuestions(parsed);
        }
      }
    };
    fetchCalendlyQuestions();
  }, [isOpen, mode, callId, lead.id]);

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
  practice_daily: formData.get('practice_daily') === 'on',
  motivation: formData.get('motivation'),
  show_up_confirmed: formData.get('show_up_confirmed') === 'on',
  watched_masterclass: formData.get('watched_masterclass') === 'on',
  current_job: formData.get('current_job'),
  open_to_invest: formData.get('open_to_invest') === 'on',
  notes: formData.get('notes')
};



// Calculate commission: base_commission - (percentage of discount)
// Or PIF_commission if PIF checkbox is checked
// Calculate when outcome is 'yes' or 'refund' and an offer is selected
// For refunds, commission is the same as purchase but negative
const outcomeValue = formData.get('outcome') || '';
const discountValue = formData.get('discount') || '';
const offerId = formData.get('offer_id') || null;
const pifChecked = formData.get('pif') === 'on';
let commission = null;

if ((outcomeValue === 'yes' || outcomeValue === 'refund') && offerId) {
  const selectedOfferObj = offers.find(o => o.id === offerId);
  if (selectedOfferObj) {
    let calculatedCommission = null;
    
    // If PIF checkbox is checked, use PIF_commission
    if (pifChecked && selectedOfferObj.PIF_commission) {
      calculatedCommission = selectedOfferObj.PIF_commission;
    } else if (selectedOfferObj.base_commission) {
      // Otherwise use base_commission with discount
      if (discountValue) {
        // Discount is always a percentage
        const discountStr = discountValue.toString().trim();
        // let discountPercent = parseFloat(discountStr.replace('%', '')) || 0;
        calculatedCommission = selectedOfferObj.base_commission - (selectedOfferObj.base_commission * discountValue / 100);
      } else {
        // No discount, use full base_commission
        calculatedCommission = selectedOfferObj.base_commission;
      }
    }
    
    // For refunds, make commission negative
    if (calculatedCommission !== null) {
      commission = outcomeValue === 'refund' ? -calculatedCommission : calculatedCommission;
    }
  }
}

// Extract and format purchase_date
const purchasedDateValue = formData.get('purchase_date') || null;
const purchasedDate = purchasedDateValue 
  ? new Date(purchasedDateValue).toISOString() 
  : null;

const refundDateValue = formData.get('refund_date') || null;
const refundDate = refundDateValue 
  ? new Date(refundDateValue).toISOString() 
  : null;

// Extract clawback percentage (default 100)
const clawbackPercentage = parseFloat(formData.get('clawback')) || 100;

// Apply clawback percentage to refund commissions
if (outcomeValue === 'refund' && commission !== null && clawbackPercentage < 100) {
  const originalCommission = Math.abs(commission); // Get the positive value
  
  // Check if refund and purchase are in the same month
  if (purchasedDate && refundDate) {
    const purchaseDate = new Date(purchasedDate);
    const refundDateObj = new Date(refundDate);
    const purchaseMonth = purchaseDate.getFullYear() * 12 + purchaseDate.getMonth();
    const refundMonth = refundDateObj.getFullYear() * 12 + refundDateObj.getMonth();
    const isSameMonth = purchaseMonth === refundMonth;
    
    if (isSameMonth) {
      // Same month refund: commission becomes positive (opposite of 0)
      // Formula: original_commission * (100 - clawback) / 100
      commission = originalCommission * (100 - clawbackPercentage) / 100;
    } else {
      // Previous month refund: reduce the negative commission
      // Formula: negative_commission * clawback / 100
      commission = commission * clawbackPercentage / 100;
    }
  } else {
    // If dates are missing, assume previous month and reduce negative
    commission = commission * clawbackPercentage / 100;
  }
}

const paidSecondInstallment = formData.get('paid_second_installment') === 'on';

const closerPayload = {
  outcome: formData.get('outcome') || null,
  offer_id: offerId || null,
  discount: discountValue || null,
  commission: commission,
  purchase_date: purchasedDate,
  refund_date: refundDate,
  clawback: outcomeValue === 'refund' ? clawbackPercentage : null,
  prepared_score: parseInt(formData.get('prepared_score')) || null,
  prepared_reason: formData.get('prepared_reason'),
  budget_max: formData.get('budget_max'),
  objection: formData.get('objection'),
  notes: formData.get('notes'),
  closer_id: lead.closer_id || null,
  setter_id: lead.setter_id || null,
  call_id: callId || null,
  PIF: pifChecked,
  paid_second_installment: paidSecondInstallment
};


const notePayload = mode === 'closer' ? closerPayload : setterPayload;

// For outcome_log (closer mode), check if an outcome_log already exists for this call_id
// to prevent duplicates
let existingOutcomeLogId = null;
if (mode === 'closer' && callId && !noteId) {
  const { data: existingLog } = await supabase
    .from('outcome_log')
    .select('id')
    .eq('call_id', callId)
    .maybeSingle();
  
  if (existingLog) {
    existingOutcomeLogId = existingLog.id;
  }
}

// Use existing outcome_log ID if found, otherwise use noteId
const idToUse = existingOutcomeLogId || noteId;

if (idToUse) {
    // UPDATE: note exists (either by noteId or existing outcome_log for call_id)
    const { error } = await supabase
      .from(table)
      .update(notePayload)
      .eq('id', idToUse);
    
    if (error) {
      console.error('Error updating note:', error);
      return;
    }

    // If we found an existing outcome_log that wasn't linked, link it now
    if (mode === 'closer' && existingOutcomeLogId && !noteId) {
      const { error: linkError } = await supabase
        .from('calls')
        .update({ closer_note_id: existingOutcomeLogId })
        .eq('id', callId);
      
      if (linkError) {
        console.error('Error linking outcome_log to call:', linkError);
      } else {
        lead.closer_note_id = existingOutcomeLogId;
      }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '26px', paddingRight: '40px' }}>
        <h2 style={{ fontSize: '30px', margin: 0 }}>
          {noteData ? 'Edit' : 'Add'} Note for <b>{lead.name}</b>
        </h2>
        {lead.timezone && (
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginRight: '30px' }}>
            Timezone: {lead.timezone} (UTC{DateHelpers.getUTCOffset(lead.timezone)})
          </span>
        )}
      </div>

      {/* Calendly Questions - Compact Display (Setter Mode Only) */}
      {mode === 'setter' && calendlyQuestions && Array.isArray(calendlyQuestions) && calendlyQuestions.length > 0 && (
        <div style={{ 
          marginBottom: '20px', 
          paddingLeft: '40px', 
          paddingRight: '40px'
        }}>
          <div 
            onClick={() => setCalendlyQuestionsExpanded(!calendlyQuestionsExpanded)}
            style={{ 
              fontSize: '13px', 
              fontWeight: '600', 
              color: '#001749ff', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              userSelect: 'none',
              padding: '8px 12px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              marginBottom: calendlyQuestionsExpanded ? '10px' : '0'
            }}
          >
            {calendlyQuestionsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>📋 Calendly Q&A</span>
          </div>
          {calendlyQuestionsExpanded && (
            <div style={{ 
              backgroundColor: '#f9fafb',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              marginTop: '8px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {calendlyQuestions.map((qa, index) => (
                  qa.Answer ? (
                    <div key={index} style={{
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: '#374151'
                    }}>
                      <span style={{ fontWeight: '600', color: '#001749ff' }}>
                        {index + 1}. {qa.Question || `Q${index + 1}`}
                      </span>
                      <span style={{ marginLeft: '6px', color: '#111827' }}>
                        {qa.Answer}
                      </span>
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          )}
        </div>
      )}

<div style={{ marginBottom: '20px' }}>
<form id="setter-note-form" onSubmit={handleSubmit} key={noteData?.id || 'new'} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingLeft: '40px', paddingRight: '40px' }}>
  
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="practice_daily" type="checkbox" 
           defaultChecked={noteData?.practice_daily || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>⏱️ Practice daily (min. 30m)</label>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="show_up_confirmed" type="checkbox" 
           defaultChecked={noteData?.show_up_confirmed || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>📅 Show-up time/date confirmed?</label>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="watched_masterclass" type="checkbox" 
           defaultChecked={noteData?.watched_masterclass || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>🎥 Watched masterclass?</label>
  </div>

  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input name="open_to_invest" type="checkbox" 
           defaultChecked={noteData?.open_to_invest || false}
           style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
    <label style={labelStyle}>💰 Open to invest?</label>
  </div>

  <div style={{ gridColumn: '1 / -1' }}>
    <label style={labelStyle}>💼 Current job:</label>
    <input name="current_job" type="text" 
           defaultValue={noteData?.current_job || ''} 
           style={{...inputStyle, width: '100%'}} />
  </div>

  <div style={{ gridColumn: '1 / -1' }}>
    <label style={labelStyle}>🎯 Important reason to learn english:</label>
    <textarea name="motivation" rows="2" 
              defaultValue={noteData?.motivation || ''} 
              style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%'}} />
  </div>

  <div style={{ gridColumn: '1 / -1' }}>
    <label style={labelStyle}>⚠️ Extra notes:</label>
    <textarea name="notes" rows="2" 
              defaultValue={noteData?.notes || ''} 
              style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%'}} />
  </div>

</form>
</div>

  <div style={{ display: 'flex', gap: '10px', paddingLeft: '40px', paddingRight: '40px' }}>
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
    <button type="submit" form="setter-note-form" style={{ 
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '26px', paddingRight: '40px' }}>
        <h2 style={{ fontSize: '30px', margin: 0 }}>
          {noteData ? 'Edit' : 'Add'} Note for <b>{lead.name}</b>
        </h2>
        {lead.timezone && (
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginRight: '30px' }}>
            Timezone: {lead.timezone} (UTC{DateHelpers.getUTCOffset(lead.timezone)})
          </span>
        )}
      </div>

      <div style={{ marginBottom: '20px', maxHeight: (outcome === 'yes' || outcome === 'lock_in' || outcome === 'refund') ? '60vh' : 'none', overflowY: (outcome === 'yes' || outcome === 'lock_in' || outcome === 'refund') ? 'auto' : 'visible', paddingRight: (outcome === 'yes' || outcome === 'lock_in' || outcome === 'refund') ? '10px' : '0' }}>
      <form id="closer-note-form" onSubmit={handleSubmit} key={noteData?.id || 'new'} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingLeft: '40px', paddingRight: '40px' }}>
        
        {/* Outcome Dropdown - Only for closer mode */}
        {mode === 'closer' && (
          <div style={{ gridColumn: '1 / -1' }}>
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

        {/* Conditional Offer & Discount - Show when outcome is yes or refund */}
        {mode === 'closer' && (outcome === 'yes' || outcome === 'refund') && (
          <>
            <div>
              <label style={labelStyle}>💰 Offer: <span style={{ color: 'red' }}>*</span></label>
              <select
                name="offer_id"
                value={selectedOffer || ''}
                onChange={(e) => setSelectedOffer(e.target.value)}
                style={{...inputStyle, cursor: 'pointer', width: '100%'}}
                required={outcome === 'yes' || outcome === 'refund'}
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
              <label style={{...labelStyle, marginBottom: '12px', display: 'block'}}>💸 Discount:</label>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <input
                  name="discount"
                  type="text"
                  defaultValue={noteData?.discount || ''}
                  placeholder="e.g., 10%"
                  style={{...inputStyle, width: '150px', paddingRight: '30px'}}
                />
                <span style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: '#6b7280',
                  pointerEvents: 'none'
                }}>%</span>
              </div>
            </div>

            {outcome === 'yes' && (
              <>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    name="pif" 
                    type="checkbox" 
                    defaultChecked={noteData?.PIF || noteData?.pif || false}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                  />
                  <label style={labelStyle}>💳 PIF (Pay In Full)</label>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    name="paid_second_installment" 
                    type="checkbox" 
                    defaultChecked={noteData?.paid_second_installment || false}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                  />
                  <label style={labelStyle}>💰 Paid Second Installment</label>
                </div>
              </>
            )}
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

        {/* Refund Date - Only show when outcome is refund */}
        {mode === 'closer' && outcome === 'refund' && (
          <div>
            <label style={labelStyle}>🔄 Refund Date:</label>
            <input
              name="refund_date"
              type="date"
              defaultValue={
                noteData?.refund_date 
                  ? new Date(noteData.refund_date).toISOString().split('T')[0]
                  : new Date().toISOString().split('T')[0]
              }
              style={{...inputStyle, width: '100%'}}
            />
          </div>
        )}

        {/* Clawback Percentage - Only show when outcome is refund */}
        {mode === 'closer' && outcome === 'refund' && (
          <div>
            <label style={labelStyle}>💰 Clawback Percentage:</label>
            <input
              name="clawback"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={noteData?.clawback ?? 100}
              placeholder="100"
              style={{...inputStyle, width: '100%'}}
            />
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Default: 100%. If less, negative commission is reduced or $0 becomes positive.
            </p>
          </div>
        )}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} >
          <label style={labelStyle}>🟢 Prepared score:</label>
            <input name="prepared_score" type="number" min="1" max="10" 
           defaultValue={noteData?.prepared_score || ''} style={{...inputStyle, width: '60px', minWidth: '60px', textAlign: 'center'}} />
        </div>

        <div>
          <label style={labelStyle}>💲 Budget (max):</label>
          <input name="budget_max" type="text" 
                 defaultValue={noteData?.budget_max || ''} 
                 placeholder="e.g., $1000"
                 style={{...inputStyle, width: '100%'}} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Reason for score:</label>
          <textarea name="prepared_reason" rows="2" placeholder='Reason for score'
                    defaultValue={noteData?.prepared_reason || ''} 
                    style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%'}} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>⚡ Objection:</label>
          <textarea name="objection" rows="2" 
                    defaultValue={noteData?.objection || ''} 
                    style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%'}} />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>📝 Note:</label>
          <textarea name="notes" rows="2" 
                    defaultValue={noteData?.notes || ''} 
                    style={{...inputStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%'}} />
        </div>

      </form>
      </div>

      <div style={{ display: 'flex', gap: '10px', paddingLeft: '40px', paddingRight: '40px' }}>
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
          <button type="submit" form="closer-note-form" style={{ 
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
    </>
  )}
</Modal>
    )}
     </>
  ); 
};

/**
 * Parse calendly questions (handles both old and new formats)
 * @param {string|object} data - The calendly_questions data
 * @returns {Array|null} Array of {Question, Answer} objects or null
 */
function parseCalendlyQuestions(data) {
  if (!data) return null;
  
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    
    // New format: array with question/answer strings
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question && parsed[0].answer) {
      const questions = parsed[0].question.split(',').map(q => q.trim());
      const answers = parsed[0].answer.split(',').map(a => a.trim());
      
      return questions.map((q, index) => ({
        Question: q,
        Answer: answers[index] || null
      })).filter(qa => qa.Question); // Filter out empty questions
    }
    
    // Old format: output.QA structure
    if (parsed.output && parsed.output.QA && Array.isArray(parsed.output.QA)) {
      return parsed.output.QA;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing calendly_questions:', error);
    return null;
  }
}

/**
 * Format Deepgram transcription with speaker separation
 * @param {object} deepgramResponse - The parsed Deepgram API response
 * @returns {string} Formatted transcription with speaker labels
 */
function formatTranscriptionWithSpeakers(deepgramResponse) {
  try {
    // First, try to get the simple transcript as fallback
    const simpleTranscript = deepgramResponse?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    
    const words = deepgramResponse?.results?.channels?.[0]?.alternatives?.[0]?.words;
    
    // If no words array or words don't have speaker info, return simple transcript
    if (!words || !Array.isArray(words) || words.length === 0) {
      console.log('No words array found, using simple transcript');
      return simpleTranscript || '';
    }

    // Check if any words have speaker information
    const hasSpeakerInfo = words.some(word => word.speaker !== undefined && word.speaker !== null);
    
    if (!hasSpeakerInfo) {
      console.log('No speaker information in words, using simple transcript');
      return simpleTranscript || '';
    }

    // Group words by speaker
    const speakerGroups = [];
    let currentSpeaker = null;
    let currentGroup = [];

    words.forEach((wordObj) => {
      const speaker = wordObj.speaker !== undefined && wordObj.speaker !== null ? wordObj.speaker : null;
      const word = wordObj.word || '';

      if (speaker !== currentSpeaker) {
        // Save previous group
        if (currentGroup.length > 0 && currentSpeaker !== null) {
          speakerGroups.push({
            speaker: currentSpeaker,
            text: currentGroup.join(' ')
          });
        }
        // Start new group
        currentSpeaker = speaker;
        currentGroup = [word];
      } else {
        currentGroup.push(word);
      }
    });

    // Add last group
    if (currentGroup.length > 0 && currentSpeaker !== null) {
      speakerGroups.push({
        speaker: currentSpeaker,
        text: currentGroup.join(' ')
      });
    }

    // Format with speaker labels
    if (speakerGroups.length > 0) {
      const formatted = speakerGroups.map(group => {
        const speakerLabel = group.speaker !== null && group.speaker !== undefined 
          ? `Speaker ${group.speaker + 1}` 
          : 'Speaker';
        return `${speakerLabel}: ${group.text}`;
      }).join('\n\n');
      
      console.log('Formatted transcription with speakers:', formatted.substring(0, 100));
      return formatted;
    }

    // Fallback to simple transcript
    console.log('No speaker groups created, using simple transcript');
    return simpleTranscript || '';
  } catch (error) {
    console.error('Error formatting transcription with speakers:', error);
    // Fallback to simple transcript  
    const simpleTranscript = deepgramResponse?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return simpleTranscript || '';
  }
}

export const ViewNotesModal = ({ isOpen, onClose, lead, callId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [setterNote, setSetterNote] = useState(null);
  const [closerNote, setCloserNote] = useState(null);
  const [transcriptions, setTranscriptions] = useState([]);
  const [expandedTranscriptions, setExpandedTranscriptions] = useState({});
  const [calendlyQuestions, setCalendlyQuestions] = useState(null);
  const [calendlyQuestionsExpanded, setCalendlyQuestionsExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSetterNote(null);
      setCloserNote(null);
      setTranscriptions([]);
      setIsLoading(false);
      setExpandedTranscriptions({});
      setCalendlyQuestions(null);
      setCalendlyQuestionsExpanded(false);
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

      // Fetch all transcriptions from setter_calls if callId exists
      if (callId) {
        const { data, error } = await supabase
          .from('setter_calls')
          .select('transcription, created_at')
          .eq('call_id', callId)
          .order('created_at', { ascending: false });
        
        console.log('Fetched transcription data:', { data, error, callId });
        
        if (!error && data && data.length > 0) {
          const formattedTranscriptions = data.map((item, index) => {
            if (!item.transcription) return null;
            
            // Parse transcription if it's a JSON string, otherwise use as is
            try {
              const parsed = JSON.parse(item.transcription);
              console.log(`Parsed transcription ${index + 1}:`, parsed);
              // Extract speaker-separated transcription from Deepgram response
              const formattedTranscription = formatTranscriptionWithSpeakers(parsed);
              console.log(`Formatted transcription ${index + 1}:`, formattedTranscription);
              
              // Only return if we got a non-empty result
              if (formattedTranscription && formattedTranscription.trim().length > 0) {
                return {
                  text: formattedTranscription,
                  createdAt: item.created_at,
                  index: index + 1
                };
              } else {
                // Fallback to simple transcript if formatting returned empty
                const simpleTranscript = parsed?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
                if (simpleTranscript) {
                  return {
                    text: simpleTranscript,
                    createdAt: item.created_at,
                    index: index + 1
                  };
                } else {
                  return {
                    text: item.transcription,
                    createdAt: item.created_at,
                    index: index + 1
                  };
                }
              }
            } catch (parseError) {
              console.error(`Error parsing transcription ${index + 1}:`, parseError);
              // If not JSON, use as is
              return {
                text: item.transcription,
                createdAt: item.created_at,
                index: index + 1
              };
            }
          }).filter(Boolean); // Remove null entries
          
          setTranscriptions(formattedTranscriptions);
          // Initialize all transcriptions as collapsed
          const initialExpanded = {};
          formattedTranscriptions.forEach((_, index) => {
            initialExpanded[index] = false;
          });
          setExpandedTranscriptions(initialExpanded);
        } else {
          console.log('No transcriptions found:', { error, data, callId });
        }
      }

      // Fetch calendly_questions from calls table
      const callIdToFetch = callId || lead.id;
      if (callIdToFetch) {
        const { data: callData, error: callError } = await supabase
          .from('calls')
          .select('calendly_questions')
          .eq('id', callIdToFetch)
          .single();
        
        if (!callError && callData?.calendly_questions) {
          const parsed = parseCalendlyQuestions(callData.calendly_questions);
          setCalendlyQuestions(parsed);
        }
      }

      setIsLoading(false);
    };

    fetchNotes();
  }, [isOpen, lead.setter_note_id, lead.closer_note_id, callId]);
  
  // Helper function to render a single transcription
  const renderTranscription = (transcriptionText, index, createdAt) => {
    return (
      <div>
        {transcriptionText.includes('Speaker') && transcriptionText.includes(':') ? (
          // Speaker-separated format
          transcriptionText.split('\n\n').filter(seg => seg.trim()).map((segment, segIndex) => {
            // Check if segment starts with "Speaker X:"
            const speakerMatch = segment.match(/^(Speaker \d+):\s*(.*)$/);
            if (speakerMatch) {
              const [, speakerLabel, text] = speakerMatch;
              return (
                <div key={segIndex} style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#001749ff',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: speakerLabel.includes('Speaker 1') ? '#3b82f6' : '#10b981'
                    }}></span>
                    {speakerLabel}
                  </div>
                  <div style={{
                    fontSize: '15px',
                    color: '#111827',
                    lineHeight: '1.6',
                    paddingLeft: '16px',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {text}
                  </div>
                </div>
              );
            }
            // Fallback for segments without speaker label
            return segment.trim() ? (
              <div key={segIndex} style={{
                fontSize: '15px',
                color: '#111827',
                lineHeight: '1.6',
                marginBottom: '16px',
                whiteSpace: 'pre-wrap'
              }}>
                {segment}
              </div>
            ) : null;
          })
        ) : (
          // Plain text format
          <div style={{
            fontSize: '15px',
            color: '#111827',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap'
          }}>
            {transcriptionText}
          </div>
        )}
      </div>
    );
  };

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

          <div style={{ paddingLeft: '40px', paddingRight: '50px', paddingBottom: '20px' }}>
            
            {/* Setter Notes Section */}
            {setterNote ? (
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingRight: '40px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#001749ff' }}>
                    📞 Setter Notes
                  </h3>
                  {lead.timezone && (
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginRight: '30px' }}>
                      Timezone: {lead.timezone} ({DateHelpers.getUTCOffset(lead.timezone)})
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.practice_daily)}>
                    {setterNote.practice_daily ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>⏱️ Practice daily (min. 30m)</span>
                </div>

                {setterNote.motivation && (
                  <div>
                    <div style={labelStyle}>🎯 Important reason to learn english</div>
                    <div style={valueStyle}>{setterNote.motivation}</div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.show_up_confirmed)}>
                    {setterNote.show_up_confirmed ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>📅 Show-up confirmed</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.watched_masterclass)}>
                    {setterNote.watched_masterclass ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>🎥 Watched masterclass</span>
                </div>

                {setterNote.current_job && (
                  <div>
                    <div style={labelStyle}>💼 Current Job</div>
                    <div style={valueStyle}>{setterNote.current_job}</div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={checkmarkStyle(setterNote.open_to_invest)}>
                    {setterNote.open_to_invest ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '15px' }}>💰 Open to invest</span>
                </div>

                {setterNote.notes && (
                  <div>
                    <div style={labelStyle}>⚠️ Extra Notes</div>
                    <div style={valueStyle}>{setterNote.notes}</div>
                  </div>
                )}

                {calendlyQuestions && Array.isArray(calendlyQuestions) && calendlyQuestions.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                    <div 
                      onClick={() => setCalendlyQuestionsExpanded(!calendlyQuestionsExpanded)}
                      style={{ 
                        ...labelStyle, 
                        marginBottom: calendlyQuestionsExpanded ? '10px' : '0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        userSelect: 'none',
                        padding: '8px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      {calendlyQuestionsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <span>📋 Calendly Q&A</span>
                    </div>
                    {calendlyQuestionsExpanded && (
                      <div style={{ 
                        backgroundColor: '#f9fafb',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        marginTop: '8px'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {calendlyQuestions.map((qa, index) => (
                            qa.Answer ? (
                              <div key={index} style={{
                                fontSize: '13px',
                                lineHeight: '1.5',
                                color: '#374151'
                              }}>
                                <span style={{ fontWeight: '600', color: '#001749ff' }}>
                                  {index + 1}. {qa.Question || `Q${index + 1}`}
                                </span>
                                <span style={{ marginLeft: '6px', color: '#111827' }}>
                                  {qa.Answer}
                                </span>
                              </div>
                            ) : null
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {transcriptions.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ ...labelStyle, marginBottom: '12px' }}>
                      🎙️ Setter's Call Transcriptions
                    </div>
                    {transcriptions.map((transcription, index) => {
                      const isExpanded = expandedTranscriptions[index] === true;
                      return (
                        <div key={index} style={{ marginBottom: index < transcriptions.length - 1 ? '16px' : '0' }}>
                          <div 
                            style={{ 
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#001749ff',
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              userSelect: 'none',
                              padding: '8px 12px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb'
                            }}
                            onClick={() => setExpandedTranscriptions(prev => ({
                              ...prev,
                              [index]: !isExpanded
                            }))}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            <span>Transcription #{index + 1}</span>
                            {transcription.createdAt && (
                              <span style={{ fontSize: '12px', fontWeight: '400', color: '#6b7280', marginLeft: 'auto' }}>
                                {new Date(transcription.createdAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {isExpanded && (
                            <div style={{
                              backgroundColor: '#ffffff',
                              padding: '16px',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb',
                              maxHeight: '400px',
                              overflowY: 'auto',
                              marginTop: '8px'
                            }}>
                              {renderTranscription(transcription.text, index, transcription.createdAt)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...sectionStyle, textAlign: 'center', color: '#9ca3af' }}>
                <p>No setter notes available</p>
                {transcriptions.length > 0 && (
                  <div style={{ marginTop: '20px', textAlign: 'left' }}>
                    <div style={{ ...labelStyle, marginBottom: '12px' }}>
                      🎙️ Call Transcription{transcriptions.length > 1 ? `s (${transcriptions.length})` : ''}
                    </div>
                    {transcriptions.map((transcription, index) => {
                      const isExpanded = expandedTranscriptions[index] === true;
                      return (
                        <div key={index} style={{ marginBottom: index < transcriptions.length - 1 ? '16px' : '0' }}>
                          <div 
                            style={{ 
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#001749ff',
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              userSelect: 'none',
                              padding: '8px 12px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb'
                            }}
                            onClick={() => setExpandedTranscriptions(prev => ({
                              ...prev,
                              [index]: !isExpanded
                            }))}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            <span>Transcription #{index + 1}</span>
                            {transcription.createdAt && (
                              <span style={{ fontSize: '12px', fontWeight: '400', color: '#6b7280', marginLeft: 'auto' }}>
                                {new Date(transcription.createdAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {isExpanded && (
                            <div style={{
                              backgroundColor: '#ffffff',
                              padding: '16px',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb',
                              maxHeight: '400px',
                              overflowY: 'auto',
                              marginTop: '8px'
                            }}>
                              {renderTranscription(transcription.text, index, transcription.createdAt)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Closer Notes Section */}
            {closerNote ? (
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingRight: '40px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#001749ff' }}>
                    💼 Closer Notes
                  </h3>
                  {lead.timezone && (
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginRight: '30px' }}>
                      Timezone: {lead.timezone} ({DateHelpers.getUTCOffset(lead.timezone)})
                    </span>
                  )}
                </div>

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
                  placeholder="e.g., 20%"
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




