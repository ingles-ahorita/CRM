import { supabase } from '../../lib/supabaseClient';
import {Modal, NotesModal, ViewNotesModal} from './Modal';
import { TransferSetterModal } from './TransferSetterModal';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Phone, User, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';

import * as DateHelpers from '../../utils/dateHelpers';
import * as ManychatService from '../../utils/manychatService';

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
  if(time > 15) return '#ff8b8bff';
}

export function LeadItem({ lead, setterMap = {}, closerMap = {}, mode = 'full' }) {
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
  const { setter: currentSetter } = useParams();  
  const navigate = useNavigate();

  useEffect(() => {
    setPickUp(formatStatusValue(lead.picked_up));
    setConfirmed(formatStatusValue(lead.confirmed));
    setShowUp(formatStatusValue(lead.showed_up));
    setPurchase(formatStatusValue(lead.purchased));
    setSetter(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
  }, [lead]);

  useEffect(() => {
    setNoteButtonText((mode === 'closer' ? lead.closer_note_id : lead.setter_note_id) ? "📝 Edit note" : "✚ Add note");
  }, [showNoteModal]);

  const setterOptions = Object.entries(setterMap).map(([id, name]) => ({
    id,
    name,
  }));

  return (
    <div
      key={lead.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        minHeight: '80px',
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '16px',
        paddingRight: '0px',
        transition: 'box-shadow 0.2s',
        width: '100%'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '35px', justifyContent: 'left', flexWrap: 'nowrap', overflow: 'hidden', flex: '1 1' }}>
        <div style={{ flex: '1 1 200px', overflow: 'hidden', alignItems: 'top', justifyContent: 'left' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', marginBottom: '4px', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px', textAlign: 'left' }}>
            <a
              onClick={() => navigate(`/lead/${lead.lead_id}`)}
              style={{ cursor: 'pointer', color: '#323232ff', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {lead.name || 'No name'} {(lead.is_reschedule) && <div style={{
                                                                          display: 'inline',
                                                                          fontSize: '11px',
                                                                          color: '#8c0bf5ff',
                                                                          fontWeight: '600',
                                                                          marginLeft: '5%', 
                                                                          overflow: 'hidden',
    textOverflow: 'ellipsis'}}> Reschedule</div>} {(lead.cancelled) && <div style={{
                                                                          display: 'inline',
                                                                          fontSize: '11px',
                                                                          color: '#f7371aff',
                                                                          fontWeight: '600',
                                                                          marginLeft: '5%', 
                                                                          overflow: 'hidden',
    textOverflow: 'ellipsis'}}>Cancelled</div>}
            </a>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#6b7280', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Mail size={12} style={{ }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.email || 'No email'}</span>
          </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#6b7280', gap: '4px' }}>
              <Phone size={12} />
              <span>
                <a
                  href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#6b7280' }}
                >
                  {lead.phone || 'No phone'}
                </a>
              </span>
            </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'left', flex: '1 1' }}>
          <StatusDropdown
            value={pickUp}
            onChange={(value) => updateStatus(lead.id, 'picked_up', value, setPickUp, lead.manychat_user_id)}
            label="Pick Up"
            disabled={mode === 'closer' || mode === 'view'}
          />
          <StatusDropdown
            value={confirmed}
            onChange={(value) => updateStatus(lead.id, 'confirmed', value, setConfirmed, lead.manychat_user_id)}
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
            onChange={(value) => updateStatus(lead.id, 'purchased', value, setPurchase)}
            label="Purchased"
            disabled={mode === 'setter' || mode === 'view'}
          />
        </div>

        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280', paddingLeft: '20px', borderLeft: '1px solid #e5e7eb', maxWidth: '200px', fontWeight: '400', flexDirection: 'column', flex: '1 1', marginLeft: 'auto'}}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

{(mode !== 'setter') && (

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0}}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0}}>
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
  onClick={() => (mode=== 'full' || mode === "view") ? setViewModalOpen(true) : setShowNoteModal(true)}
  style={{
    padding: '5px 0px',
    backgroundColor: (lead.setter_note_id && mode !== 'closer') || (lead.closer_note_id && mode === 'closer') ? '#7053d0ff' : '#3f2f76ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap', // Prevents text wrapping
    width: '80%'
  }}> {(mode === "full" || mode === "view") ? "📝 Notes" : (noteButtonText) }</button>

          
        </div> 

        <div style={{ display: 'flex', flex: '1 1', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', color: '#6b7280',fontSize: '12px', marginLeft: '0 auto'  }}>

           {(mode === 'closer' || mode === 'full' || mode === 'view') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date)|| 'N/A'}</span>
            </div> )}

            {(mode === 'setter' ) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date, lead.timezone) + " " + DateHelpers.getUTCOffset(lead.timezone) || 'N/A'}</span>
            </div>)}

            {(lead.first_setter_id !== lead.setter_id) && ( lead.first_setter_id !== currentSetter) && (
              <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic', marginTop: '-4px' }}> From {setterMap[lead.first_setter_id] || 'N/A'} </span>
            )}

            {(lead.first_setter_id !== lead.setter_id) && ( lead.first_setter_id === currentSetter) && (
              <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic', marginTop: '-4px' }}> Transferred to {setterMap[lead.setter_id] || 'N/A'} </span>
            )}

            {(mode !== 'closer') && (
            <div style={{ display: 'flex', alignSelf: 'flex-end', gap: '4px' }}>
              <span>{DateHelpers.formatTimeAgo(lead.book_date) || 'N/A'}</span>
            </div>)}

              <span style={{backgroundColor: callTimeColor(lead.responseTimeMinutes, lead.is_reschedule, lead.called), color: '#343434ff', fontWeight: "600", borderRadius: '5px', padding: '1px 4px' }}> {lead.called ? (lead.responseTimeMinutes+ "m"): "Not called" }</span>
              {(new Date() - new Date(lead.book_date)) < (2 * 60 * 60 * 1000) && (
              <span style={{backgroundColor: "#24c5ffff", color: '#ffffffff', fontWeight: "600", borderRadius: '5px', padding: '1px 4px', overflow: 'hidden', whiteSpace: 'nowrap' }}> GRACE PERIOD (2H)</span>
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
        
        <ThreeDotsMenu
    onEdit={() => setIsModalOpen(true)}
    onDelete={() => console.log('Delete')}
    mode={mode}
    modalSetter={setShowNoteModal}
    setMode={setModeState}
  />

    </div>
  );
}

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

    const { error: mcError } = await ManychatService.updateManychatField(mcID, field, formattedValue);

    if (error) {
      console.error('Error updating lead:', error);
      return;
    }
  };



  const StatusDropdown = ({ value, onChange, label, disabled = false}) => {

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




const ThreeDotsMenu = ({ onEdit, onDelete, mode, setMode,  modalSetter}) => {
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
  const { setter: currentSetter } = useParams();

  const setterOptions = Object.entries(setterMap).map(([id, name]) => ({
    id,
    name,
  }));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.5fr 1.2fr 1.2fr 1.2fr 1fr 1fr 0.8fr 0.8fr',
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
      {/* Name & Contact */}
      <div style={{ overflow: 'hidden' }}>
        <div
          onClick={() => navigate(`/lead/${lead.lead_id}`)}
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
          {lead.is_reschedule && (
            <span style={{ 
              fontSize: '10px', 
              color: '#8c0bf5ff', 
              fontWeight: '600', 
              marginLeft: '8px' 
            }}>
              Rescheduled
            </span>
          )}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {lead.email || 'No email'}
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
          textOverflow: 'ellipsis'
        }}
      >
        {setterMap[lead.setter_id] || 'N/A'}
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