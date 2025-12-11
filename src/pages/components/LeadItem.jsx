import { supabase } from '../../lib/supabaseClient';
import {Modal, NotesModal, ViewNotesModal} from './Modal';
import { TransferSetterModal } from './TransferSetterModal';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Mail, Phone, User, Calendar, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import './LeadItem.css';

import * as DateHelpers from '../../utils/dateHelpers';
import * as ManychatService from '../../utils/manychatService';
import { buildCallDataFromLead, updateManychatCallFields, sendToCloserMC } from '../../utils/manychatService';

const formatStatusValue = (value) => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null || value === undefined) return 'null';
  return value;
};

 function callTimeColor(time, isRescheduled, called){
  if(isRescheduled && !called) return '#dd86ddff';
  if(!called) return '#cfcfcfff';
  if(time < 6) return '#88ff2dff';
  if(time < 15) return '#fdd329ff';
  if(time >= 15) return '#ff8b8bff';
  console.log("no color found", time, isRescheduled, called);
}

export function LeadItem({ lead, setterMap = {}, closerMap = {}, mode = 'full' }) {
  const location = useLocation();
const isLeadPage = location.pathname === '/lead' || location.pathname.startsWith('/lead/');
  // Add CSS for loading spinner animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const [pickUp, setPickUp] = useState(() => formatStatusValue(lead.picked_up));
  const [confirmed, setConfirmed] = useState(() => formatStatusValue(lead.confirmed));
  const [showUp, setShowUp] = useState(() => formatStatusValue(lead.showed_up));
  const [purchase, setPurchase] = useState(() => formatStatusValue(lead.purchased));
  const [setter, setSetter] = useState(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modeState, setModeState] = useState(mode);
  const [noteButtonText, setNoteButtonText] = useState();
  const [transferNote, setTransferNote] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [showTransferNoteModal, setShowTransferNoteModal] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [showConfirmCancelModal, setShowConfirmCancelModal] = useState(false);
  const [pendingConfirmedValue, setPendingConfirmedValue] = useState(null);
  const { setter: currentSetter } = useParams();  
  const navigate = useNavigate();

  // Toast function
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  const fetchTransferNote = async (callId) => {
    setLoadingNote(true);
    setShowTransferNoteModal(true);
    
    try {
      const { data, error } = await supabase
        .from('transfer_log')
        .select('note, transferred_by, created_at')
        .eq('call_id', callId)
        .order('created_at', { ascending: false })
      
      if (!error && data) {
        setTransferNote(data[0]?.note || 'No note provided');
      } else {
        setTransferNote('No note found');
      }
    } catch (err) {
      console.error('Error fetching transfer note:', err);
      setTransferNote('Error loading note');
    } finally {
      setLoadingNote(false);
    }
  };

  const handleCloseTransferNoteModal = () => {
    setShowTransferNoteModal(false);
    setTransferNote(null);
    setLoadingNote(false);
  };

  useEffect(() => {
    setPickUp(formatStatusValue(lead.picked_up));
    setConfirmed(formatStatusValue(lead.confirmed));
    setShowUp(formatStatusValue(lead.showed_up));
    setPurchase(formatStatusValue(lead.purchased));
    setSetter(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
    console.log("re-rendering values");
  }, [lead]);

  useEffect(() => {
    setNoteButtonText(mode === 'admin' ? "📝 Notes" : (mode === 'closer' ? lead.closer_note_id : lead.setter_note_id) ? "📝 Edit note" : "✚ Add note");
    setPurchase(formatStatusValue(lead.purchased));
  }, [showNoteModal]);

  const setterOptions = Object.entries(setterMap).map(([id, name]) => ({
    id,
    name,
  }));

  return (
    <div
      key={lead.id}
      className="lead-item-container"
    >
      <div className="lead-main-content">
        {/* Emoji Column */}
        <div className="lead-emoji-column">
          {(() => {
            const leadSource = lead.leads?.source || 'organic';
            const isAds = leadSource.toLowerCase().includes('ad') || leadSource.toLowerCase().includes('ads');
            const callCampaign = lead.utm_campaign;
            return (
              <>
                <span style={{ fontSize: '16px', lineHeight: '1.5' }}>{isAds ? '💰' : '🌱'}</span>
                {callCampaign === 'dm-setter' && (
                  <span style={{ fontSize: '16px', lineHeight: '1.5' }}>💬</span>
                )}
                {lead.is_reschedule && (
                  <span style={{ fontSize: '16px', lineHeight: '1.5' }}>🔁</span>
                )}
                {lead.cancelled && (
                  <span style={{ fontSize: '16px', lineHeight: '1.5' }}>❌</span>
                )}
              </>
            );
          })()}
        </div>
        
        <div className="lead-info-section">
          <h2 className="lead-name">
            <a href={`/lead/${lead.lead_id}`} 
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey) {  // ← Only prevent default for regular clicks
                  e.preventDefault();
                  navigate(`/lead/${lead.lead_id}`);
                }}}
              style={{ cursor: 'pointer', color: '#323232ff', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {lead.name || 'No name'}
            </a>
          </h2>
          <div className="lead-contact-info">
            <Mail size={12} style={{ }} />
            <a style={{ cursor: 'pointer', color: '#6b7280', textDecoration: 'none' }} href={`https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(lead.email)}`} target="_blank" rel="noopener noreferrer">
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.email || 'No email'}</span> </a>
          </div>
            <div className="lead-contact-info">
              <Phone size={12} />
              <span>
                <a
                  href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || lead.leads?.mc_id || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: (lead.manychat_user_id || lead.leads?.mc_id) ? '#6b7280' : 'red' }}
                >
                  {lead.phone || 'No phone'}
                </a>
              </span>
            </div>
        </div>

        <div className="status-dropdowns">
          <StatusDropdown
            value={pickUp}
            onChange={(value) => updateStatus(lead.id, 'picked_up', value, setPickUp, lead.manychat_user_id)}
            label="Pick Up"
            disabled={mode === 'closer' || mode === 'view'}
          />
          <StatusDropdown
            value={confirmed}
            onChange={(value) => {
              // If changing to "no" (false), show confirmation modal
              if (value === 'false' || value === false) {
                setPendingConfirmedValue(value);
                setShowConfirmCancelModal(true);
              } else {
                // For other values (yes/null), update directly
                updateStatus(lead.id, 'confirmed', value, setConfirmed, lead.manychat_user_id, lead);
              }
            }}
            label="Confirmed"
            disabled={mode === 'closer' || mode === 'view'}
          />
          <StatusDropdown
            value={showUp}
            onChange={(value) => updateStatus(lead.id, 'showed_up', value, setShowUp)}
            label="Show Up"
            disabled={mode === 'setter' || mode === 'view'}
          />
          <StatusDropdown
            value={purchase}

            onClick={() => {
              if (mode === 'closer' || mode === 'admin') {
                setModeState('closer');
                setShowNoteModal(true);
              }
            }}
            label="Purchased"
            disabled={mode === 'setter' || mode === 'view'}
          />
        </div>

        <div className="lead-meta-info">
          <div className="lead-meta-row">

{(mode !== 'setter' || isLeadPage) && (

            <div className="lead-user-info">
              <User size={12} />
              <span
                onClick={mode === "full" ? () => navigate(`/setter/${lead.setter_id}`) : undefined}
                style={{
                  cursor: mode ==="full" ? 'pointer': 'default',
                  color: '#001749ff',
                  textDecoration: 'none',
                  flex: '1 1 auto',
                  minWidth: 0
                }}
                onMouseEnter={(e) => {
                  if (mode !== "full") return;
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.fontWeight = '600';
                  e.currentTarget.style.transition = 'all 0.2s';
                }}
                onMouseLeave={(e) => {
                  if (mode !== "full") return;
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.fontWeight = '400';
                }}
              >
                Setter: {setterMap[setter] || 'N/A'}
              </span>
            </div>
  )}
      {(mode !== 'closer') && (
            <div className="lead-user-info">
              <User size={12} />
              <span
                onClick={mode ==="full" ? () => navigate(`/closer/${lead.closer_id}`) : undefined}
                style={{
                  cursor: mode === "full" ? 'pointer': 'default',
                  color: '#001749ff',
                  textDecoration: 'none',
                  flex: '1 1 auto',
                  minWidth: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}
                onMouseEnter={(e) => {
                  if (mode !== "full") return;
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.fontWeight = '600';
                  e.currentTarget.style.transition = 'all 0.2s';
                }}
                onMouseLeave={(e) => {
                  if (mode !== "full") return;
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.fontWeight = '400';
                }}
              >
                Closer: {closerMap[lead.closer_id] || 'N/A'}
              </span>
            </div> )}
          </div>
          
          <button
            onClick={() => (mode=== 'admin' || mode === "view") ? setViewModalOpen(true) : setShowNoteModal(true)}
            className={`lead-notes-button ${(lead.setter_note_id && mode !== 'closer') || (lead.closer_note_id && mode === 'closer') ? 'has-note' : ''}`}
          > 
            {(mode === "full" || mode === "view") ? "📝 Notes" : (noteButtonText) }
          </button>

          
        </div> 

        <div className="lead-timeline-info">

            {(mode === 'admin') && (
              <div className="lead-timeline-item">
                <Clock size={12} />
                <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.book_date) || 'N/A'}</span>
              </div>
            )}

           {(mode === 'closer' || mode === 'full' || mode === 'admin') && (
            <div className="lead-timeline-item">
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date)|| 'N/A'}</span>
            </div> )}

            {(mode === 'setter' ) && (
              <div className="lead-timeline-item">
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date, lead.timezone) + " " + DateHelpers.getUTCOffset(lead.timezone) || 'N/A'}</span>
            </div>)}

            {(lead.first_setter_id !== lead.setter_id) && ( lead.first_setter_id !== currentSetter)  && (mode === 'setter' || mode === 'admin') && (
              <span
                className="lead-transfer-info"
                onClick={() => fetchTransferNote(lead.id)}
              >
                From {setterMap[lead.first_setter_id] || 'N/As'}
              </span>
            )}

            {(lead.first_setter_id !== lead.setter_id) && ( lead.first_setter_id === currentSetter) && (
              <span 
                className="lead-transfer-info"
                onClick={() => fetchTransferNote(lead.id)}
              >
                Transferred to {setterMap[lead.setter_id] || 'N/A'}
              </span>
            )}

            {(mode !== 'closer' && mode !== 'admin') && (
            <div className="lead-timeline-item">
              <span>{DateHelpers.formatTimeAgo(lead.book_date)|| 'N/A'}</span>
            </div>)}
             {( mode !== 'closer') && (
              <a href={getZoomCallLogUrl(lead.phone, lead.book_date)} target="_blank" rel="noopener noreferrer">
             <span className="lead-status-badge" style={{backgroundColor: callTimeColor(lead.responseTimeMinutes, lead.is_reschedule, lead.called)}}>
              {lead.called ? (lead.responseTimeMinutes+ "m"): "Not called" }</span> </a>
              )}
              
              {(new Date() - new Date(lead.book_date)) < (2 * 60 * 60 * 1000) && (lead.confirmed === null) &&(
              <span className="lead-grace-period"> GRACE PERIOD (2H)</span>
              )}
            
          </div>


      </div>

  

      <TransferSetterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lead={lead}
        setterOptions={setterOptions}
        currentSetter={currentSetter}
        onTransfer={(newSetterId) => setSetter(newSetterId)}
      />


      <NotesModal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} lead={lead} callId={lead.id} mode={modeState} />
      
      <ViewNotesModal 
  isOpen={viewModalOpen} 
  onClose={() => setViewModalOpen(false)} 
  lead={lead}
  callId={lead.id}
/>

      <Modal isOpen={showTransferNoteModal} onClose={handleCloseTransferNoteModal}>
        <div style={{ padding: '20px', maxWidth: '500px' }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
            Transfer Note
          </h2>
          {loadingNote ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                border: '2px solid #e5e7eb', 
                borderTop: '2px solid #3b82f6', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite' 
              }}></div>
              <span>Loading transfer note...</span>
            </div>
          ) : (
            <div>
              <p style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                backgroundColor: '#f9fafb', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap',
                minHeight: '60px'
              }}>
                {transferNote}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCloseTransferNoteModal}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Confirmation Modal for Cancelling Confirmation */}
      <Modal isOpen={showConfirmCancelModal} onClose={() => {
        setShowConfirmCancelModal(false);
        setPendingConfirmedValue(null);
      }}>
        <div style={{ padding: '24px', maxWidth: '400px' }}>
          <h2 style={{ 
            marginBottom: '16px', 
            fontSize: '20px', 
            fontWeight: '600',
            color: '#111827'
          }}>
            Confirm Cancellation
          </h2>
          <p style={{ 
            marginBottom: '24px', 
            fontSize: '14px', 
            color: '#6b7280',
            lineHeight: '1.5'
          }}>
            Are you sure you want to <strong>cancel this call</strong>?
          </p>
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            justifyContent: 'flex-end' 
          }}>
            <button
              onClick={() => {
                setShowConfirmCancelModal(false);
                setPendingConfirmedValue(null);
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  // Cancel Calendly event if calendly_id exists
                  if (lead.calendly_id) {
                    try {
                      const response = await fetch('/api/cancel-calendly', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ eventUri: lead.calendly_id })
                      });

                      // If Calendly cancellation succeeded, set calls.cancelled to true in Supabase
                      if (response.ok) {
                        // Update Supabase "calls" table: set cancelled = true for this call
                        await supabase.from('calls').update({ cancelled: true }).eq('id', lead.id);
                        showToast('Call cancelled successfully!', 'success');
                      }

                      if (!response.ok) {
                        const error = await response.json();
                        console.error('Error canceling Calendly event:', error);
                        showToast('Call cancelled but Calendly cancellation failed', 'error');
                      } else {
                        console.log('Calendly event cancelled successfully');
                        showToast('Call and Calendly event cancelled', 'success');
                      }
                    } catch (calendlyError) {
                      console.error('Error calling Calendly cancellation API:', calendlyError);
                      showToast('Call cancelled but Calendly cancellation failed', 'error');
                    }
                  }

                  // Update confirmed status
                  if (pendingConfirmedValue !== null) {
                    updateStatus(lead.id, 'confirmed', pendingConfirmedValue, setConfirmed, lead.manychat_user_id);
                  }
                } catch (error) {
                  console.error('Error in cancellation process:', error);
                  showToast('Error cancelling call', 'error');
                }
                
                setShowConfirmCancelModal(false);
                setPendingConfirmedValue(null);
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </Modal>
        
        <div className="lead-menu-button">
          <ThreeDotsMenu
            onEdit={() => setIsModalOpen(true)}
            onDelete={() => console.log('Delete')}
            mode={mode}
            modalSetter={setShowNoteModal}
            setMode={setModeState}
            lead={lead}
            showToast={showToast}
          />
        </div>

        {/* Toast Notification */}
        {toast.show && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              zIndex: 10000,
              fontSize: '14px',
              fontWeight: '500',
              animation: 'slideIn 0.3s ease-out',
              maxWidth: '300px'
            }}
          >
            {toast.message}
          </div>
        )}

        <style>{`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>

    </div>
  );
}

  const updateStatus = async (id, field, value, setterF, mcID, leadData) => {

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

    const { error: mcError } = await ManychatService.updateManychatField(mcID, field, formattedValue);

    // When confirmed is set to true, create user in ManyChat
    if (field === 'confirmed' && formattedValue === true) {
      console.log('Creating ManyChat user for confirmed lead:', leadData);
      try {
        await sendToCloserMC({
          id: id,
          name: leadData.name,
          phone: leadData.phone,
          apiKey: leadData.closers?.mc_api_key,
          fieldsToSet: [
            { name: 'SETTER', value: leadData.setters?.name },
            { name: 'CLOSER', value: leadData.closers?.name },
            { name: 'CALL LINK', value: leadData.call_link },
            { name: 'DATE (LEAD TZ)', value: leadData.call_date && leadData.timezone
              ? new Date(leadData.call_date).toLocaleDateString('en-US', {
                  timeZone: leadData.timezone,
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                })
              : (leadData.call_date || '') + " (Tu fecha local)" },
            { name: 'CALL TIME (LEAD TZ)', 
              value: leadData.call_date && leadData.timezone
                ? new Date(leadData.call_date).toLocaleTimeString('en-US', {
                    timeZone: leadData.timezone,
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : (leadData.call_date || '') + " (Tu hora local)"
            }
          ]
        });
        console.log('✅ ManyChat user creation triggered for confirmed lead');
        alert('Lead confirmed and sent to closer');
      } catch (error) {
        console.error('❌ Error creating ManyChat user:', error);
        // Don't block the update if user creation fails
      }
    }

    if (error) {
      console.error('Error updating lead:', error);
      return;
    }
  };



  const StatusDropdown = ({ value, onChange, label, disabled = false, onClick = null}) => {

    // Get background color based on value
    const getBackgroundColor = () => {
      if (value === true || value === 'true') return '#cfffc5ff'; // green for true
      if (value === false || value === 'false') return '#ff9494ff'; // red for false
      if (value === null || value === '' || value === undefined || value === 'null') return '#f9ffa6ff'; // yellow for null/empty
      return '#f9ffa6ff';
    };
    
    return (
     <div style={{
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '1 1 80px'
}}
>
  <label style={{
    whiteSpace: 'nowrap',
    fontSize: 'clamp(7px, 1.5vw, 10px)',
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }}
>
    {label}
  </label>
  <select 
  value={String(value)}
  onChange={(e) => onChange(e.target.value)}
  disabled={disabled}
  style={{
    appearance: 'none',
    backgroundColor: getBackgroundColor(),
    color: '#000000',
    borderColor: '#d1d5db',
    border: '1px solid rgba(0,0,0,0.1)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.1s',
    outline: 'none',
    textAlign: 'center'
  }}
  
  onMouseEnter={(e) => {
    e.currentTarget.style.opacity = '0.8';
    e.currentTarget.style.borderColor = '#bcbec0ff';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.borderColor = '#d1d5db';
  }}
  onMouseDown={(e) => {
    if (onClick) {
      e.preventDefault(); // Prevent dropdown from opening
      onClick();
    }
  }}
  >
    <option value={"true"} style={{
      backgroundColor: '#cfffc5',
      padding: '12px',
      fontSize: '14px',
      fontWeight: '500'
    }}>YES</option>
    <option value={"false"}>NO</option>
    <option value={"null"}>TBD</option>
  </select>
</div>
    );
  };




const ThreeDotsMenu = ({ onEdit, onDelete, mode, setMode, modalSetter, lead, showToast}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <button
      onClick={() => setMenuOpen(!menuOpen)}
      style={{
        position: 'relative',
        alignSelf: 'flex-start',
        background: 'none',
        border: 'none',
        fontWeight: 'bold',
        cursor: 'pointer',
        padding: '0% 1.5%',
        marginTop: '-5px',
        fontSize: '18px',
        color: '#6b7280',
        marginLeft: '2%',
        outline: 'none'
      }}
    >
      ⋮
      
      {menuOpen && (
  <>
    <div style={{
      position: 'absolute',
      right: '0',
      top: '100%',
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      borderRadius: '4px',
      minWidth: '150px',
      zIndex: 1000
    }}>
      <button 
        onClick={(e) => { 
          e.stopPropagation();
          onEdit(); 
          setMenuOpen(false); 
        }}
        style={{
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          color: '#6b7280',
          fontWeight: '300',
          fontSize: '14px',
          outline: 'none'
        }}>
        Transfer
      </button>
      
      {(mode === 'closer' || mode === 'view' || mode === 'full') && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            modalSetter(true);
            setMode('setter');
            setMenuOpen(false); 
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            color: '#6b7280',
            fontWeight: '300',
            fontSize: '14px',
          outline: 'none'
          }}
        >
          Setter Notes
        </button>
      )}

      {(mode === 'setter' || mode === 'view' || mode === 'full') && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            modalSetter(true);
            setMode('closer');
            setMenuOpen(false); 
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            color: '#6b7280',
            fontWeight: '300',
            fontSize: '14px',
          outline: 'none'
          }}
        >
          Closer Notes
        </button>
      )}
      
      <button 
        onClick={async (e) => { 
          e.stopPropagation(); 
          if (lead) {
            try {
              // Get ManyChat subscriber ID
              const subscriberId = lead.leads?.mc_id || lead.manychat_user_id;
              
              if (!subscriberId) {
                console.error('No ManyChat subscriber ID found for this lead');
                alert('No ManyChat subscriber ID found for this lead');
                setMenuOpen(false);
                return;
              }

              // Build call data (setter and closer names come from joins)
              const callData = buildCallDataFromLead(lead);
              console.log('Sending to ManyChat:', { subscriberId, callData });
              
              // Send to ManyChat
              await updateManychatCallFields(subscriberId, callData);
              console.log('✅ Successfully sent to ManyChat');
              alert('Successfully sent to ManyChat!');
            } catch (error) {
              console.error('❌ Error sending to ManyChat:', error);
              alert('Error sending to ManyChat: ' + error.message);
            }
          }
          setMenuOpen(false); 
        }}
        style={{
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          color: '#3b82f6',
          fontWeight: '300',
          fontSize: '14px',
          outline: 'none'
        }}
      >
        Send to ManyChat
      </button>

      {(mode === 'admin' || mode === 'full') && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (lead) {
              const leadId = lead.lead_id || lead.id;
              if (leadId) {
                navigator.clipboard.writeText(leadId.toString()).then(() => {
                  console.log('Lead ID copied to clipboard:', leadId);
                  showToast('Lead ID copied to clipboard!', 'success');
                }).catch(err => {
                  console.error('Failed to copy:', err);
                  showToast('Failed to copy Lead ID', 'error');
                });
              } else {
                showToast('No Lead ID found', 'error');
              }
            }
            setMenuOpen(false); 
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            color: '#6b7280',
            fontWeight: '300',
            fontSize: '14px',
            outline: 'none'
          }}
        >
          Copy Lead ID
        </button>
      )}
      
      <button 
        onClick={(e) => { 
          e.stopPropagation(); 
          onDelete(); 
          setMenuOpen(false); 
        }}
        style={{
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          color: '#ef4444',
          fontWeight: '300',
          fontSize: '14px',
          outline: 'none'
        }}
      >
        Report
      </button>
    </div>
    
    <div
      onClick={(e) => {
        e.stopPropagation();
        setMenuOpen(false);
      }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 999
      }}
    />
  </>
)}

    </button>
  );
};




// compact version

export function LeadItemCompact({ lead, setterMap = {}, closerMap = {} }) {
  const navigate = useNavigate();
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [setter, setSetter] = useState(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
  const [transferNote, setTransferNote] = useState(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [showTransferNoteModal, setShowTransferNoteModal] = useState(false);
  const { setter: currentSetter } = useParams();

  const setterOptions = Object.entries(setterMap).map(([id, name]) => ({
    id,
    name,
  }));

  const fetchTransferNote = async (callId) => {
    setLoadingNote(true);
    setShowTransferNoteModal(true);
    
    try {
      const { data, error } = await supabase
        .from('transfer_log')
        .select('note, transferred_by, created_at, from_setter_id')
        .eq('call_id', callId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!error && data && data.length > 0) {
        setTransferNote(data[0]);
      } else {
        setTransferNote({ note: 'No note found' });
      }
    } catch (err) {
      console.error('Error fetching transfer note:', err);
      setTransferNote({ note: 'Error loading note' });
    } finally {
      setLoadingNote(false);
    }
  };

  const handleCloseTransferNoteModal = () => {
    setShowTransferNoteModal(false);
    setTransferNote(null);
    setLoadingNote(false);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 2fr 1.5fr 1.2fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.8fr',
        gap: '16px',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '14px',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      {/* Emoji Column */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'flex-start',
        gap: '4px',
        paddingTop: '2px'
      }}>
        {(() => {
          const leadSource = lead.leads?.source || 'organic';
          const isAds = leadSource.toLowerCase().includes('ad') || leadSource.toLowerCase().includes('ads');
          const callCampaign = lead.utm_campaign;
          return (
            <>
              <span style={{ fontSize: '14px', lineHeight: '1.2' }}>{isAds ? '💰' : '🌱'}</span>
              {callCampaign === 'dm-setter' && (
                <span style={{ fontSize: '14px', lineHeight: '1.2' }}>💬</span>
              )}
              {lead.is_reschedule && (
                <span style={{ fontSize: '14px', lineHeight: '1.2' }}>🔄</span>
              )}
              {lead.cancelled && (
                <span style={{ fontSize: '14px', lineHeight: '1.2' }}>❌</span>
              )}
            </>
          );
        })()}
      </div>
      
      {/* Name & Contact */}
      <div style={{ overflow: 'hidden', flex: 1 }}>
      <a
  href={`/lead/${lead.lead_id}`} target="_blank" 
  onClick={(e) => {
    if (!e.metaKey && !e.ctrlKey) {  // ← Only prevent default for regular clicks
      e.preventDefault();
      navigate(`/lead/${lead.lead_id}`);
    }}}
          style={{
            fontWeight: '600',
            color: '#111827',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '2px'
          }}
        >
          {lead.name || 'No name'}
        </a>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}> <a style={{ color: '#6b7280', textDecoration: 'none' }} href={`https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(lead.email)}`} target="_blank" rel="noopener noreferrer">
          {lead.email || 'No email'}
          </a>
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: '2px'
        }}>
          <Phone size={12} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
          <a
            href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || lead.leads?.mc_id || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: (lead.manychat_user_id || lead.leads?.mc_id) ? '#6b7280' : 'red', textDecoration: 'none' }}
          >
            {lead.phone || 'No phone'}
          </a>
        </div>
      </div>

      {/* Setter */}
      <div
        onClick={() => navigate(`/setter/${lead.setter_id}`)}
        style={{
          color: '#001749ff',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        {setterMap[lead.setter_id] || 'N/A'}
        {lead.first_setter_id && lead.setter_id && lead.first_setter_id !== lead.setter_id && (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              fetchTransferNote(lead.id);
            }}
            style={{ 
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            title="View transfer note"
          >📩</span>
        )}
      </div>

      {/* Closer */}
      <div
        onClick={() => navigate(`/closer/${lead.closer_id}`)}
        style={{
          color: '#001749ff',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {closerMap[lead.closer_id] || 'N/A'}
      </div>

      {/* Call Date */}
      <div style={{ fontSize: '13px', color: '#6b7280' }}>
        {DateHelpers.formatTimeWithRelative(lead.call_date) || 'N/A'}
      </div>
      {/* Call Date */}
      <div style={{ fontSize: '13px', color: '#6b7280' }}>
        {DateHelpers.formatTimeWithRelative(lead.book_date) || 'N/A'}
      </div>

      {/* Status Indicators */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <StatusBadge value={lead.picked_up} label="P" title="Picked Up" />
        <StatusBadge value={lead.confirmed} label="C" title="Confirmed" />
        <StatusBadge value={lead.showed_up} label="S" title="Showed Up" />
        <StatusBadge value={lead.purchased} label="$" title="Purchased" />
      </div>

      {/* Response Time */}
      <div style={{ textAlign: 'center' }}>
        <a href={getZoomCallLogUrl(lead.phone, lead.book_date)} target="_blank" rel="noopener noreferrer">
        <span style={{
          backgroundColor: callTimeColor(lead.responseTimeMinutes, lead.is_reschedule, lead.called),
          color: '#343434ff',
          fontWeight: '600',
          borderRadius: '4px',
          padding: '2px 8px',
          fontSize: '12px'
        }}>
          {lead.called ? `${lead.responseTimeMinutes}m` : 'Not called'}
        </span>
        </a>
      </div>

      {/*  Notes */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
      <button
  onClick={() => setViewModalOpen(true)}
  style={{
    padding: '5px 0px',
    backgroundColor: (lead.setter_note_id) || (lead.closer_note_id) ? '#7053d0ff' : '#3f2f76ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap', // Prevents text wrapping
    width: '80%'
  }}>  📝 Notes </button>
    </div>

    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>

          {/*  Three dot menu */}

                  <ThreeDotsMenu
    onEdit={() => setIsModalOpen(true)}
    onDelete={() => console.log('Delete')}
    mode={'full'}
    lead={lead}
  />

  </div>


          <ViewNotesModal 
  isOpen={viewModalOpen} 
  onClose={() => setViewModalOpen(false)} 
  lead={lead}
  callId={lead.id}
/>

<TransferSetterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lead={lead}
        setterOptions={setterOptions}
        currentSetter={currentSetter}
        onTransfer={(newSetterId) => setSetter(newSetterId)}
      />

      <Modal isOpen={showTransferNoteModal} onClose={handleCloseTransferNoteModal}>
        <div style={{ padding: '20px', maxWidth: '500px' }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
            Transfer Note
            {transferNote?.from_setter_id && (
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px', fontWeight: 400 }}>
                From: <span style={{ fontWeight: 500 }}>{setterMap[transferNote.from_setter_id] || 'Unknown'}</span>
              </div>
            )}
            {transferNote?.created_at && (
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                Date: <span style={{ fontWeight: 500 }}>{DateHelpers.formatTimeWithRelative(transferNote.created_at)}</span>
              </div>
            )}
          </h2>
          {loadingNote ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px' }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                border: '2px solid #e5e7eb', 
                borderTop: '2px solid #3b82f6', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite' 
              }}></div>
              <span>Loading transfer note...</span>
            </div>
          ) : (
            <div>
              <p style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                backgroundColor: '#f9fafb', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap',
                minHeight: '60px'
              }}>
                {transferNote?.note || transferNote || 'No note provided'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCloseTransferNoteModal}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      
    </div>
  );
}

// Helper component for status badges
function StatusBadge({ value, label, title }) {
  const getColor = () => {
    if (value === true) return '#10b981'; // green
    if (value === false) return '#ef4444'; // red
    return '#f59e0b'; // yellow for null/TBD
  };

  return (
    <div
      title={title}
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '4px',
        backgroundColor: getColor(),
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: '600'
      }}
    >
      {label}
    </div>
  );
}

// Add header component to use with the list
export function LeadListHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.5fr 1.2fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.8fr',
        gap: '16px',
        padding: '12px 16px',
        backgroundColor: '#f3f4f6',
        borderBottom: '2px solid #e5e7eb',
        fontSize: '12px',
        fontWeight: '600',
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}
    >
      <div>Name / Email</div>
      <div>Setter</div>
      <div>Closer</div>
      <div>Call Date</div>
      <div style={{ textAlign: 'left' }}>Book Date</div>
      <div style={{ textAlign: 'left' }}>Status</div>
      <div style={{ textAlign: 'center' }}>Response</div>
      <div style={{ textAlign: 'center' }}>Notes</div>

    </div>
  );
}

const fetchTransferNote = async (leadId, setTransferNote, setLoadingNote) => {
  setLoadingNote(true);
  const { data, error } = await supabase
    .from('transfer_log')
    .select('*')
    .eq('call_id', leadId)
    .single();
  if (error) {
    console.error('Error fetching transfer note:', error);
    setTransferNote("No note found");
    setLoadingNote(false);
    return;
  }
  setTransferNote(data.note);
  setLoadingNote(false);
  return data;
}


function getZoomCallLogUrl(phone, bookDate) {
  if (!phone || !bookDate) return '#';

  // Calculate "from" date: one day before bookDate
  const fromDate = new Date(bookDate);
  fromDate.setDate(fromDate.getDate() - 1);

  // "to" date: one month ahead of bookDate
  const toDate = new Date(bookDate);
  toDate.setMonth(toDate.getMonth() + 1);

  // Format dates as YYYY-M-D (no zero padding)
  const from = `${fromDate.getFullYear()}-${fromDate.getMonth() + 1}-${fromDate.getDate()} `;
  const to = `${toDate.getFullYear()}-${toDate.getMonth() + 1}-${toDate.getDate()} `;

  // Clean phone number
  const phoneCleaned = '+' + phone.toString().replace(/\D/g, '');

  return `https://us06web.zoom.us/pbx/page/telephone/callLog#/recording-list?page_size=15&page_number=1&recordingReport=0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&keyword=${encodeURIComponent(phoneCleaned)}`;
}